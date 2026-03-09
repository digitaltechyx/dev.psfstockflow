"use client";

import React, { Suspense, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductReturnsManagement } from "@/components/admin/product-returns-management";
import { useCollection } from "@/hooks/use-collection";
import { useManagedUsers } from "@/hooks/use-managed-users";
import type { UserProfile, InventoryItem } from "@/types";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Package, ChevronsUpDown, Search, X } from "lucide-react";
import { hasRole } from "@/lib/permissions";
import { formatUserDisplayName } from "@/lib/format-user-display";
import { cn } from "@/lib/utils";

function ProductReturnsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");

  const { managedUsers: users, loading: usersLoading } = useManagedUsers();

  const selectableUsers = useMemo(() => {
    const filtered = users.filter(user => {
      if (hasRole(user, "admin")) return false;
      const isApproved = user.status === "approved" || !user.status;
      const isNotDeleted = user.status !== "deleted";
      return isApproved && isNotDeleted;
    }).sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    return filtered;
  }, [users]);

  const selectedUser = useMemo(() => {
    if (userId) {
      return selectableUsers.find(u => u.uid === userId);
    }
    return selectableUsers[0];
  }, [userId, selectableUsers]);

  const { data: inventory, loading: inventoryLoading } = useCollection<InventoryItem>(
    selectedUser ? `users/${selectedUser.uid}/inventory` : ""
  );

  const handleUserSelect = (user: UserProfile) => {
    router.push(`/admin/dashboard/product-returns?userId=${user.uid}`);
    setUserDialogOpen(false);
    setUserSearchQuery("");
  };

  return (
    <Card className="border-2 shadow-xl overflow-hidden rounded-xl border-border/50">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 shadow-sm">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Product Returns</h1>
              <p className="text-sm text-muted-foreground">Manage return requests per user</p>
            </div>
          </div>
          <div className="flex-1 min-w-0 sm:max-w-sm">
            <label className="text-sm font-medium mb-2 block text-muted-foreground">Select User</label>
            <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
              <DialogContent className="sm:max-w-md rounded-xl">
                <DialogTitle>Select User</DialogTitle>
                <div className="space-y-4 mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or email..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="pl-10 rounded-lg"
                    />
                    {userSearchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0 rounded-full"
                        onClick={() => setUserSearchQuery("")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="max-h-[360px] overflow-y-auto space-y-1 pr-1 rounded-lg border bg-muted/30 p-2">
                    {selectableUsers.filter(user =>
                      user.name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                      user.email?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                      user.clientId?.toLowerCase().includes(userSearchQuery.toLowerCase())
                    ).map((user) => (
                      <Button
                        key={user.uid}
                        variant="ghost"
                        className={cn(
                          "w-full justify-start rounded-lg h-auto py-2.5 px-3",
                          selectedUser?.uid === user.uid && "bg-teal-500/10 text-teal-700 dark:text-teal-300"
                        )}
                        onClick={() => handleUserSelect(user)}
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium">{formatUserDisplayName(user, { showEmail: false })}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              className="w-full justify-between h-11 rounded-lg font-medium border-border/80 hover:bg-muted/50"
              onClick={() => setUserDialogOpen(true)}
            >
              <span className="truncate">
                {selectedUser
                  ? formatUserDisplayName(selectedUser, { showEmail: true })
                  : "Select a user"}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
            </Button>
          </div>
        </div>
        {usersLoading || inventoryLoading || !selectedUser ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : (
          <ProductReturnsManagement selectedUser={selectedUser} inventory={inventory} />
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminProductReturnsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <Suspense fallback={
        <Card className="border-2 shadow-xl rounded-xl">
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full rounded-xl" />
          </CardContent>
        </Card>
      }>
        <ProductReturnsContent />
      </Suspense>
    </div>
  );
}

