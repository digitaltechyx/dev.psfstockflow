"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CloudUpload, Loader2, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { format } from "date-fns";

function defaultFolderPath(clientName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = format(now, "MMMM");
  const date = format(now, "dd-MM-yyyy");
  return `${year}/${month}/${clientName}/${date}`;
}

export default function OneDriveTestPage() {
  const { toast } = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [clientName, setClientName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    webUrl?: string;
    downloadURL?: string;
    fileName?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onedrive/token")
      .then((res) => {
        if (cancelled) return;
        setConnected(res.ok);
      })
      .catch(() => {
        if (!cancelled) setConnected(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (clientName.trim()) {
      setFolderPath(defaultFolderPath(clientName.trim()));
    }
  }, [clientName]);

  const handleConnect = () => {
    window.location.href = "/api/onedrive/auth";
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !clientName.trim() || !folderPath.trim()) {
      toast({
        title: "Missing fields",
        description: "Please select a file, enter client name, and ensure folder path is set.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("clientName", clientName.trim());
      form.append("folderPath", folderPath.trim());
      const res = await fetch("/api/onedrive/upload", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        setResult({
          success: true,
          webUrl: data.webUrl,
          downloadURL: data.downloadURL,
          fileName: data.fileName,
        });
        toast({ title: "Uploaded", description: "Label uploaded to OneDrive." });
      } else {
        setResult({ success: false, error: data.error || data.details || "Upload failed" });
        toast({ title: "Upload failed", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setResult({ success: false, error: msg });
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">One Drive Test</h1>
        <p className="text-muted-foreground">
          Test label upload to OneDrive. After testing, we can replace Google Drive upload with OneDrive.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudUpload className="h-5 w-5" />
            Connection status
          </CardTitle>
          <CardDescription>OneDrive is used to store uploaded labels.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checking ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking…
            </p>
          ) : connected ? (
            <p className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              Connected
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-amber-600">
                <XCircle className="h-4 w-4" />
                Not connected
              </p>
              <Button onClick={handleConnect}>Connect OneDrive</Button>
            </>
          )}
        </CardContent>
      </Card>

      {connected && (
        <Card>
          <CardHeader>
            <CardTitle>Upload label</CardTitle>
            <CardDescription>
              Upload a PDF or image (JPG, PNG). Folder path will be created in your OneDrive (max 4 MB for this test).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client name</Label>
                <Input
                  id="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="folderPath">Folder path (Year/Month/Client/Date)</Label>
                <Input
                  id="folderPath"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="2025/February/Client Name/13-02-2025"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">File (PDF or image)</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button type="submit" disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  "Upload to OneDrive"
                )}
              </Button>
            </form>

            {result && (
              <div className="mt-6 rounded-lg border p-4">
                {result.success ? (
                  <div className="space-y-2">
                    <p className="font-medium text-green-600">Upload successful</p>
                    {result.fileName && <p className="text-sm text-muted-foreground">{result.fileName}</p>}
                    {(result.webUrl || result.downloadURL) && (
                      <a
                        href={result.webUrl || result.downloadURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        Open in OneDrive <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-destructive">{result.error}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
