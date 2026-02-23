import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getValidEbayToken, getEbayApiBaseUrl } from "@/lib/ebay-api";

export const dynamic = "force-dynamic";

const ORDERS_PAGE_SIZE = 50;
const MAX_ORDER_PAGES = 20; // cap ~1000 orders per sync

type EbayLineItem = {
  lineItemId?: string;
  legacyItemId?: string;
  sku?: string;
  title?: string;
  quantity?: number;
  lineItemFulfillmentStatus?: string;
};

type EbayOrder = {
  orderId?: string;
  creationDate?: string;
  lastModifiedDate?: string;
  orderFulfillmentStatus?: string;
  orderPaymentStatus?: string;
  lineItems?: EbayLineItem[];
  buyer?: { email?: string; fullName?: string };
};

type OrderSearchResponse = {
  orders?: EbayOrder[];
  next?: string;
  total?: number;
};

function isAdminOrSubAdmin(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const role = data.role as string;
  const roles = data.roles as string[] | undefined;
  return role === "admin" || role === "sub_admin" || (Array.isArray(roles) && (roles.includes("admin") || roles.includes("sub_admin")));
}

/** GET: list eBay orders from Firestore. Query: userId (admin only). Default: caller's orders. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let callerUid: string;
  let isAdmin = false;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    callerUid = decoded.uid;
    if (!callerUid) throw new Error("No uid");
    const userDoc = await adminDb().collection("users").doc(callerUid).get();
    isAdmin = isAdminOrSubAdmin(userDoc.data());
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("userId")?.trim() || callerUid;
  if (uid !== callerUid && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const snapshot = await adminDb()
      .collection("users")
      .doc(uid)
      .collection("ebayOrders")
      .orderBy("creationDate", "desc")
      .limit(200)
      .get();

    const orders = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    return NextResponse.json({ orders });
  } catch (err: unknown) {
    console.error("[ebay orders GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

/** POST: sync eBay orders (getOrders from eBay, filter by selected listings, save to Firestore). Query: userId (admin only). */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let callerUid: string;
  let isAdmin = false;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    callerUid = decoded.uid;
    if (!callerUid) throw new Error("No uid");
    const userDoc = await adminDb().collection("users").doc(callerUid).get();
    isAdmin = isAdminOrSubAdmin(userDoc.data());
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const uid = searchParams.get("userId")?.trim() || callerUid;
  if (uid !== callerUid && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conn = await getValidEbayToken(uid);
  if (!conn) {
    return NextResponse.json(
      { error: "No eBay connection. Connect your eBay account in Integrations first." },
      { status: 400 }
    );
  }

  const db = adminDb();
  const connectionSnap = await db
    .collection("users")
    .doc(uid)
    .collection("ebayConnections")
    .limit(1)
    .get();
  if (connectionSnap.empty) {
    return NextResponse.json({ error: "No eBay connection" }, { status: 400 });
  }
  const connectionData = connectionSnap.docs[0].data();
  const selectedListingIds = Array.isArray(connectionData.selectedListingIds)
    ? connectionData.selectedListingIds as string[]
    : [];
  const selectedSet = new Set(selectedListingIds);

  const base = getEbayApiBaseUrl(conn.isSandbox);
  const ordersCol = db.collection("users").doc(uid).collection("ebayOrders");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${conn.accessToken}`,
    "Content-Type": "application/json",
    "Accept-Language": "en-US",
    "Content-Language": "en-US",
  };

  let totalFetched = 0;
  let totalSaved = 0;
  let nextUrl: string | null = `${base}/sell/fulfillment/v1/order?limit=${ORDERS_PAGE_SIZE}`;
  const filter = request.nextUrl.searchParams.get("filter");
  if (filter === "not_started") {
    nextUrl = `${base}/sell/fulfillment/v1/order?limit=${ORDERS_PAGE_SIZE}&filter=orderfulfillmentstatus%3A%7BNOT_STARTED%7CIN_PROGRESS%7D`;
  }

  try {
    for (let page = 0; page < MAX_ORDER_PAGES && nextUrl; page++) {
      const res = await fetch(nextUrl, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[ebay orders getOrders]", res.status, err);
        return NextResponse.json(
          { error: "Failed to fetch eBay orders", detail: (err as { errors?: unknown }).errors },
          { status: 502 }
        );
      }
      const data = (await res.json()) as OrderSearchResponse;
      const orders = data.orders ?? [];
      totalFetched += orders.length;

      for (const order of orders) {
        const orderId = order.orderId;
        if (!orderId) continue;

        const lineItems = order.lineItems ?? [];
        const selectedItems = selectedSet.size === 0
          ? lineItems
          : lineItems.filter(
              (li) => li.legacyItemId && selectedSet.has(String(li.legacyItemId))
            );
        if (selectedItems.length === 0) continue;

        const batch: Record<string, unknown> = {
          orderId,
          creationDate: order.creationDate ?? null,
          lastModifiedDate: order.lastModifiedDate ?? null,
          orderFulfillmentStatus: order.orderFulfillmentStatus ?? null,
          orderPaymentStatus: order.orderPaymentStatus ?? null,
          buyer: order.buyer
            ? {
                email: order.buyer.email,
                fullName: order.buyer.fullName,
              }
            : null,
          lineItems: selectedItems.map((li) => ({
            lineItemId: li.lineItemId,
            legacyItemId: li.legacyItemId,
            sku: li.sku,
            title: li.title,
            quantity: li.quantity,
            lineItemFulfillmentStatus: li.lineItemFulfillmentStatus,
          })),
          syncedAt: new Date().toISOString(),
        };

        await ordersCol.doc(orderId).set(batch, { merge: true });
        totalSaved++;
      }

      nextUrl = data.next ?? null;
      if (orders.length < ORDERS_PAGE_SIZE) break;
    }

    return NextResponse.json({
      ok: true,
      totalFetched,
      totalSaved,
    });
  } catch (err: unknown) {
    console.error("[ebay orders sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
