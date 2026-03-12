/**
 * API Route: Disconnect OneDrive
 * Removes stored refresh token from Firestore so label uploads will fail until reconnected.
 */

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST() {
  try {
    const db = adminDb();
    await db.collection("system").doc("oneDrive").delete();
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("OneDrive disconnect error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect OneDrive" },
      { status: 500 }
    );
  }
}
