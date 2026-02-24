import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getValidEbayToken, getEbayApiBaseUrl } from "@/lib/ebay-api";

export const dynamic = "force-dynamic";

const MAX_OFFERS_TO_RESOLVE = 100;

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
    return NextResponse.json({ selectedOfferIds, selectedListingIds });
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

    await docRef.update({
      selectedOfferIds: offerIds,
      selectedListingIds: dedupedListingIds,
    });
    return NextResponse.json({
      ok: true,
      selectedOfferIds: offerIds,
      selectedListingIds: dedupedListingIds,
    });
  } catch (err: unknown) {
    console.error("[ebay selected-listings POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
