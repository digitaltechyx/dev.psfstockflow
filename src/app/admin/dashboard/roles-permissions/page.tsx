"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import type { UserProfile } from "@/types";
import { hasRole, getUserRoles } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Users, KeyRound, ListChecks, UserCog, MapPin, Loader2, AlertCircle } from "lucide-react";
import { ROLE_DEFINITIONS, CLIENT_FEATURES_CONFIG, ADMIN_FEATURES_CONFIG } from "@/lib/roles-permissions-config";
import { RoleFeatureManagement } from "@/components/admin/role-feature-management";
import { AssignLocationTab } from "@/components/admin/assign-location-tab";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUserDisplayName } from "@/lib/format-user-display";

export default function RolesPermissionsPage() {
  const router = useRouter();
  const { userProfile: adminUser } = useAuth();
  const { data: users, loading: usersLoading } = useCollection<UserProfile>("users");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"overview" | "assign" | "locations">("overview");

  const isSuperAdmin = adminUser && hasRole(adminUser, "admin");

  useEffect(() => {
    if (adminUser && !isSuperAdmin) {
      router.replace("/admin/dashboard");
    }
  }, [adminUser, isSuperAdmin, router]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { admin: 0, user: 0, commission_agent: 0, sub_admin: 0 };
    users.forEach((u) => {
      const roles = getUserRoles(u);
      roles.forEach((r) => {
        if (r in counts) counts[r]++;
      });
      if (roles.length === 0 && u.role) {
        const r = u.role as keyof typeof counts;
        if (r in counts) counts[r]++;
      }
    });
    return counts;
  }, [users]);

  const nonAdminUsers = useMemo(
    () => users.filter((u) => u.uid !== adminUser?.uid && u.status !== "deleted"),
    [users, adminUser]
  );

  const sortedUsersForSelect = useMemo(
    () =>
      [...nonAdminUsers].sort((a, b) => {
        const nameA = (a.name || a.email || a.uid || "").toLowerCase();
        const nameB = (b.name || b.email || b.uid || "").toLowerCase();
        return nameA.localeCompare(nameB);
      }),
    [nonAdminUsers]
  );

  const selectedUser = useMemo(
    () => nonAdminUsers.find((u) => u.uid === selectedUserId),
    [nonAdminUsers, selectedUserId]
  );

  if (!adminUser) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-amber-500" />
        <p className="text-center text-muted-foreground">You do not have access to Roles & Permissions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" />
          Roles & Permissions
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Full control over roles and feature access. Assign roles and granular permissions to users.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "overview" | "assign" | "locations")}>
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="assign" className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Assign to User
          </TabsTrigger>
          <TabsTrigger value="locations" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Assign Location
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Roles
              </CardTitle>
              <CardDescription>
                System roles. Users can have multiple roles and get access to all corresponding dashboards.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <Skeleton className="h-32 w-full rounded-lg" />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {ROLE_DEFINITIONS.map((role) => (
                    <Card key={role.value} className="border bg-card">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{role.label}</CardTitle>
                          <Badge variant="secondary">{roleCounts[role.value] ?? 0} users</Badge>
                        </div>
                        <CardDescription className="text-xs">{role.description}</CardDescription>
                        <p className="text-xs text-muted-foreground mt-1">{role.dashboardAccess}</p>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Client Features
              </CardTitle>
              <CardDescription>
                Permissions for the client dashboard. Grant or revoke per user in Assign to User.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CLIENT_FEATURES_CONFIG.map((f) => (
                  <div
                    key={f.value}
                    className="flex flex-col rounded-lg border bg-muted/30 p-3"
                  >
                    <span className="font-medium text-sm">{f.label}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">{f.description}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Admin Features
              </CardTitle>
              <CardDescription>
                Permissions for the admin panel. Sub admins only see modules for which they have the matching feature.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ADMIN_FEATURES_CONFIG.map((f) => (
                  <div
                    key={f.value}
                    className="flex flex-col rounded-lg border bg-muted/30 p-3"
                  >
                    <span className="font-medium text-sm">{f.label}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">{f.description}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assign" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Assign roles and permissions</CardTitle>
              <CardDescription>
                Select a user and update their roles and feature access. Changes take effect immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select user</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder="Choose a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedUsersForSelect.map((u) => (
                      <SelectItem key={u.uid} value={u.uid}>
                        {formatUserDisplayName(u, { showEmail: true })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUser ? (
                <div className="rounded-lg border bg-card p-4">
                  <RoleFeatureManagement
                    user={selectedUser}
                    onSuccess={() => {
                      setSelectedUserId("");
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Select a user above to manage their roles and permissions.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="mt-6">
          <AssignLocationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
