"use client";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import type { InventoryItem } from "@/types";
import { InventoryTable } from "@/components/dashboard/inventory-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Package } from "lucide-react";
import { useEffect, useRef } from "react";

type InventoryItemWithSource = InventoryItem & { source?: string; ebayConnectionId?: string };

export default function InventoryPage() {
  const { userProfile, user: authUser } = useAuth();
  const ebayRefreshDone = useRef(false);

  const {
    data: inventoryData,
    loading: inventoryLoading,
  } = useCollection<InventoryItem>(
    userProfile ? `users/${userProfile.uid}/inventory` : ""
  );

  // Refresh eBay quantities from eBay when inventory page loads
  useEffect(() => {
    if (!authUser || !userProfile || inventoryLoading || ebayRefreshDone.current) return;
    const items = inventoryData as InventoryItemWithSource[];
    const connectionIds = [
      ...new Set(
        items
          .filter((i) => i.source === "ebay" && i.ebayConnectionId)
          .map((i) => i.ebayConnectionId!)
      ),
    ];
    if (connectionIds.length === 0) return;
    ebayRefreshDone.current = true;
    (async () => {
      const token = await authUser.getIdToken();
      for (const connectionId of connectionIds) {
        try {
          await fetch("/api/integrations/ebay/refresh-inventory", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ connectionId }),
          });
        } catch {
          // ignore
        }
      }
    })();
  }, [authUser, userProfile, inventoryLoading, inventoryData]);

  return (
    <div className="space-y-6">
      <Card className="border-2 shadow-xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-white">
                Inventory
              </CardTitle>
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
              <InventoryTable data={inventoryData} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
