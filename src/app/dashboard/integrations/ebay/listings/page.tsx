"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Package, Save } from "lucide-react";

type EbayListingRow = {
  offerId: string;
  sku: string;
  title: string;
  status: string;
};

export default function EbayListingsPage() {
  const searchParams = useSearchParams();
  const connectionId = searchParams.get("connectionId")?.trim() || undefined;
  const { user } = useAuth();
  const { toast } = useToast();
  const [listings, setListings] = useState<EbayListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ebayEnvironment, setEbayEnvironment] = useState<"sandbox" | "production" | null>(null);
  const [inventoryItemCount, setInventoryItemCount] = useState<number | null>(null);
  const [ebayReportedTotal, setEbayReportedTotal] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const fetchListings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const token = await user.getIdToken();
      const url = connectionId
        ? `/api/integrations/ebay/listings?connectionId=${encodeURIComponent(connectionId)}`
        : "/api/integrations/ebay/listings";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data.error as string) || "Failed to load listings";
        setLoadError(msg);
        setListings([]);
        setEbayEnvironment(null);
        setInventoryItemCount(null);
        setEbayReportedTotal(null);
        toast({
          variant: "destructive",
          title: "Error",
          description: msg,
        });
        return;
      }
      setListings(data.listings ?? []);
      setEbayEnvironment((data.environment as "sandbox" | "production") ?? null);
      setInventoryItemCount(typeof data.inventoryItemCount === "number" ? data.inventoryItemCount : null);
      setEbayReportedTotal(typeof data.ebayReportedTotal === "number" ? data.ebayReportedTotal : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load eBay listings.";
      setLoadError(msg);
      setListings([]);
      setEbayEnvironment(null);
      setInventoryItemCount(null);
      setEbayReportedTotal(null);
      toast({
        variant: "destructive",
        title: "Error",
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast, connectionId]);

  const fetchSelection = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const url = connectionId
        ? `/api/integrations/ebay/selected-listings?connectionId=${encodeURIComponent(connectionId)}`
        : "/api/integrations/ebay/selected-listings";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const ids = (data.selectedOfferIds ?? []) as string[];
      setSelectedIds(new Set(ids));
    } catch {
      // ignore
    }
  }, [user, connectionId]);

  useEffect(() => {
    if (user) {
      fetchListings();
      fetchSelection();
    }
  }, [user, fetchListings, fetchSelection]);

  const filtered =
    search.trim()
      ? listings.filter(
          (l) =>
            l.title.toLowerCase().includes(search.toLowerCase()) ||
            l.sku.toLowerCase().includes(search.toLowerCase()) ||
            l.offerId.toLowerCase().includes(search.toLowerCase())
        )
      : listings;

  const toggleOffer = (offerId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(offerId)) next.delete(offerId);
      else next.add(offerId);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map((l) => l.offerId)));
  const clearAll = () => setSelectedIds(new Set());

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const offerIds = Array.from(selectedIds);
      const res = await fetch("/api/integrations/ebay/selected-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ offerIds, connectionId: connectionId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data.error as string) || "Failed to save");
      }
      toast({
        title: "Saved",
        description: `${offerIds.length} listing(s) selected. Only orders for these will sync to PSF.`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to save.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/integrations">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Integrations
            </Link>
          </Button>
          <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
            <Package className="h-7 w-7" />
            eBay listings we fulfill
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Select the listings you fulfill through PSF. Only orders containing at least one of these will sync to PSF.
          </p>
          {ebayEnvironment && (
            <p className="text-sm mt-2 font-medium">
              Connected to eBay{" "}
              <span className={ebayEnvironment === "sandbox" ? "text-amber-600" : "text-green-600"}>
                {ebayEnvironment === "sandbox" ? "Sandbox" : "Production"}
              </span>
              {inventoryItemCount !== null && (
                <span className="text-muted-foreground font-normal ml-2">
                  ({inventoryItemCount} inventory item{inventoryItemCount !== 1 ? "s" : ""} from eBay)
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select listings</CardTitle>
          <CardDescription>
            Choose which eBay listings are fulfilled by PSF. Order sync (when enabled) will only include orders for these listings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading listings from eBay…
            </div>
          ) : loadError ? (
            <div className="py-6 space-y-3">
              <p className="text-destructive font-medium">{loadError}</p>
              <p className="text-sm text-muted-foreground">
                Make sure your eBay app has Inventory and Fulfillment permissions, and that you connected using the same environment (Sandbox or Production) where your listings exist.
              </p>
              <Button variant="outline" onClick={() => fetchListings()}>
                Try again
              </Button>
            </div>
          ) : listings.length === 0 ? (
            <div className="py-6 space-y-3">
              <p className="text-muted-foreground">
                {inventoryItemCount === 0
                  ? ebayReportedTotal != null && ebayReportedTotal > 0
                    ? `eBay Inventory API reports ${ebayReportedTotal} item(s) but none could be loaded for this connection.`
                    : "eBay returned 0 inventory items for this connection."
                  : inventoryItemCount != null && inventoryItemCount > 0
                    ? `${inventoryItemCount} inventory item(s) found but no published offers. Publish offers in Seller Hub to see them here.`
                    : "No listings found, or your eBay account has no inventory items/offers."}
              </p>
              <p className="text-sm text-muted-foreground border-l-4 border-slate-300 dark:border-slate-600 pl-3 py-1">
                <strong>Why don’t I see my Seller Hub “Active” listings?</strong> Seller Hub’s “Manage active listings” can
                include items created with <strong>Create listing</strong> or legacy tools. PSF only shows items that exist in
                eBay’s <strong>Inventory API</strong>. If you have many active listings in Seller Hub but 0 here, those
                listings were likely created outside the Inventory API. To have them in PSF, create or migrate listings using
                an eBay app or flow that uses the Inventory API (same eBay account and environment).
              </p>
              {ebayEnvironment && (
                <p className="text-sm text-muted-foreground border-l-4 border-amber-500 pl-3 py-1">
                  You're connected to <strong>{ebayEnvironment === "sandbox" ? "Sandbox" : "Production"}</strong>. Your
                  listings must be in this same environment. If they're on live eBay, connect with Production (EBAY_SANDBOX=false
                  and Production app keys). If they're test listings, use Sandbox (EBAY_SANDBOX=true and SBX keys). Disconnect
                  in Integrations and reconnect with the correct environment.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Connect eBay in Integrations and ensure you have inventory items and published offers in the Inventory API.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Search by title, SKU, or offer ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-sm"
                />
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select all
                </Button>
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} of {listings.length} selected
                </span>
              </div>
              <div className="border rounded-lg divide-y max-h-[60vh] overflow-y-auto">
                {filtered.map((l) => (
                  <label
                    key={l.offerId}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.has(l.offerId)}
                      onCheckedChange={() => toggleOffer(l.offerId)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{l.title || "—"}</p>
                      <p className="text-sm text-muted-foreground">
                        SKU: {l.sku} · {l.status}
                      </p>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground truncate max-w-[120px]">
                      {l.offerId}
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save selection
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
