/**
 * API Route: Handle OneDrive OAuth Callback
 * Exchanges authorization code for tokens and stores refresh token
 */

import { NextRequest, NextResponse } from "next/server";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const error = request.nextUrl.searchParams.get("error");
    const errorDescription = request.nextUrl.searchParams.get("error_description");

    if (error) {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>OneDrive OAuth Error</title></head>
          <body style="font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1 style="color: #d83b01;">OneDrive connection failed</h1>
            <p><strong>Error:</strong> ${error}</p>
            ${errorDescription ? `<p>${errorDescription}</p>` : ""}
            <p>Check Azure app redirect URI and that you use only <strong>Files.ReadWrite</strong> and <strong>offline_access</strong> scopes.</p>
          </body>
        </html>
      `;
      return new NextResponse(html, { headers: { "Content-Type": "text/html" }, status: 400 });
    }

    if (!code) {
      return new NextResponse(
        "<!DOCTYPE html><html><body><h1>OneDrive Callback</h1><p>No code received. Start from Dashboard → One Drive Test and click Connect OneDrive.</p></body></html>",
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const clientId = process.env.ONEDRIVE_CLIENT_ID;
    const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
    const redirectUri =
      process.env.ONEDRIVE_REDIRECT_URI || `${request.nextUrl.origin}/api/onedrive/callback`;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "OneDrive OAuth credentials not configured" },
        { status: 500 }
      );
    }

    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("OneDrive token exchange error:", errText);
      return NextResponse.json(
        { error: "Failed to exchange code for tokens", details: errText },
        { status: 500 }
      );
    }

    const tokenData = (await tokenResponse.json()) as {
      refresh_token?: string;
      access_token?: string;
      expires_in?: number;
    };
    const refreshToken = tokenData.refresh_token;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "No refresh token received. Ensure scope includes offline_access and prompt=consent." },
        { status: 500 }
      );
    }

    try {
      await setDoc(
        doc(db, "system", "oneDrive"),
        {
          refreshToken,
          accessToken: tokenData.access_token,
          expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("Error storing OneDrive refresh token:", e);
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OneDrive Connected</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h1 { color: #0078d4; }
            .success { color: #107c10; font-weight: bold; }
            .info { background: #e6f2ff; padding: 15px; border-radius: 4px; margin: 20px 0; word-break: break-all; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>OneDrive connected</h1>
            <p class="success">Your OneDrive account is connected. You can close this window and use the One Drive Test page to upload labels.</p>
            <div class="info">
              <p><strong>Optional – env:</strong> You can set <code>ONEDRIVE_REFRESH_TOKEN</code> to the value below if you prefer not to use Firestore.</p>
              <p><code>${refreshToken}</code></p>
            </div>
            <p><a href="/dashboard/onedrive-test">Go to One Drive Test page</a></p>
          </div>
        </body>
      </html>
    `;
    return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
  } catch (error: unknown) {
    console.error("OneDrive callback error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process OAuth callback" },
      { status: 500 }
    );
  }
}
