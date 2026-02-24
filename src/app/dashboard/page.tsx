"use client";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import type { InventoryItem, ShippedItem, Invoice } from "@/types";
import { InventoryTable } from "@/components/dashboard/inventory-table";
import { ShippedTable } from "@/components/dashboard/shipped-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Truck, DollarSign, AlertCircle, Mail, MessageCircle } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasRole } from "@/lib/permissions";

type EbayConnectionDoc = {
  selectedListingIds?: string[];
  selectedListings?: Array<{
    id?: string;
    title?: string;
    sku?: string;
    status?: string;
    source?: "inventory" | "trading";
    listingId?: string;
    offerId?: string;
  }>;
};

export default function DashboardPage() {
  const { user, userProfile } = useAuth();
  const router = useRouter();

  // Redirect commission agents (without user role) to their affiliate dashboard
  // If user has both roles, they stay on client dashboard
  useEffect(() => {
    if (userProfile && hasRole(userProfile, "commission_agent") && !hasRole(userProfile, "user")) {
      router.replace("/dashboard/agent");
    }
  }, [userProfile, router]);
  
  const { 
    data: inventoryData, 
    loading: inventoryLoading 
  } = useCollection<InventoryItem>(
    userProfile ? `users/${userProfile.uid}/inventory` : ""
  );

  const { 
    data: shippedData, 
    loading: shippedLoading 
  } = useCollection<ShippedItem>(
    userProfile ? `users/${userProfile.uid}/shipped` : ""
  );

  const {
    data: invoices,
    loading: invoicesLoading
  } = useCollection<Invoice>(
    userProfile ? `users/${userProfile.uid}/invoices` : ""
  );
  const [ebayConnections, setEbayConnections] = useState<EbayConnectionDoc[]>([]);

  useEffect(() => {
    const fetchEbayConnections = async () => {
      if (!user) {
        setEbayConnections([]);
        return;
      }
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/integrations/ebay-connections", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setEbayConnections([]);
          return;
        }
        const data = await res.json().catch(() => ({}));
        setEbayConnections(Array.isArray(data.connections) ? (data.connections as EbayConnectionDoc[]) : []);
      } catch {
        setEbayConnections([]);
      }
    };
    fetchEbayConnections();
  }, [user]);

  // Calculate total quantity of all inventory items
  const totalItemsInInventory = useMemo(() => {
    return inventoryData.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [inventoryData]);

  // Calculate total pending amount from invoices
  const totalPendingAmount = useMemo(() => {
    const pendingInvoices = invoices.filter(inv => inv.status === 'pending');
    return pendingInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
  }, [invoices]);

  // Track current date to update when date changes
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  // Update current date every minute to catch date changes
  useEffect(() => {
    const updateDate = () => {
      const today = new Date();
      const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      setCurrentDate(todayString);
    };

    // Update immediately
    updateDate();

    // Update every minute to catch date changes
    const interval = setInterval(updateDate, 60000);

    return () => clearInterval(interval);
  }, []);

  // Calculate today's shipped orders
  const todaysShippedOrders = useMemo(() => {
    return shippedData.filter((item) => {
      if (!item.date) return false;
      
      let itemDate: Date;
      if (typeof item.date === 'string') {
        itemDate = new Date(item.date);
      } else if (item.date.seconds) {
        itemDate = new Date(item.date.seconds * 1000);
      } else {
        return false;
      }
      
      const itemDateString = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}-${String(itemDate.getDate()).padStart(2, '0')}`;
      return itemDateString === currentDate;
    }).length;
  }, [shippedData, currentDate]);

  const mergedInventoryData = useMemo(() => {
    const rows = new Map<string, InventoryItem>();
    const nowIso = new Date().toISOString();
    for (const conn of ebayConnections) {
      const selectedMeta = Array.isArray(conn.selectedListings) ? conn.selectedListings : [];
      for (const row of selectedMeta) {
        const id = row.id || row.listingId || row.offerId || "";
        if (!id) continue;
        const listingStatus = (row.status || "").toLowerCase();
        const stockStatus: "In Stock" | "Out of Stock" =
          listingStatus.includes("active") || listingStatus.includes("published") ? "In Stock" : "Out of Stock";
        rows.set(id, {
          id: `ebay-${id}`,
          productName: row.title || id,
          sku: row.sku || id,
          quantity: 0,
          dateAdded: nowIso,
          status: stockStatus,
          source: "ebay",
        });
      }
      const list = Array.isArray(conn.selectedListingIds) ? conn.selectedListingIds : [];
      for (const id of list) {
        if (typeof id === "string" && id.trim() && !rows.has(id.trim())) {
          rows.set(id.trim(), {
            id: `ebay-${id.trim()}`,
            productName: id.trim(),
            sku: id.trim(),
            quantity: 0,
            dateAdded: nowIso,
            status: "Out of Stock",
            source: "ebay",
          });
        }
      }
    }
    return [...inventoryData, ...Array.from(rows.values())];
  }, [ebayConnections, inventoryData]);

  return (
    <div className="space-y-6">
      {/* Maintenance Notice Banner */}
      <Card className="border-2 border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 shadow-lg">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-1">
              <div className="h-10 w-10 rounded-full bg-amber-500 flex items-center justify-center shadow-md">
                <AlertCircle className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-amber-900 mb-2">
                System Maintenance in Progress
              </h3>
              <p className="text-sm text-amber-800 mb-4">
                Our application is currently undergoing scheduled maintenance to improve your experience. 
                We apologize for any inconvenience this may cause.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <div className="flex items-center gap-2 text-sm text-amber-800">
                  <Mail className="h-4 w-4 text-amber-600" />
                  <span className="font-medium">Email:</span>
                  <a 
                    href="mailto:info@prepservicesfba.com" 
                    className="text-amber-700 hover:text-amber-900 underline"
                  >
                    info@prepservicesfba.com
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm text-amber-800">
                  <MessageCircle className="h-4 w-4 text-amber-600" />
                  <span className="font-medium">WhatsApp:</span>
                  <span className="text-amber-700">Available 24/7</span>
                </div>
              </div>
              <p className="text-xs text-amber-700 mt-3 italic">
                For urgent inquiries, please contact us via Email or WhatsApp. We'll respond as soon as possible.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-900">Total Items in Inventory</CardTitle>
            <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
              <Package className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">{totalItemsInInventory}</div>
            <p className="text-xs text-blue-700 mt-1">Total quantity of all items</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-green-200/50 bg-gradient-to-br from-green-50 to-green-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-900">Total Pending Amount</CardTitle>
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
                <p className="text-xs text-green-700 mt-1">Pending invoices total</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-200/50 bg-gradient-to-br from-purple-50 to-purple-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-900">Today's Shipped Orders</CardTitle>
            <div className="h-10 w-10 rounded-full bg-purple-500 flex items-center justify-center shadow-md">
              <Truck className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-900">{todaysShippedOrders}</div>
            <p className="text-xs text-purple-700 mt-1">Orders shipped today</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - Single Column Layout */}
      <div className="space-y-6">
        {/* Inventory Section - First Row */}
        <Card className="border-2 shadow-xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold text-white">Inventory</CardTitle>
                <CardDescription className="text-blue-100 mt-1">
                  Manage your product inventory
                </CardDescription>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {inventoryLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <div className="p-6">
                <InventoryTable data={mergedInventoryData} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shipped Orders Section - Second Row */}
        <Card className="border-2 shadow-xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-500 to-purple-600 text-white pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold text-white">
                  Order Shipped ({shippedData.length})
                </CardTitle>
                <CardDescription className="text-purple-100 mt-1">
                  Track your shipped orders
                </CardDescription>
              </div>
              <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Truck className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {shippedLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <div className="p-6">
                <ShippedTable data={shippedData} inventory={inventoryData} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
