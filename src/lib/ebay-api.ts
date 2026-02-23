/**
 * Server-only eBay API helpers: token refresh and base URL.
 * Use from API routes only.
 */

import { adminDb } from "@/lib/firebase-admin";

const EBAY_TOKEN_REFRESH_BUFFER_SEC = 300; // refresh if expiring in 5 min

export type EbayConnection = {
  connectionId: string;
  accessToken: string;
  isSandbox: boolean;
};

/**
 * Get a valid eBay access token for the user. Refreshes if expired.
 * Returns null if no connection or refresh failed.
 */
export async function getValidEbayToken(uid: string): Promise<EbayConnection | null> {
  const db = adminDb();
  const col = db.collection("users").doc(uid).collection("ebayConnections");
  const snapshot = await col.limit(1).get();
  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();
  const connectionId = doc.id;
  const accessToken = data.accessToken as string | undefined;
  const refreshToken = data.refreshToken as string | null | undefined;
  const expiresAt = data.expiresAt as { seconds: number } | undefined;
  const env = data.environment as string | undefined;
  const isSandbox = env === "sandbox";

  if (!accessToken) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = expiresAt?.seconds ?? 0;
  if (expSec > nowSec + EBAY_TOKEN_REFRESH_BUFFER_SEC) {
    return { connectionId, accessToken, isSandbox };
  }

  if (!refreshToken) {
    return { connectionId, accessToken, isSandbox };
  }

  const clientId = process.env.NEXT_PUBLIC_EBAY_APP_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const tokenUrl = isSandbox
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const formBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }).toString();

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: formBody,
    });

    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_token_expires_in?: number;
    };

    if (!res.ok || !body.access_token) {
      console.error("[ebay refresh token]", res.status, body);
      return { connectionId, accessToken, isSandbox };
    }

    const now = new Date();
    const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 7200;
    const refreshExpiresIn =
      typeof body.refresh_token_expires_in === "number" ? body.refresh_token_expires_in : 47304000;

    await doc.ref.update({
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
      expiresAt: { seconds: Math.floor(now.getTime() / 1000) + expiresIn, nanoseconds: 0 },
      refreshExpiresAt: {
        seconds: Math.floor(now.getTime() / 1000) + refreshExpiresIn,
        nanoseconds: 0,
      },
    });

    return {
      connectionId,
      accessToken: body.access_token,
      isSandbox,
    };
  } catch (err) {
    console.error("[ebay refresh token]", err);
    return { connectionId, accessToken, isSandbox };
  }
}

export function getEbayApiBaseUrl(isSandbox: boolean): string {
  return isSandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}
