import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { syncEbayOrdersForConnection } from "@/lib/ebay-order-sync";

export const dynamic = "force-dynamic";

const MAX_CONNECTIONS_PER_RUN = 25;

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.EBAY_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  const secretParam = request.nextUrl.searchParams.get("secret");
  if (secretParam === secret) return true;

  return false;
}

export async function runAutoSync(options?: { maxPages?: number; maxConnections?: number }) {
  const maxPages = options?.maxPages ?? 10;
  const maxConnections = options?.maxConnections ?? MAX_CONNECTIONS_PER_RUN;
  const db = adminDb();
  const connectionsSnap = await db.collectionGroup("ebayConnections").limit(maxConnections).get();

  let scanned = 0;
  let attempted = 0;
  let syncedConnections = 0;
  let totalFetched = 0;
  let totalSaved = 0;
  const errors: string[] = [];

  for (const connDoc of connectionsSnap.docs) {
    scanned++;
    const data = connDoc.data() ?? {};
    const selectedListingIds = Array.isArray(data.selectedListingIds)
      ? (data.selectedListingIds as string[])
      : [];
    if (selectedListingIds.length === 0) continue;

    const uid = connDoc.ref.parent.parent?.id;
    if (!uid) continue;
    const connectionId = connDoc.id;
    attempted++;

    const result = await syncEbayOrdersForConnection({
      uid,
      connectionId,
      filterNotStarted: false,
      maxPages,
      pageSize: 50,
    });

    totalFetched += result.totalFetched;
    totalSaved += result.totalSaved;
    if (result.ok) {
      syncedConnections++;
    } else {
      errors.push(`${uid}/${connectionId}: ${result.error || "sync failed"}`);
    }
  }

  return { scanned, attempted, syncedConnections, totalFetched, totalSaved, errors };
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runAutoSync();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runAutoSync();
  return NextResponse.json({ ok: true, ...result });
}
