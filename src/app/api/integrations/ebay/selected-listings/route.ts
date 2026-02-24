import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminFieldValue } from "@/lib/firebase-admin";
import { getValidEbayToken, getEbayApiBaseUrl } from "@/lib/ebay-api";

export const dynamic = "force-dynamic";

const MAX_OFFERS_TO_RESOLVE = 100;
const EBAY_INVENTORY_SOURCE = "ebay";
type SelectedListingMeta = {
  id: string;
  offerId?: string;
  listingId?: string;
  title?: string;
  sku?: string;
  status?: string;
  quantity?: number;
  source?: "inventory" | "trading";
};

/** GET: return selected offer IDs for the user's eBay connection. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    uid = decoded.uid;
    if (!uid) throw new Error("No uid");
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const connectionId = request.nextUrl.searchParams.get("connectionId");

  try {
    const col = adminDb().collection("users").doc(uid).collection("ebayConnections");
    let data: Record<string, unknown> = {};
    if (connectionId) {
      const snap = await col.doc(connectionId).get();
      if (!snap.exists) return NextResponse.json({ selectedOfferIds: [] });
      data = snap.data() ?? {};
    } else {
      const snapshot = await col.limit(1).get();
      if (snapshot.empty) return NextResponse.json({ selectedOfferIds: [] });
      data = snapshot.docs[0].data() ?? {};
    }
    const selectedOfferIds = Array.isArray(data.selectedOfferIds) ? data.selectedOfferIds : [];
    const selectedListingIds = Array.isArray(data.selectedListingIds) ? data.selectedListingIds : [];
    const selectedListings = Array.isArray(data.selectedListings) ? data.selectedListings : [];
    return NextResponse.json({ selectedOfferIds, selectedListingIds, selectedListings });
  } catch (err: unknown) {
    console.error("[ebay selected-listings GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}

/** POST: save selected offer IDs for the user's eBay connection. */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    uid = decoded.uid;
    if (!uid) throw new Error("No uid");
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const offerIds = Array.isArray(body.offerIds)
    ? Array.from(new Set(body.offerIds.filter((id: unknown) => typeof id === "string")))
    : [];
  const listingIdsFromClient = Array.isArray(body.listingIds)
    ? body.listingIds.filter((id: unknown) => typeof id === "string")
    : [];
  const selectedListingsFromClient: SelectedListingMeta[] = Array.isArray(body.selectedListings)
    ? body.selectedListings
        .filter((x: unknown) => x && typeof x === "object")
        .map((x) => x as Record<string, unknown>)
        .map((x) => {
          const listingId = typeof x.listingId === "string" ? x.listingId.trim() : undefined;
          const offerId = typeof x.offerId === "string" ? x.offerId.trim() : undefined;
          const id =
            (typeof x.id === "string" && x.id.trim()) ||
            listingId ||
            offerId ||
            "";
          const title = typeof x.title === "string" ? x.title : "";
          const sku = typeof x.sku === "string" ? x.sku : "";
          const status = typeof x.status === "string" ? x.status : "";
          const parsedQuantity =
            typeof x.quantity === "number"
              ? x.quantity
              : typeof x.quantity === "string"
                ? Number(x.quantity)
                : NaN;
          const quantity = Number.isFinite(parsedQuantity) && parsedQuantity >= 0 ? parsedQuantity : undefined;
          const source: "inventory" | "trading" = x.source === "trading" ? "trading" : "inventory";
          return {
            id,
            ...(offerId ? { offerId } : {}),
            ...(listingId ? { listingId } : {}),
            ...(title ? { title } : {}),
            ...(sku ? { sku } : {}),
            ...(status ? { status } : {}),
            ...(typeof quantity === "number" ? { quantity } : {}),
            source,
          } as SelectedListingMeta;
        })
        .filter((x) => x.id)
    : [];
  const connectionId = typeof body.connectionId === "string" ? body.connectionId.trim() : undefined;

  try {
    const col = adminDb().collection("users").doc(uid).collection("ebayConnections");
    let docRef;
    if (connectionId) {
      const snap = await col.doc(connectionId).get();
      if (!snap.exists) {
        return NextResponse.json(
          { error: "No eBay connection found" },
          { status: 400 }
        );
      }
      docRef = snap.ref;
    } else {
      const snapshot = await col.limit(1).get();
      if (snapshot.empty) {
        return NextResponse.json(
          { error: "No eBay connection found" },
          { status: 400 }
        );
      }
      docRef = snapshot.docs[0].ref;
    }

    // Resolve listingIds for selected offers (for order filtering). Cap to avoid timeout.
    const conn = await getValidEbayToken(uid, connectionId);
    const listingIds: string[] = [...listingIdsFromClient];
    if (conn && offerIds.length > 0) {
      const base = getEbayApiBaseUrl(conn.isSandbox);
      const toResolve = offerIds.slice(0, MAX_OFFERS_TO_RESOLVE);
      const results = await Promise.all(
        toResolve.map(async (offerId) => {
          const res = await fetch(`${base}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, {
            headers: {
              Authorization: `Bearer ${conn.accessToken}`,
              "Accept-Language": "en-US",
              "Content-Language": "en-US",
            },
          });
          if (!res.ok) return null;
          const data = (await res.json().catch(() => null)) as { listing?: { listingId?: string } };
          return data?.listing?.listingId ?? null;
        })
      );
      results.forEach((id) => {
        if (id) listingIds.push(id);
      });
    }

    const dedupedListingIds = Array.from(new Set(listingIds.filter(Boolean)));

    const selectedListingsMap = new Map<string, SelectedListingMeta>();
    for (const row of selectedListingsFromClient) {
      selectedListingsMap.set(row.id, row);
    }

    const connId = docRef.id;
    await docRef.update({
      selectedOfferIds: offerIds,
      selectedListingIds: dedupedListingIds,
      selectedListings: Array.from(selectedListingsMap.values()),
    });

    // Sync selected eBay listings into user inventory (like Shopify): create/update inventory docs and lookup for auto-update + admin restock.
    const FieldValue = adminFieldValue();
    const invRef = adminDb().collection("users").doc(uid).collection("inventory");
    const lookupRef = adminDb().collection("ebayInventoryLookup");
    const selectedIds = new Set(selectedListingsMap.keys());

    for (const row of selectedListingsMap.values()) {
      const quantity = typeof row.quantity === "number" ? row.quantity : 0;
      const listingStatus = (row.status || "").toLowerCase();
      const status = listingStatus.includes("active") || listingStatus.includes("published") ? "In Stock" : "Out of Stock";
      const docId = `ebay_${connId}_${row.id}`.replace(/\s/g, "_");
      const inventoryPath = `users/${uid}/inventory/${docId}`;

      await invRef.doc(docId).set(
        {
          productName: row.title || row.id,
          sku: row.sku || row.id,
          quantity,
          status,
          dateAdded: FieldValue.serverTimestamp(),
          source: EBAY_INVENTORY_SOURCE,
          ebayConnectionId: connId,
          ...(row.offerId ? { ebayOfferId: row.offerId } : {}),
          ...(row.listingId ? { ebayListingId: row.listingId } : {}),
        },
        { merge: true }
      );

      const lookupId = `${uid}_${connId}_${row.id}`.replace(/\s/g, "_");
      await lookupRef.doc(lookupId).set(
        {
          userId: uid,
          connectionId: connId,
          inventoryPath,
          listingKey: row.id,
          ...(row.offerId ? { offerId: row.offerId } : {}),
          ...(row.listingId ? { listingId: row.listingId } : {}),
        },
        { merge: true }
      );
    }

    // Remove inventory docs and lookups for this connection that are no longer selected
    const prefix = `ebay_${connId}_`;
    const existingEbay = await invRef.where("source", "==", EBAY_INVENTORY_SOURCE).where("ebayConnectionId", "==", connId).get();
    for (const d of existingEbay.docs) {
      const key = d.id.startsWith(prefix) ? d.id.slice(prefix.length) : d.id;
      if (!selectedIds.has(key)) {
        await d.ref.delete();
        const lookupId = `${uid}_${connId}_${key}`.replace(/\s/g, "_");
        await lookupRef.doc(lookupId).delete();
      }
    }

    return NextResponse.json({
      ok: true,
      selectedOfferIds: offerIds,
      selectedListingIds: dedupedListingIds,
      selectedListings: Array.from(selectedListingsMap.values()),
    });
  } catch (err: unknown) {
    console.error("[ebay selected-listings POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
