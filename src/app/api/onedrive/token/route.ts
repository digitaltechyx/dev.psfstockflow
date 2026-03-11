/**
 * API Route: Get OneDrive Access Token
 * Uses refresh token to get a new access token
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    let refreshToken = process.env.ONEDRIVE_REFRESH_TOKEN;

    if (!refreshToken) {
      try {
        const db = adminDb();
        const systemDoc = await db.collection("system").doc("oneDrive").get();
        if (systemDoc.exists) {
          const data = systemDoc.data();
          refreshToken = data?.refreshToken;
        }
      } catch {
        // ignore
      }
    }

    if (!refreshToken) {
      return NextResponse.json(
        {
          error: "No refresh token found. Connect OneDrive first.",
          hint: "Visit /api/onedrive/auth to connect your OneDrive account.",
        },
        { status: 500 }
      );
    }

    const clientId = process.env.ONEDRIVE_CLIENT_ID;
    const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "OneDrive OAuth credentials not configured (ONEDRIVE_CLIENT_ID / ONEDRIVE_CLIENT_SECRET)" },
        { status: 500 }
      );
    }

    const tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("OneDrive token refresh error:", errorText);
      return NextResponse.json(
        {
          error: "Failed to refresh OneDrive access token",
          hint: "Re-connect OneDrive at /api/onedrive/auth to get a new refresh token.",
        },
        { status: 500 }
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      expires_in?: number;
    };
    return NextResponse.json({
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in,
    });
  } catch (error: unknown) {
    console.error("OneDrive token error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get access token" },
      { status: 500 }
    );
  }
}
