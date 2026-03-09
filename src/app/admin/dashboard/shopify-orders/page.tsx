"use client";

import React, { Suspense, useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSearchParams, useRouter } from "next/navigation";
import { useManagedUsers } from "@/hooks/use-managed-users";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { hasRole } from "@/lib/permissions";
import { formatUserDisplayName } from "@/lib/format-user-display";
import { ShoppingBag, Users, ChevronsUpDown, ExternalLink, Truck, Loader2 } from "lucide-react";
import type { UserProfile, ShopifyOrder } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";

function ShopifyOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [orders, setOrders] = useState<Array<ShopifyOrder & { id: string }>>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [fulfillDialogOpen, setFulfillDialogOpen] = useState(false);
  const [fulfillOrder, setFulfillOrder] = useState<(ShopifyOrder & { id: string }) | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingCompany, setTrackingCompany] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [fulfilling, setFulfilling] = useState(false);

  const { managedUsers: users, loading: usersLoading } = useManagedUsers();
  const selectableUsers = useMemo(() => {
    return users
      .filter((u) => hasRole(u, "user") || hasRole(u, "commission_agent"))
      .filter((u) => u.status === "approved" || !u.status)
      .filter((u) => u.status !== "deleted")
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [users]);

  const selectedUser = useMemo(() => {
    if (userId) return selectableUsers.find((u) => u.uid === userId);
    return selectableUsers[0];
  }, [userId, selectableUsers]);

  const handleUserSelect = (user: UserProfile) => {
    router.push(`/admin/dashboard/shopify-orders?userId=${user.uid}`);
    setUserDialogOpen(false);
    setUserSearchQuery("");
  };

  useEffect(() => {
    if (!selectedUser?.uid || !authUser) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    setOrdersLoading(true);
    authUser.getIdToken().then((token) => {
      if (cancelled) return;
      fetch(`/api/shopify/orders?userId=${encodeURIComponent(selectedUser.uid)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setOrders(Array.isArray(data.orders) ? data.orders : []);
        })
        .catch(() => {
          if (!cancelled) setOrders([]);
        })
        .finally(() => {
          if (!cancelled) setOrdersLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedUser?.uid, authUser]);

  const openFulfillDialog = (order: ShopifyOrder & { id: string }) => {
    setFulfillOrder(order);
    setTrackingNumber("");
    setTrackingCompany("");
    setNotifyCustomer(true);
    setFulfillDialogOpen(true);
  };

  const submitFulfill = async () => {
    if (!fulfillOrder || !selectedUser?.uid || !authUser) return;
    setFulfilling(true);
    try {
      const token = await authUser.getIdToken();
      const res = await fetch("/api/shopify/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: selectedUser.uid,
          shop: fulfillOrder.shop,
          orderId: fulfillOrder.id,
          tracking_number: trackingNumber || undefined,
          tracking_company: trackingCompany || undefined,
          notify_customer: notifyCustomer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Order marked as fulfilled" });
        setFulfillDialogOpen(false);
        setFulfillOrder(null);
        // Refresh orders
        const t = await authUser.getIdToken();
        const r = await fetch(`/api/shopify/orders?userId=${encodeURIComponent(selectedUser.uid)}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        const d = await r.json();
        if (Array.isArray(d.orders)) setOrders(d.orders);
      } else {
        toast({
          variant: "destructive",
          title: "Fulfillment failed",
          description: typeof data.error === "string" ? data.error : "Unknown error",
        });
      }
    } finally {
      setFulfilling(false);
    }
  };

  const createLabelUrl = (order: ShopifyOrder & { id: string }) => {
    const shop = order.shop?.replace(".myshopify.com", "") || "";
    if (!shop) return "#";
    return `https://${order.shop}/admin/orders/${order.id}`;
  };

  const formatDate = (s: string | undefined) => {
    if (!s) return "—";
    try {
      const d = new Date(s);
      return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { dateStyle: "short" });
    } catch {
      return s;
    }
  };

  const addressLine = (a: ShopifyOrder["shipping_address"]) => {
    if (!a) return "—";
    const parts = [a.address1, a.city, a.province, a.country, a.zip].filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  };

  return (
    <Card className="border-2 shadow-xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-700 text-white pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
              <ShoppingBag className="h-6 w-6" />
              Shopify Orders
            </CardTitle>
            <CardDescription className="text-green-100 mt-2">
              {selectedUser
                ? `Orders for ${selectedUser.name} (synced from connected Shopify store)`
                : "Select a user to view their Shopify orders"}
            </CardDescription>
          </div>
          <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <ShoppingBag className="h-7 w-7 text-white" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="mb-6 pb-6 border-b">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
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
                      className="w-full sm:w-[300px] h-11 justify-between"
                    >
                      <span className="truncate text-left flex-1 mr-2">
                        {selectedUser
                          ? formatUserDisplayName(selectedUser, { showEmail: true })
                          : selectableUsers.length === 0
                            ? "No users"
                            : "Select user"}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="p-0">
                    <DialogTitle className="sr-only">Select user</DialogTitle>
                    <div className="p-3 border-b">
                      <Input
                        placeholder="Search users..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {selectableUsers
                        .filter(
                          (u) =>
                            !userSearchQuery.trim() ||
                            (u.name || "").toLowerCase().includes(userSearchQuery.trim().toLowerCase()) ||
                            (u.email || "").toLowerCase().includes(userSearchQuery.trim().toLowerCase()) ||
                            (u.clientId || "").toLowerCase().includes(userSearchQuery.trim().toLowerCase())
                        )
                        .map((u) => (
                          <div
                            key={u.uid}
                            role="button"
                            tabIndex={0}
                            className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer ${
                              selectedUser?.uid === u.uid ? "bg-accent" : ""
                            }`}
                            onClick={() => handleUserSelect(u)}
                          >
                            <span className="truncate flex-1">
                              {formatUserDisplayName(u, { showEmail: true })}
                            </span>
                            {selectedUser?.uid === u.uid && <span className="text-primary">✓</span>}
                          </div>
                        ))}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>

        {!selectedUser ? (
          <p className="text-muted-foreground text-center py-8">Select a user to see their Shopify orders.</p>
        ) : ordersLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : orders.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No Shopify orders yet. Orders will appear here when they are created on the connected store (webhook sync).
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <span className="font-medium">{order.name || `#${order.order_number}`}</span>
                    </TableCell>
                    <TableCell>{formatDate(order.created_at)}</TableCell>
                    <TableCell>
                      {order.email || [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={addressLine(order.shipping_address)}>
                      {addressLine(order.shipping_address)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={order.fulfillment_status === "fulfilled" ? "default" : "secondary"}>
                        {order.fulfillment_status || "unfulfilled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {order.fulfillment_status !== "fulfilled" && (
                          <Button size="sm" variant="outline" onClick={() => openFulfillDialog(order)}>
                            <Truck className="h-4 w-4 mr-1" />
                            Mark fulfilled
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" asChild>
                          <a href={createLabelUrl(order)} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Create label
                          </a>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={fulfillDialogOpen} onOpenChange={setFulfillDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark order as fulfilled</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Tracking number (optional)</Label>
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="1Z999..."
                />
              </div>
              <div className="grid gap-2">
                <Label>Carrier (optional)</Label>
                <Input
                  value={trackingCompany}
                  onChange={(e) => setTrackingCompany(e.target.value)}
                  placeholder="USPS, FedEx, UPS..."
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="notify"
                  checked={notifyCustomer}
                  onCheckedChange={(v) => setNotifyCustomer(v === true)}
                />
                <Label htmlFor="notify">Notify customer by email</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFulfillDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitFulfill} disabled={fulfilling}>
                {fulfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Fulfill
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default function AdminShopifyOrdersPage() {
  return (
    <div className="space-y-6">
      <Suspense
        fallback={(
          <Card className="border-2 shadow-xl">
            <CardContent className="p-6">
              <Skeleton className="h-64 w-full rounded-xl" />
            </CardContent>
          </Card>
        )}
      >
        <ShopifyOrdersContent />
      </Suspense>
    </div>
  );
}
