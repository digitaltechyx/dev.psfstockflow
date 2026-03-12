/**
 * API Route: Upload file to OneDrive
 * Uses same form fields as Google Drive: file, clientName, folderPath
 */

import { NextRequest, NextResponse } from "next/server";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MAX_SIMPLE_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

export async function POST(request: NextRequest) {
  try {
    const tokenRes = await fetch(`${request.nextUrl.origin}/api/onedrive/token`);
    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      return NextResponse.json(
        { error: "Label upload failed." },
        { status: tokenRes.status || 500 }
      );
    }
    const { accessToken } = await tokenRes.json();
    if (!accessToken) {
      return NextResponse.json({ error: "No access token" }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const clientName = formData.get("clientName") as string;
    const folderPath = formData.get("folderPath") as string;
    const suggestedFileName = formData.get("fileName") as string | null;

    if (!file || !clientName || !folderPath) {
      return NextResponse.json(
        { error: "Missing required fields: file, clientName, or folderPath" },
        { status: 400 }
      );
    }

    const isValidType =
      file.type === "application/pdf" || file.type.startsWith("image/");
    if (!isValidType) {
      return NextResponse.json(
        { error: "Only PDF files and images (JPG, PNG) are allowed" },
        { status: 400 }
      );
    }

    let fileName = (file.name || suggestedFileName || "").trim();
    if (!fileName || fileName === "blob") {
      const ext = file.type === "application/pdf" ? "pdf" : (file.type.split("/")[1] || "png");
      fileName = `label-${Date.now()}.${ext}`;
    }
    if (!fileName.includes(".")) {
      const ext = file.type === "application/pdf" ? "pdf" : (file.type.split("/")[1] || "png");
      fileName = `${fileName}.${ext}`;
    }
    const pathForGraph = `${folderPath}/${fileName}`.replace(/\/+/g, "/");
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_SIMPLE_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File too large for simple upload (max 4 MB). Use smaller file or implement chunked upload." },
        { status: 400 }
      );
    }

    const uploadUrl = `${GRAPH_BASE}/me/drive/root:/${pathForGraph}:/content`;
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("OneDrive upload error:", errText);
      return NextResponse.json(
        { error: "Label upload failed." },
        { status: 500 }
      );
    }

    const item = (await uploadRes.json()) as {
      id?: string;
      name?: string;
      webUrl?: string;
      "@microsoft.graph.downloadUrl"?: string;
    };

    return NextResponse.json({
      success: true,
      fileId: item.id,
      fileName: item.name,
      storagePath: pathForGraph,
      downloadURL: item["@microsoft.graph.downloadUrl"] || item.webUrl,
      webUrl: item.webUrl,
    });
  } catch (error: unknown) {
    console.error("OneDrive upload error:", error);
    return NextResponse.json(
      { error: "Label upload failed." },
      { status: 500 }
    );
  }
}
