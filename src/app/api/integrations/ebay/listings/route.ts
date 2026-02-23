import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getValidEbayToken, getEbayApiBaseUrl } from "@/lib/ebay-api";

export const dynamic = "force-dynamic";

const LISTINGS_PAGE_SIZE = 50;
const SKU_BATCH = 5;

type InventoryItemRef = { sku: string };
type OfferItem = { offerId?: string; sku?: string; status?: string; listingId?: string };
type InventoryProduct = { product?: { title?: string } };

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

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get("connectionId")?.trim() || undefined;
  const conn = await getValidEbayToken(uid, connectionId);
  if (!conn) {
    return NextResponse.json(
      { error: "No eBay connection. Connect your eBay account in Integrations first." },
      { status: 400 }
    );
  }

  const base = getEbayApiBaseUrl(conn.isSandbox);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${conn.accessToken}`,
    "Content-Type": "application/json",
    "Accept-Language": "en-US",
    "Content-Language": "en-US",
  };

  try {
    const skus: string[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const invRes = await fetch(
        `${base}/sell/inventory/v1/inventory_item?limit=${LISTINGS_PAGE_SIZE}&offset=${offset}`,
        { headers }
      );
      if (!invRes.ok) {
        const err = (await invRes.json().catch(() => ({}))) as {
          errors?: Array<{ message?: string; longMessage?: string; errorId?: number }>;
        };
        console.error("[ebay listings getInventoryItems]", invRes.status, err);
        const firstMsg =
          Array.isArray(err?.errors) && err.errors.length > 0
            ? err.errors[0].longMessage || err.errors[0].message
            : null;
        const errorText =
          firstMsg ||
          (invRes.status === 401 || invRes.status === 403
            ? "eBay token invalid or missing permission (Inventory). Try reconnecting eBay in Integrations."
            : invRes.status === 404
              ? "eBay endpoint not found. Check Sandbox vs Production: reconnect with the correct environment."
              : "eBay returned an error. Try again or reconnect eBay in Integrations.");
        return NextResponse.json(
          { error: errorText, detail: err?.errors },
          { status: 502 }
        );
      }
      const invData = (await invRes.json()) as {
        inventoryItems?: (InventoryItemRef | string)[];
        total?: number;
      };
      const items = invData.inventoryItems ?? [];
      items.forEach((i) => {
        const sku = typeof i === "string" ? i : (i as InventoryItemRef).sku;
        if (sku) skus.push(sku);
      });
      if (items.length < LISTINGS_PAGE_SIZE) hasMore = false;
      else offset += LISTINGS_PAGE_SIZE;
    }

    const listings: { offerId: string; sku: string; title: string; status: string }[] = [];

    for (let i = 0; i < skus.length; i += SKU_BATCH) {
      const batch = skus.slice(i, i + SKU_BATCH);
      const results = await Promise.all(
        batch.map(async (sku) => {
          const [offersRes, itemRes] = await Promise.all([
            fetch(`${base}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&limit=10`, {
              headers,
            }),
            fetch(`${base}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
              headers,
            }),
          ]);

          const offersData = (await offersRes.json().catch(() => ({}))) as {
            offers?: OfferItem[];
          };
          const itemData = (await itemRes.json().catch(() => ({}))) as InventoryProduct;
          const title =
            (itemData.product?.title as string) || itemData.product?.title || sku || "—";
          const offers = offersData.offers ?? [];
          return offers.map((o) => ({
            offerId: o.offerId ?? "",
            sku: o.sku ?? sku,
            title,
            status: (o.status as string) ?? "UNKNOWN",
          }));
        })
      );
      results.flat().forEach((r) => {
        if (r.offerId) listings.push(r);
      });
    }

    return NextResponse.json({
      listings,
      environment: conn.isSandbox ? "sandbox" : "production",
      inventoryItemCount: skus.length,
    });
  } catch (err: unknown) {
    console.error("[ebay listings]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load listings" },
      { status: 500 }
    );
  }
}
