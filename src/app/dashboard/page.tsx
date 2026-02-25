"use client";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import type { InventoryItem, ShippedItem, Invoice } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Boxes,
  Clock3,
  DollarSign,
  AlertTriangle,
  Truck,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  PlugZap,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasRole } from "@/lib/permissions";

type InventoryRequestLite = {
  status?: string;
  productName?: string;
  rejectionReason?: string;
};

type ShipmentRequestLite = {
  status?: string;
};

type InventoryItemWithSource = InventoryItem & {
  source?: "shopify" | "ebay";
};

function normalizeDate(value: ShippedItem["date"]): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000);
  }
  return null;
}

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (userProfile && hasRole(userProfile, "commission_agent") && !hasRole(userProfile, "user")) {
      router.replace("/dashboard/agent");
    }
  }, [userProfile, router]);

  const {
    data: inventoryData,
    loading: inventoryLoading,
  } = useCollection<InventoryItem>(
    userProfile ? `users/${userProfile.uid}/inventory` : ""
  );
  const {
    data: shippedData,
    loading: shippedLoading,
  } = useCollection<ShippedItem>(
    userProfile ? `users/${userProfile.uid}/shipped` : ""
  );
  const {
    data: invoices,
    loading: invoicesLoading,
  } = useCollection<Invoice>(
    userProfile ? `users/${userProfile.uid}/invoices` : ""
  );
  const { data: inventoryRequests } = useCollection<InventoryRequestLite>(
    userProfile ? `users/${userProfile.uid}/inventoryRequests` : ""
  );
  const { data: shipmentRequests } = useCollection<ShipmentRequestLite>(
    userProfile ? `users/${userProfile.uid}/shipmentRequests` : ""
  );
  const { data: shopifyConnections, loading: shopifyConnectionsLoading } = useCollection<Record<string, unknown>>(
    userProfile ? `users/${userProfile.uid}/shopifyConnections` : ""
  );
  const { data: ebayConnections, loading: ebayConnectionsLoading } = useCollection<Record<string, unknown>>(
    userProfile ? `users/${userProfile.uid}/ebayConnections` : ""
  );

  const totalItemsInInventory = useMemo(() => {
    return inventoryData.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [inventoryData]);

  const lowStockItems = useMemo(() => {
    return inventoryData
      .filter((item) => (item.quantity || 0) > 0 && (item.quantity || 0) <= 10)
      .sort((a, b) => (a.quantity || 0) - (b.quantity || 0));
  }, [inventoryData]);

  const totalPendingAmount = useMemo(() => {
    const pendingInvoices = invoices.filter((inv) => inv.status === "pending");
    return pendingInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
  }, [invoices]);

  const pendingFulfillmentCount = useMemo(() => {
    return shipmentRequests.filter((r) => (r.status || "").toLowerCase() === "pending").length;
  }, [shipmentRequests]);

  const rejectedInventoryRequests = useMemo(() => {
    return inventoryRequests.filter((r) => (r.status || "").toLowerCase() === "rejected");
  }, [inventoryRequests]);

  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
  });

  useEffect(() => {
    const updateDate = () => {
      const today = new Date();
      const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(today.getDate()).padStart(2, "0")}`;
      setCurrentDate(todayString);
    };
    updateDate();
    const interval = setInterval(updateDate, 60000);
    return () => clearInterval(interval);
  }, []);

  const todaysShippedOrders = useMemo(() => {
    return shippedData.filter((item) => {
      const itemDate = normalizeDate(item.date);
      if (!itemDate) return false;
      const itemDateString = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(itemDate.getDate()).padStart(2, "0")}`;
      return itemDateString === currentDate;
    }).length;
  }, [shippedData, currentDate]);

  const integrationHealth = useMemo(() => {
    const hasShopify = shopifyConnections.length > 0;
    const hasEbay = ebayConnections.length > 0;
    if (hasShopify && hasEbay) return { label: "Healthy", pct: 100 };
    if (hasShopify || hasEbay) return { label: "Partial", pct: 70 };
    return { label: "Not Connected", pct: 20 };
  }, [shopifyConnections.length, ebayConnections.length]);

  const sourceSplit = useMemo(() => {
    const rows = inventoryData as InventoryItemWithSource[];
    const shopify = rows.filter((r) => r.source === "shopify").length;
    const ebay = rows.filter((r) => r.source === "ebay").length;
    const manual = rows.length - shopify - ebay;
    return { shopify, ebay, manual };
  }, [inventoryData]);

  return (
    <div className="space-y-6">
      <Card className="border-2 border-slate-200/70 bg-gradient-to-r from-white to-slate-50 shadow-lg">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Operations Dashboard</h2>
              <p className="text-sm text-slate-600">
                Live overview of inventory, fulfillment activity, invoicing, and integrations.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/inventory"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Boxes className="h-4 w-4" />
                Manage Inventory
              </Link>
              <Link
                href="/dashboard/create-shipment-with-labels"
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Truck className="h-4 w-4" />
                Create Shipment
              </Link>
              <Link
                href="/dashboard/integrations"
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <PlugZap className="h-4 w-4" />
                Integrations
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-900">Total Inventory Units</CardTitle>
            <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
              <Boxes className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">{totalItemsInInventory}</div>
            <p className="text-xs text-blue-700 mt-1">Total units across all products</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-amber-200/50 bg-gradient-to-br from-amber-50 to-amber-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-900">Low Stock SKUs</CardTitle>
            <div className="h-10 w-10 rounded-full bg-amber-500 flex items-center justify-center shadow-md">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            {inventoryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-3xl font-bold text-amber-900">{lowStockItems.length}</div>
                <p className="text-xs text-amber-700 mt-1">Quantity 10 or less</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-orange-200/50 bg-gradient-to-br from-orange-50 to-orange-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-orange-900">Pending Fulfillment</CardTitle>
            <div className="h-10 w-10 rounded-full bg-orange-500 flex items-center justify-center shadow-md">
              <Clock3 className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-900">{pendingFulfillmentCount}</div>
            <p className="text-xs text-orange-700 mt-1">Open shipment requests</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-green-200/50 bg-gradient-to-br from-green-50 to-green-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-900">Pending Invoice Amount</CardTitle>
            <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center shadow-md">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-3xl font-bold text-green-900">${totalPendingAmount.toFixed(2)}</div>
                <p className="text-xs text-green-700 mt-1">Open invoice balance</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-200/50 bg-gradient-to-br from-purple-50 to-purple-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-900">Today Shipped</CardTitle>
            <div className="h-10 w-10 rounded-full bg-purple-500 flex items-center justify-center shadow-md">
              <Truck className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-900">{todaysShippedOrders}</div>
            <p className="text-xs text-purple-700 mt-1">Orders shipped today</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-emerald-200/50 bg-gradient-to-br from-emerald-50 to-emerald-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-900">Integration Health</CardTitle>
            <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-md">
              <RefreshCw className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            {(shopifyConnectionsLoading || ebayConnectionsLoading) ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-3xl font-bold text-emerald-900">{integrationHealth.pct}%</div>
                <p className="text-xs text-emerald-700 mt-1">{integrationHealth.label}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 border-2 shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900">Operations Snapshot</CardTitle>
            <CardDescription>
              Quick view of inventory source distribution and order flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Shopify Items</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{sourceSplit.shopify}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">eBay Items</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{sourceSplit.ebay}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Manual Items</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{sourceSplit.manual}</p>
              </div>
            </div>

            <div className="rounded-lg border bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="font-medium text-slate-900">Priority Actions</h4>
                <span className="text-xs text-slate-500">Top workflow shortcuts</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link href="/dashboard/inventory" className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-slate-50">
                  Inventory Management
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>
                <Link href="/dashboard/shipped-orders" className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-slate-50">
                  Shipped Orders
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>
                <Link href="/dashboard/create-shipment-with-labels" className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-slate-50">
                  Create Shipment
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>
                <Link href="/dashboard/integrations" className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-slate-50">
                  Integration Settings
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-rose-200/70 shadow-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold text-rose-900">Alerts</CardTitle>
            <CardDescription>Issues needing your attention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">Low Stock Alerts ({lowStockItems.length})</p>
              {lowStockItems.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">No low stock items right now.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {lowStockItems.slice(0, 3).map((item) => (
                    <p key={item.id} className="text-xs text-amber-800">
                      {item.productName}: {item.quantity} left
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm font-medium text-rose-900">
                Rejected Inventory Requests ({rejectedInventoryRequests.length})
              </p>
              {rejectedInventoryRequests.length === 0 ? (
                <p className="mt-1 text-xs text-rose-700">No rejected requests.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {rejectedInventoryRequests.slice(0, 2).map((req, idx) => (
                    <p key={`${req.productName || "item"}-${idx}`} className="text-xs text-rose-800">
                      {req.productName || "Inventory item"}: {req.rejectionReason || "Rejected by admin"}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm font-medium text-blue-900">Pending Fulfillment ({pendingFulfillmentCount})</p>
              <p className="mt-1 text-xs text-blue-700">
                Open shipment requests are waiting for processing.
              </p>
              <Link href="/dashboard/shipped-orders" className="mt-2 inline-block text-xs font-medium text-blue-700 underline">
                Review shipped orders and requests
              </Link>
            </div>

            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-medium text-emerald-900">Integration Status</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Shopify: {shopifyConnections.length > 0 ? "Connected" : "Not connected"}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                eBay: {ebayConnections.length > 0 ? "Connected" : "Not connected"}
              </div>
              <Link href="/dashboard/integrations" className="mt-2 inline-block text-xs font-medium text-emerald-700 underline">
                Open integration settings
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent Shipped Activity</CardTitle>
          <CardDescription>
            Snapshot of your latest shipping activity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shippedLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                You have <span className="font-medium text-slate-900">{shippedData.length}</span> shipped records.
              </p>
              <div>
                <Link
                  href="/dashboard/shipped-orders"
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open Shipped Orders
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
