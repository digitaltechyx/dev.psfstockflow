import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { runAutoSync } from "@/app/api/integrations/ebay/auto-sync/route";

export const dynamic = "force-dynamic";

function getChallengeResponse(challengeCode: string, verificationToken: string, endpoint: string): string {
  return crypto
    .createHash("sha256")
    .update(`${challengeCode}${verificationToken}${endpoint}`)
    .digest("hex");
}

function getWebhookEventId(request: NextRequest, payload: Record<string, unknown>): string {
  const headerId =
    request.headers.get("x-ebay-delivery-id") ||
    request.headers.get("x-ebay-message-id") ||
    request.headers.get("x-ebay-event-id");
  if (headerId) return headerId;

  const bodyId =
    (typeof payload.notificationId === "string" ? payload.notificationId : undefined) ||
    (typeof payload.eventId === "string" ? payload.eventId : undefined) ||
    (typeof payload.messageId === "string" ? payload.messageId : undefined);
  if (bodyId) return bodyId;

  const bodyHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 32);
  return `anon_${Date.now()}_${bodyHash}`;
}

function isWebhookAuthorized(request: NextRequest): boolean {
  const secret = process.env.EBAY_WEBHOOK_SECRET;
  if (!secret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const tokenHeader = request.headers.get("x-ebay-webhook-token");
  if (tokenHeader === secret) return true;

  const tokenQuery = request.nextUrl.searchParams.get("token");
  if (tokenQuery === secret) return true;

  return false;
}

export async function GET(request: NextRequest) {
  const challengeCode = request.nextUrl.searchParams.get("challenge_code");
  if (!challengeCode) {
    return NextResponse.json({ ok: true, message: "eBay webhook endpoint is live" });
  }

  const verificationToken = process.env.EBAY_WEBHOOK_VERIFICATION_TOKEN;
  if (!verificationToken) {
    return NextResponse.json(
      { error: "Missing EBAY_WEBHOOK_VERIFICATION_TOKEN for challenge verification" },
      { status: 500 }
    );
  }

  const endpoint = `${request.nextUrl.origin}${request.nextUrl.pathname}`;
  const challengeResponse = getChallengeResponse(challengeCode, verificationToken, endpoint);
  return NextResponse.json({ challengeResponse });
}

export async function POST(request: NextRequest) {
  if (!isWebhookAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const eventId = getWebhookEventId(request, payload);
  const db = adminDb();
  const eventRef = db.collection("ebayWebhookEvents").doc(eventId);
  const eventSnap = await eventRef.get();
  if (eventSnap.exists) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await eventRef.set({
    createdAt: new Date().toISOString(),
    headers: {
      topic: request.headers.get("x-ebay-topic"),
      deliveryId: request.headers.get("x-ebay-delivery-id"),
    },
    payload,
  });

  // Webhook-first behavior: lightweight near real-time sync for selected listings.
  const result = await runAutoSync({ maxPages: 2, maxConnections: 25 });
  await eventRef.set(
    {
      processedAt: new Date().toISOString(),
      syncResult: result,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, eventId, sync: result });
}
