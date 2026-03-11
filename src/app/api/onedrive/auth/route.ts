/**
 * API Route: Get OneDrive OAuth Authorization URL
 * Use only Files.ReadWrite + offline_access (no SharePoint admin consent)
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const clientId = process.env.ONEDRIVE_CLIENT_ID;
    const redirectUri =
      process.env.ONEDRIVE_REDIRECT_URI || `${request.nextUrl.origin}/api/onedrive/callback`;

    if (!clientId) {
      return NextResponse.json(
        { error: "ONEDRIVE_CLIENT_ID is not configured" },
        { status: 500 }
      );
    }

    const scopes = ["Files.ReadWrite", "offline_access"].join(" ");
    const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes);
    authUrl.searchParams.set("response_mode", "query");
    authUrl.searchParams.set("prompt", "consent");

    return NextResponse.redirect(authUrl.toString());
  } catch (error: unknown) {
    console.error("OneDrive auth URL error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate authorization URL" },
      { status: 500 }
    );
  }
}
