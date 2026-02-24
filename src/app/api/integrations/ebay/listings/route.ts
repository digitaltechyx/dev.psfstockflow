import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getValidEbayToken, getEbayApiBaseUrl } from "@/lib/ebay-api";
import { XMLParser } from "fast-xml-parser";

export const dynamic = "force-dynamic";

const LISTINGS_PAGE_SIZE = 50;
const SKU_BATCH = 5;
const TRADING_PAGE_SIZE = 200;
const TRADING_COMPAT_LEVEL = "1209";

type InventoryItemRef = { sku: string };
type OfferItem = { offerId?: string; sku?: string; status?: string; listingId?: string; availableQuantity?: number };
type InventoryProduct = { product?: { title?: string } };
type TradingListingItem = { itemId: string; title: string; status: string; quantity?: number };

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

async function fetchTradingActiveListings(
  base: string,
  accessToken: string
): Promise<{ items: TradingListingItem[]; total: number }> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: true,
  });
  const items: TradingListingItem[] = [];
  let pageNumber = 1;
  let totalPages = 1;

  while (pageNumber <= totalPages) {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <DetailLevel>ReturnAll</DetailLevel>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>${TRADING_PAGE_SIZE}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;

    const res = await fetch(`${base}/ws/api.dll`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
        "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-COMPATIBILITY-LEVEL": TRADING_COMPAT_LEVEL,
        "X-EBAY-API-IAF-TOKEN": accessToken,
      },
      body,
    });

    const xml = await res.text();
    if (!res.ok) {
      console.error("[ebay listings GetMyeBaySelling]", res.status, xml.slice(0, 500));
      break;
    }

    const parsed = parser.parse(xml) as {
      GetMyeBaySellingResponse?: {
        Ack?: string;
        Errors?: { LongMessage?: string; ShortMessage?: string } | { LongMessage?: string; ShortMessage?: string }[];
        ActiveList?: {
          ItemArray?: {
            Item?:
              | {
                  ItemID?: string;
                  Title?: string;
                  Quantity?: string | number;
                  QuantityAvailable?: string | number;
                  SellingStatus?: { ListingStatus?: string; QuantityAvailable?: string | number; QuantitySold?: string | number };
                }
              | {
                  ItemID?: string;
                  Title?: string;
                  Quantity?: string | number;
                  QuantityAvailable?: string | number;
                  SellingStatus?: { ListingStatus?: string; QuantityAvailable?: string | number; QuantitySold?: string | number };
                }[];
          };
          PaginationResult?: {
            TotalNumberOfPages?: string | number;
            TotalNumberOfEntries?: string | number;
          };
        };
      };
    };

    const response = parsed.GetMyeBaySellingResponse;
    const ack = (response?.Ack || "").toLowerCase();
    if (ack && ack !== "success" && ack !== "warning") {
      const err = toArray(response?.Errors)
        .map((e) => e?.LongMessage || e?.ShortMessage)
        .filter(Boolean)
        .join(" | ");
      console.error("[ebay listings GetMyeBaySelling Ack]", ack, err);
      break;
    }

    const activeList = response?.ActiveList;
    const pageItems = toArray(activeList?.ItemArray?.Item);
    for (const item of pageItems) {
      const raw = item as Record<string, unknown>;
      const itemId = String(item.ItemID ?? raw?.ItemID ?? raw?.itemID ?? "").trim();
      if (!itemId) continue;
      const sellingStatus = (item.SellingStatus ?? raw?.SellingStatus ?? raw?.sellingStatus) as Record<string, unknown> | undefined;
      const qtyAvail = Number(
        item.QuantityAvailable ??
        raw?.QuantityAvailable ??
        raw?.quantityAvailable ??
        sellingStatus?.QuantityAvailable ??
        sellingStatus?.quantityAvailable ??
        0
      );
      const qtyTotal = Number(item.Quantity ?? raw?.Quantity ?? raw?.quantity ?? 0);
      const qtySold = Number(
        item.SellingStatus?.QuantitySold ??
        sellingStatus?.QuantitySold ??
        sellingStatus?.quantitySold ??
        0
      );
      const quantity =
        qtyAvail > 0 ? qtyAvail : (qtyTotal > 0 && qtySold >= 0 ? Math.max(0, qtyTotal - qtySold) : qtyTotal > 0 ? qtyTotal : 0);
      items.push({
        itemId,
        title: String(item.Title ?? raw?.Title ?? raw?.title ?? "").trim() || `Listing ${itemId}`,
        status: String(
          item.SellingStatus?.ListingStatus ?? sellingStatus?.ListingStatus ?? sellingStatus?.listingStatus ?? "ACTIVE"
        ).trim(),
        quantity,
      });
    }

    const parsedTotalPages = Number(activeList?.PaginationResult?.TotalNumberOfPages ?? 1);
    totalPages = Number.isFinite(parsedTotalPages) && parsedTotalPages > 0 ? parsedTotalPages : 1;
    pageNumber += 1;
  }

  return { items, total: items.length };
}

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
    let ebayReportedTotal: number | undefined;
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
      if (offset === 0 && typeof invData.total === "number") ebayReportedTotal = invData.total;
      const items = invData.inventoryItems ?? [];
      items.forEach((i) => {
        const sku = typeof i === "string" ? i : (i as InventoryItemRef).sku;
        if (sku) skus.push(sku);
      });
      if (items.length < LISTINGS_PAGE_SIZE) hasMore = false;
      else offset += LISTINGS_PAGE_SIZE;
    }

    const listings: {
      offerId: string;
      sku: string;
      title: string;
      status: string;
      listingId?: string;
      quantity?: number;
      source?: "inventory" | "trading";
    }[] = [];

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
            listingId: o.listingId ?? undefined,
            quantity: Number(o.availableQuantity ?? 0) || 0,
            source: "inventory" as const,
          }));
        })
      );
      results.flat().forEach((r) => {
        if (r.offerId) listings.push(r);
      });
    }

    const inventoryListingIds = new Set(
      listings.map((l) => (l.listingId || "").trim()).filter(Boolean)
    );
    const trading = await fetchTradingActiveListings(base, conn.accessToken);
    const tradingOnly = trading.items.filter((item) => !inventoryListingIds.has(item.itemId));
    for (const item of tradingOnly) {
      listings.push({
        offerId: "",
        sku: item.itemId,
        title: item.title,
        status: item.status || "ACTIVE",
        listingId: item.itemId,
        quantity: item.quantity ?? 0,
        source: "trading",
      });
    }

    return NextResponse.json({
      listings,
      environment: conn.isSandbox ? "sandbox" : "production",
      inventoryItemCount: skus.length,
      ebayReportedTotal: ebayReportedTotal,
      tradingActiveCount: trading.total,
    });
  } catch (err: unknown) {
    console.error("[ebay listings]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load listings" },
      { status: 500 }
    );
  }
}
