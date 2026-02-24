"use client";

import React, { Suspense, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Users, ChevronsUpDown } from "lucide-react";
import { AdminInventoryManagement } from "@/components/admin/admin-inventory-management";
import { useCollection } from "@/hooks/use-collection";
import type { UserProfile, InventoryItem, ShippedItem } from "@/types";
import { useSearchParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { hasRole } from "@/lib/permissions";
import { clearFirestoreCache as clearCache } from "@/lib/firebase";

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

function InventoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const section = searchParams.get("section");
  const tab = searchParams.get("tab");
  const requestId = searchParams.get("requestId");
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  
  const { data: users, loading: usersLoading, error: usersError } = useCollection<UserProfile>("users");
  
  // Debug logging
  React.useEffect(() => {
    console.log("=== USER SELECTOR DEBUG ===");
    console.log("Users loaded:", users.length);
    console.log("Users:", users);
    console.log("Loading:", usersLoading);
    console.log("Error:", usersError);
    
    // If we get a permission error, show alert to clear cache
    if (usersError && usersError.message?.includes('permission')) {
      console.error("âš ï¸ PERMISSION ERROR DETECTED!");
      console.error("The Firestore client may be corrupted.");
      console.error("Please clear browser storage:");
      console.error("1. Go to: http://localhost:3000/clear-firestore-cache.html");
      console.error("2. Or manually clear IndexedDB in DevTools (F12 â†’ Application â†’ IndexedDB)");
    }
  }, [users, usersLoading, usersError]);
  
  // Function to clear Firestore cache
  const clearFirestoreCache = async () => {
    try {
      // Import the utility function
      const { clearFirestoreCache: clearCache } = await import("@/lib/firebase");
      const cleared = await clearCache();
      if (cleared) {
        alert('✅ Firestore cache cleared! Refreshing page in 2 seconds...');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        alert('âš ï¸ Could not clear cache automatically. Please clear manually in DevTools (F12 â†’ Application â†’ IndexedDB).');
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
      alert('Error clearing cache. Please clear manually in DevTools (F12 â†’ Application â†’ IndexedDB).');
    }
  };
  
  // Filter out admin users - show all approved users except admins
  const selectableUsers = useMemo(() => {
    const filtered = users.filter(user => {
      // Exclude admin users
      if (hasRole(user, "admin")) return false;
      
      // Include approved users or users without status (for backward compatibility)
      const isApproved = user.status === "approved" || !user.status;
      const isNotDeleted = user.status !== "deleted";
      
      return isApproved && isNotDeleted;
    }).sort((a, b) => {
      // Sort alphabetically by name
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    console.log("Selectable users (filtered):", filtered.length, filtered);
    return filtered;
  }, [users]);
  
  const selectedUser = useMemo(() => {
    if (userId) {
      return selectableUsers.find(u => u.uid === userId);
    }
    return selectableUsers[0];
  }, [userId, selectableUsers]);
  
  const handleUserSelect = (user: UserProfile) => {
    router.push(`/admin/dashboard/inventory?userId=${user.uid}`);
    setUserDialogOpen(false);
    setUserSearchQuery("");
  };
  
  // Normalize user ID (handle both id and uid fields) - ensure it's a valid string
  const normalizedUserId = selectedUser?.uid || selectedUser?.id;
  const isValidUserId = normalizedUserId && typeof normalizedUserId === 'string' && normalizedUserId.trim() !== '';
  
  const { data: inventory, loading: inventoryLoading, error: inventoryError } = useCollection<InventoryItem>(
    isValidUserId ? `users/${normalizedUserId}/inventory` : ""
  );
  const { data: shipped, loading: shippedLoading, error: shippedError } = useCollection<ShippedItem>(
    isValidUserId ? `users/${normalizedUserId}/shipped` : ""
  );
  const { data: ebayConnections } = useCollection<EbayConnectionDoc>(
    isValidUserId ? `users/${normalizedUserId}/ebayConnections` : ""
  );
  const selectedEbayListings = useMemo(() => {
    const rows = new Map<string, { id: string; title: string; sku: string; status: string; source: string }>();
    for (const conn of ebayConnections) {
      const selectedMeta = Array.isArray(conn.selectedListings) ? conn.selectedListings : [];
      for (const row of selectedMeta) {
        const id = row.id || row.listingId || row.offerId || "";
        if (!id) continue;
        rows.set(id, {
          id,
          title: row.title || id,
          sku: row.sku || "-",
          status: row.status || "-",
          source: row.source === "trading" ? "Seller Hub" : "Inventory API",
        });
      }
      const list = Array.isArray(conn.selectedListingIds) ? conn.selectedListingIds : [];
      for (const id of list) {
        if (typeof id === "string" && id.trim() && !rows.has(id.trim())) {
          rows.set(id.trim(), {
            id: id.trim(),
            title: id.trim(),
            sku: "-",
            status: "-",
            source: "eBay",
          });
        }
      }
    }
    return Array.from(rows.values());
  }, [ebayConnections]);

  return (
    <Card className="border-2 shadow-xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
              <Package className="h-6 w-6" />
              Inventory Management
            </CardTitle>
            <CardDescription className="text-purple-100 mt-2">
              {selectedUser ? `Managing inventory for ${selectedUser.name}` : "Select a user to manage their inventory"}
            </CardDescription>
          </div>
          <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Package className="h-7 w-7 text-white" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {(inventoryError || shippedError) && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <div className="font-semibold">Firestore access error</div>
            <div className="text-xs mt-1">
              {String((inventoryError || shippedError)?.message || "Missing or insufficient permissions.")}
            </div>
            <div className="text-xs mt-2">
              If this is an admin account, confirm your `users/{uid}` doc has <span className="font-mono">role: \"admin\"</span> (or <span className="font-mono">roles: [\"admin\"]</span>).
            </div>
          </div>
        )}
        {/* User Selector */}
        <div className="mb-6 pb-6 border-b">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Select User:</span>
            </div>
            {usersError && (
              <Button
                variant="destructive"
                size="sm"
                onClick={clearFirestoreCache}
                className="text-xs"
              >
                Clear Firestore Cache (Fix Errors)
              </Button>
            )}
            <div className="flex-1 w-full sm:w-auto">
              {usersLoading ? (
                <Skeleton className="h-11 w-full sm:w-[300px]" />
              ) : (
                <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={userDialogOpen}
                      className="w-full sm:w-[300px] h-11 justify-between shadow-sm min-w-0 px-3"
                    >
                      <span className="truncate text-left flex-1 min-w-0 mr-2">
                        {selectedUser
                          ? `${selectedUser.name || 'Unnamed User'} (${selectedUser.email})`
                          : selectableUsers.length === 0
                          ? "No users available"
                          : "Select a user to manage inventory"}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="p-0">
                    <DialogTitle className="sr-only">Select a user</DialogTitle>
                    <div className="p-3 border-b">
                      <Input
                        autoFocus
                        placeholder="Search users..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const normalized = userSearchQuery.trim().toLowerCase();
                            const matches = selectableUsers.filter(user =>
                              user.name?.toLowerCase().includes(normalized) ||
                              user.email?.toLowerCase().includes(normalized)
                            );
                            const first = matches[0];
                            if (first) {
                              handleUserSelect(first);
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {selectableUsers
                        .filter(user =>
                          user.name?.toLowerCase().includes(userSearchQuery.trim().toLowerCase()) ||
                          user.email?.toLowerCase().includes(userSearchQuery.trim().toLowerCase())
                        )
                        .map((user, index) => (
                          <div
                            key={user.uid || `user-${index}`}
                            role="button"
                            tabIndex={0}
                            className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer min-w-0 ${
                              selectedUser?.uid === user.uid ? "bg-accent" : ""
                            }`}
                            onClick={() => handleUserSelect(user)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUserSelect(user);
                              }
                            }}
                          >
                            <span className="truncate flex-1">
                              {user.name || 'Unnamed User'} ({user.email})
                            </span>
                            {selectedUser?.uid === user.uid && (
                              <span className="text-primary">✓</span>
                            )}
                          </div>
                        ))}
                      {selectableUsers.length === 0 && (
                        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                          No users available
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>
        
        {usersLoading || !selectedUser ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Selected eBay Listings</CardTitle>
                <CardDescription>
                  Listings selected for order sync/fulfillment for this user.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedEbayListings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No eBay listings selected yet.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {selectedEbayListings.map((row) => (
                      <div key={row.id} className="rounded-md border p-2">
                        <p className="text-sm font-medium truncate">{row.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.sku !== "-" ? `SKU: ${row.sku} · ` : ""}
                          {row.status} · {row.source}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <AdminInventoryManagement
              selectedUser={selectedUser}
              inventory={inventory}
              shipped={shipped}
              loading={inventoryLoading}
              initialSection={section || undefined}
              initialRequestTab={tab || undefined}
              initialRequestId={requestId || undefined}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminInventoryPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={
        <Card className="border-2 shadow-xl">
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full rounded-xl" />
          </CardContent>
        </Card>
      }>
        <InventoryContent />
      </Suspense>
    </div>
  );
}

