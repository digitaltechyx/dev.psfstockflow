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
import { ShieldCheck, Users, KeyRound, ListChecks, UserCog, MapPin, Loader2, AlertCircle, Crown, User, HandCoins } from "lucide-react";
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

  const roleMeta: Record<string, { icon: React.ReactNode; accent: string }> = {
    admin: { icon: <Crown className="h-5 w-5" />, accent: "from-violet-500/15 to-purple-600/10 border-violet-200 dark:border-violet-800/50" },
    user: { icon: <User className="h-5 w-5" />, accent: "from-blue-500/15 to-cyan-500/10 border-blue-200 dark:border-blue-800/50" },
    commission_agent: { icon: <HandCoins className="h-5 w-5" />, accent: "from-emerald-500/15 to-teal-500/10 border-emerald-200 dark:border-emerald-800/50" },
    sub_admin: { icon: <UserCog className="h-5 w-5" />, accent: "from-amber-500/15 to-orange-500/10 border-amber-200 dark:border-amber-800/50" },
  };

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-primary/5 px-6 py-8 shadow-sm">
        <div className="relative flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-inner">
              <ShieldCheck className="h-6 w-6" />
            </span>
            Roles & Permissions
          </h1>
          <p className="text-muted-foreground max-w-xl">
            Full control over roles and feature access. Assign roles and granular permissions to users.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "overview" | "assign" | "locations")}>
        <TabsList className="inline-flex h-12 w-full max-w-2xl rounded-xl border bg-muted/40 p-1 shadow-inner">
          <TabsTrigger
            value="overview"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
          >
            <ListChecks className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="assign"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
          >
            <UserCog className="h-4 w-4" />
            Assign to User
          </TabsTrigger>
          <TabsTrigger
            value="locations"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
          >
            <MapPin className="h-4 w-4" />
            Assign Location
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8 mt-8">
          <Card className="overflow-hidden rounded-2xl border-2 shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Users className="h-5 w-5" />
                </span>
                Roles
              </CardTitle>
              <CardDescription className="text-base">
                System roles. Users can have multiple roles and get access to all corresponding dashboards.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {usersLoading ? (
                <Skeleton className="h-40 w-full rounded-xl" />
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {ROLE_DEFINITIONS.map((role) => {
                    const meta = roleMeta[role.value];
                    const count = roleCounts[role.value] ?? 0;
                    return (
                      <div
                        key={role.value}
                        className={`group relative overflow-hidden rounded-xl border-2 bg-gradient-to-br ${meta?.accent ?? ""} p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background/80 text-foreground shadow-sm">
                            {meta?.icon}
                          </span>
                          <Badge variant="secondary" className="shrink-0 font-semibold">
                            {count} users
                          </Badge>
                        </div>
                        <h3 className="mt-3 font-semibold text-foreground">{role.label}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{role.description}</p>
                        <p className="mt-2 text-xs text-muted-foreground/90">{role.dashboardAccess}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-2 shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  <KeyRound className="h-5 w-5" />
                </span>
                Client Features
              </CardTitle>
              <CardDescription className="text-base">
                Permissions for the client dashboard. Grant or revoke per user in Assign to User.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {CLIENT_FEATURES_CONFIG.map((f) => (
                  <div
                    key={f.value}
                    className="flex flex-col rounded-xl border-2 border-border/60 bg-card p-4 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md"
                  >
                    <span className="font-semibold text-foreground">{f.label}</span>
                    <span className="mt-1 text-sm text-muted-foreground leading-relaxed">{f.description}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-2 shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                Admin Features
              </CardTitle>
              <CardDescription className="text-base">
                Permissions for the admin panel. Sub admins only see modules for which they have the matching feature.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ADMIN_FEATURES_CONFIG.map((f) => (
                  <div
                    key={f.value}
                    className="flex flex-col rounded-xl border-2 border-border/60 bg-card p-4 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md"
                  >
                    <span className="font-semibold text-foreground">{f.label}</span>
                    <span className="mt-1 text-sm text-muted-foreground leading-relaxed">{f.description}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assign" className="mt-8">
          <Card className="overflow-hidden rounded-2xl border-2 shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <UserCog className="h-5 w-5" />
                </span>
                Assign roles and permissions
              </CardTitle>
              <CardDescription className="text-base">
                Select a user and update their roles and feature access. Changes take effect immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select user</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-full max-w-md rounded-xl border-2 h-11">
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
                <div className="rounded-xl border-2 border-border/60 bg-card p-6 shadow-sm">
                  <RoleFeatureManagement
                    user={selectedUser}
                    onSuccess={() => {
                      setSelectedUserId("");
                    }}
                  />
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Select a user above to manage their roles and permissions.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="mt-8">
          <AssignLocationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
