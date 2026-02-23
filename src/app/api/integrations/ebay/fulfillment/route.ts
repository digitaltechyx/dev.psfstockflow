import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getValidEbayToken, getEbayApiBaseUrl } from "@/lib/ebay-api";

export const dynamic = "force-dynamic";

function isAdminOrSubAdmin(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const role = data.role as string;
  const roles = data.roles as string[] | undefined;
  return role === "admin" || role === "sub_admin" || (Array.isArray(roles) && (roles.includes("admin") || roles.includes("sub_admin")));
}

/**
 * POST: create shipping fulfillment for an eBay order (mark shipped, optional tracking).
 * Body: { orderId, lineItems: [{ lineItemId, quantity }], shippingCarrierCode?, trackingNumber?, shippedDate?, userId? (admin only) }
 */
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

  const body = await request.json().catch(() => ({}));
  const bodyUserId = typeof body.userId === "string" ? body.userId.trim() : undefined;
  const uid = bodyUserId && isAdmin ? bodyUserId : callerUid;
  if (uid !== callerUid && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conn = await getValidEbayToken(uid);
  if (!conn) {
    return NextResponse.json(
      { error: "No eBay connection. Connect your eBay account first." },
      { status: 400 }
    );
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const lineItems = Array.isArray(body.lineItems)
    ? body.lineItems.filter(
        (li: unknown) =>
          li &&
          typeof li === "object" &&
          typeof (li as { lineItemId?: unknown }).lineItemId === "string" &&
          typeof (li as { quantity?: unknown }).quantity === "number"
      )
    : [];
  const shippingCarrierCode =
    typeof body.shippingCarrierCode === "string" ? body.shippingCarrierCode.trim() : undefined;
  const trackingNumber =
    typeof body.trackingNumber === "string" ? body.trackingNumber.trim().replace(/\s/g, "") : undefined;
  const shippedDate =
    typeof body.shippedDate === "string" ? body.shippedDate.trim() : undefined;

  if (!orderId || lineItems.length === 0) {
    return NextResponse.json(
      { error: "orderId and lineItems (with lineItemId and quantity) are required" },
      { status: 400 }
    );
  }
  if (trackingNumber && !shippingCarrierCode) {
    return NextResponse.json(
      { error: "shippingCarrierCode is required when trackingNumber is provided" },
      { status: 400 }
    );
  }
  if (shippingCarrierCode && !trackingNumber) {
    return NextResponse.json(
      { error: "trackingNumber is required when shippingCarrierCode is provided" },
      { status: 400 }
    );
  }

  const base = getEbayApiBaseUrl(conn.isSandbox);
  const payload: {
    lineItems: Array<{ lineItemId: string; quantity: number }>;
    shippingCarrierCode?: string;
    trackingNumber?: string;
    shippedDate?: string;
  } = {
    lineItems: lineItems.map((li: { lineItemId: string; quantity: number }) => ({
      lineItemId: li.lineItemId,
      quantity: li.quantity,
    })),
  };
  if (shippingCarrierCode) payload.shippingCarrierCode = shippingCarrierCode;
  if (trackingNumber) payload.trackingNumber = trackingNumber;
  if (shippedDate) payload.shippedDate = shippedDate;

  const url = `${base}/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": "en-US",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[ebay fulfillment create]", res.status, err);
      return NextResponse.json(
        { error: "eBay fulfillment request failed", detail: (err as { errors?: unknown }).errors },
        { status: 502 }
      );
    }
    const data = (await res.json().catch(() => ({}))) as { fulfillmentId?: string };
    return NextResponse.json({ ok: true, fulfillmentId: data.fulfillmentId });
  } catch (err: unknown) {
    console.error("[ebay fulfillment]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fulfillment failed" },
      { status: 500 }
    );
  }
}
