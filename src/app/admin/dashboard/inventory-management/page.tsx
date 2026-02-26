"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useCollection } from "@/hooks/use-collection";
import type { UserProfile, InventoryItem, ShippedItem } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Package, Users, ChevronsUpDown, Check, Boxes, AlertTriangle, Truck, Clock } from "lucide-react";
import { AdminInventoryManagement } from "@/components/admin/admin-inventory-management";
import { Skeleton } from "@/components/ui/skeleton";

type ShipmentRequestLite = { status?: string };

export default function AdminInventoryManagementPage() {
  const { userProfile: adminUser } = useAuth();
  const { user: authUser } = useAuth();
  const { data: users, loading: usersLoading } = useCollection<UserProfile>("users");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");

  const approvedUsers = useMemo(() => {
    if (!users || users.length === 0) return [];
    if (!adminUser?.uid) return users.filter((user) => user.status !== "deleted" && (user.status === "approved" || !user.status));

    const filtered = users
      .filter((user) => user.status !== "deleted")
      .filter((user) => user.status === "approved" || !user.status);

    const admin = filtered.find((user) => user.uid === adminUser.uid);
    const others = filtered.filter((user) => user.uid !== adminUser.uid);
    const sortedOthers = others.sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
    return admin ? [admin, ...sortedOthers] : sortedOthers;
  }, [users, adminUser]);

  useEffect(() => {
    if (selectedUserId) return;
    if (adminUser?.uid && approvedUsers.length > 0) {
      const admin = approvedUsers.find((user) => user.uid === adminUser.uid);
      if (admin) {
        setSelectedUserId(admin.uid);
        return;
      }
    }
    if (approvedUsers.length > 0) {
      setSelectedUserId(approvedUsers[0].uid);
    }
  }, [approvedUsers, adminUser, selectedUserId]);

  const selectedUser = approvedUsers.find((u) => u.uid === selectedUserId) || null;
  const inventoryPath = selectedUser?.uid ? `users/${selectedUser.uid}/inventory` : "";
  const shippedPath = selectedUser?.uid ? `users/${selectedUser.uid}/shipped` : "";

  const { data: inventory, loading: inventoryLoading } = useCollection<InventoryItem>(inventoryPath);
  const { data: shipped, loading: shippedLoading } = useCollection<ShippedItem>(shippedPath);
  const shipmentRequestsPath = selectedUser?.uid ? `users/${selectedUser.uid}/shipmentRequests` : "";
  const { data: shipmentRequests } = useCollection<ShipmentRequestLite>(shipmentRequestsPath);

  const stats = useMemo(() => {
    const inv = inventory ?? [];
    const ship = shipped ?? [];
    const totalUnits = inv.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const lowStockSkus = inv.filter((item) => (Number(item.quantity) || 0) <= 10).length;
    const pendingRequests = (shipmentRequests ?? []).filter(
      (r) => (r.status || "").toLowerCase() === "pending"
    ).length;
    return {
      totalUnits,
      skuCount: inv.length,
      lowStockSkus,
      shippedOrders: ship.length,
      pendingRequests,
    };
  }, [inventory, shipped, shipmentRequests]);

  const ebayRefreshDoneForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!authUser || !selectedUser?.uid || inventoryLoading || !inventory?.length) return;
    const items = inventory as (InventoryItem & { source?: string; ebayConnectionId?: string })[];
    const connectionIds = [...new Set(items.filter((i) => i.source === "ebay" && i.ebayConnectionId).map((i) => i.ebayConnectionId!))];
    if (connectionIds.length === 0) return;
    if (ebayRefreshDoneForUser.current === selectedUser.uid) return;
    ebayRefreshDoneForUser.current = selectedUser.uid;
    (async () => {
      const token = await authUser.getIdToken();
      for (const connectionId of connectionIds) {
        try {
          await fetch("/api/integrations/ebay/refresh-inventory", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ userId: selectedUser.uid, connectionId }),
          });
        } catch {
          // ignore
        }
      }
    })();
  }, [authUser, selectedUser?.uid, inventoryLoading, inventory]);

  return (
    <div className="space-y-6">
      {selectedUser && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-900">Total Inventory</CardTitle>
              <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
                <Boxes className="h-5 w-5 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              {inventoryLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-blue-900">{stats.totalUnits.toLocaleString()}</div>
                  <p className="text-xs text-blue-700 mt-1">Units across {stats.skuCount} SKU(s)</p>
                </>
              )}
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
                  <div className="text-3xl font-bold text-amber-900">{stats.lowStockSkus}</div>
                  <p className="text-xs text-amber-700 mt-1">Qty ≤ 10</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card className="border-2 border-teal-200/50 bg-gradient-to-br from-teal-50 to-teal-100/50 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-teal-900">Shipped Orders</CardTitle>
              <div className="h-10 w-10 rounded-full bg-teal-500 flex items-center justify-center shadow-md">
                <Truck className="h-5 w-5 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              {shippedLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-teal-900">{stats.shippedOrders}</div>
                  <p className="text-xs text-teal-700 mt-1">Total shipments</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card className="border-2 border-orange-200/50 bg-gradient-to-br from-orange-50 to-orange-100/50 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-900">Pending Requests</CardTitle>
              <div className="h-10 w-10 rounded-full bg-orange-500 flex items-center justify-center shadow-md">
                <Clock className="h-5 w-5 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <>
                <div className="text-3xl font-bold text-orange-900">{stats.pendingRequests}</div>
                <p className="text-xs text-orange-700 mt-1">Awaiting fulfillment</p>
              </>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-2 shadow-xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
                <Package className="h-6 w-6" />
                Inventory Management
              </CardTitle>
              <CardDescription className="text-purple-100 mt-2">
                Manage inventory for users
              </CardDescription>
            </div>
            <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Package className="h-7 w-7 text-white" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-6 pb-6 border-b">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Select User:</span>
              </div>
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
                            ? `${selectedUser.name || "Unnamed User"} (${selectedUser.email})`
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
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const normalized = userSearchQuery.trim().toLowerCase();
                              const matches = approvedUsers.filter(
                                (user) =>
                                  user.name?.toLowerCase().includes(normalized) ||
                                  user.email?.toLowerCase().includes(normalized)
                              );
                              const first = matches[0] ?? approvedUsers[0];
                              if (first) {
                                setSelectedUserId(first.uid);
                                setUserDialogOpen(false);
                                setUserSearchQuery("");
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {approvedUsers
                          .filter(
                            (user) =>
                              user.name?.toLowerCase().includes(userSearchQuery.trim().toLowerCase()) ||
                              user.email?.toLowerCase().includes(userSearchQuery.trim().toLowerCase())
                          )
                          .map((user, index) => (
                            <div
                              key={user.uid || `user-${index}`}
                              role="button"
                              tabIndex={0}
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer min-w-0"
                              onClick={() => {
                                setSelectedUserId(user.uid);
                                setUserDialogOpen(false);
                                setUserSearchQuery("");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setSelectedUserId(user.uid);
                                  setUserDialogOpen(false);
                                  setUserSearchQuery("");
                                }
                              }}
                            >
                              <Check className={`h-4 w-4 shrink-0 ${selectedUserId === user.uid ? "opacity-100" : "opacity-0"}`} />
                              <span className="truncate min-w-0 flex-1">
                                {user.name || "Unnamed User"} ({user.email})
                              </span>
                            </div>
                          ))}
                        {approvedUsers.filter(
                          (user) =>
                            user.name?.toLowerCase().includes(userSearchQuery.trim().toLowerCase()) ||
                            user.email?.toLowerCase().includes(userSearchQuery.trim().toLowerCase())
                        ).length === 0 && (
                          <div key="no-users" className="px-3 py-4 text-sm text-muted-foreground">
                            No users found.
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </div>

          {!selectedUser ? (
            <div className="text-center py-16">
              <div className="mx-auto h-20 w-20 rounded-full bg-purple-100 flex items-center justify-center mb-4">
                <Package className="h-10 w-10 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">No user selected</h3>
              <p className="text-muted-foreground">
                Please select a user from the dropdown above to manage their inventory
              </p>
            </div>
          ) : (
            <AdminInventoryManagement
              selectedUser={selectedUser}
              inventory={inventory ?? []}
              shipped={shipped ?? []}
              loading={inventoryLoading || shippedLoading}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
