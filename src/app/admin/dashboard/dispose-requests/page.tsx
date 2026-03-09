"use client";

import React, { Suspense, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DisposeRequestsManagement } from "@/components/admin/dispose-requests-management";
import { useCollection } from "@/hooks/use-collection";
import { useManagedUsers } from "@/hooks/use-managed-users";
import type { UserProfile, InventoryItem } from "@/types";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Users, ChevronsUpDown, Search, X, RotateCcw } from "lucide-react";
import { hasRole } from "@/lib/permissions";
import { formatUserDisplayName } from "@/lib/format-user-display";

function DisposeRequestsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const requestId = searchParams.get("requestId");
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
    const params = new URLSearchParams({ userId: user.uid });
    if (requestId) params.set("requestId", requestId);
    router.push(`/admin/dashboard/dispose-requests?${params.toString()}`);
    setUserDialogOpen(false);
    setUserSearchQuery("");
  };

  return (
    <Card className="border-2 shadow-xl overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Dispose Requests</h1>
              <p className="text-sm text-muted-foreground">Manage dispose requests per user</p>
            </div>
          </div>
          <div className="flex-1 min-w-0 sm:max-w-xs">
            <label className="text-sm font-medium mb-2 block">Select User</label>
            <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogTitle>Select User</DialogTitle>
                <div className="space-y-4 mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                    {userSearchQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => setUserSearchQuery("")}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="max-h-[400px] overflow-y-auto space-y-1">
                    {selectableUsers.filter(user =>
                      user.name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                      user.email?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                      user.clientId?.toLowerCase().includes(userSearchQuery.toLowerCase())
                    ).map((user) => (
                      <Button
                        key={user.uid}
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => handleUserSelect(user)}
                      >
                        <div className="flex flex-col items-start">
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
              className="w-full justify-between"
              onClick={() => setUserDialogOpen(true)}
            >
              <span className="truncate">
                {selectedUser
                  ? formatUserDisplayName(selectedUser, { showEmail: true })
                  : "Select a user"}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </div>
        </div>
        {usersLoading || inventoryLoading || !selectedUser ? (
          <div className="space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : (
          <DisposeRequestsManagement
            selectedUser={selectedUser}
            inventory={inventory}
            initialRequestId={requestId || undefined}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDisposeRequestsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={
        <Card className="border-2 shadow-xl">
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full rounded-xl" />
          </CardContent>
        </Card>
      }>
        <DisposeRequestsContent />
      </Suspense>
    </div>
  );
}
