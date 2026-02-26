"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useCollection } from "@/hooks/use-collection";
import type { UserProfile, Invoice } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Shield, Receipt, Bell, Truck, PackageCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { collection, collectionGroup, getCountFromServer, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AdminDashboardPage() {
  const { userProfile: adminUser } = useAuth();
  const { data: users } = useCollection<UserProfile>("users");

  const activeUsersCount = useMemo(() => {
    if (!users || !adminUser?.uid) return 0;
    return users.filter((user) => 
      user.uid !== adminUser.uid && (user.status === "approved" || !user.status) && user.status !== "deleted"
  ).length;
  }, [users, adminUser]);
  
  const pendingUsersCount = useMemo(() => {
    if (!users || !adminUser?.uid) return 0;
    return users.filter((user) => 
      user.uid !== adminUser.uid && user.status === "pending"
    ).length;
  }, [users, adminUser]);

  // Requests stats (all users) – pending only
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [requestsLoading, setRequestsLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        setRequestsLoading(true);

        const countStatuses = async (collectionName: string, statuses: string[]) => {
          const counts = await Promise.all(
            statuses.map(async (status) => {
              try {
                const q = query(collectionGroup(db, collectionName), where("status", "==", status));
                const snap = await getCountFromServer(q);
                return snap.data().count || 0;
              } catch (error) {
                // Permission denied or other errors - return 0
                console.warn(`Failed to count ${collectionName} with status ${status}:`, error);
                return 0;
              }
            })
          );
          return counts.reduce((a, b) => a + b, 0);
        };

        const userIdsForFallback = (users || [])
          .map((u: any) => String(u?.uid || u?.id || ""))
          .filter((id) => id && id.trim() !== "" && id !== adminUser?.uid);

        // Total pending requests (all types)
        const pendingCounts = await Promise.all([
          countStatuses("shipmentRequests", ["pending", "Pending"]).catch(() => 0),
          countStatuses("inventoryRequests", ["pending", "Pending"]).catch(() => 0),
          countStatuses("productReturns", ["pending", "Pending", "approved", "Approved", "in_progress", "In Progress", "in progress"]).catch(() => 0),
        ]);
        let pendingTotal = pendingCounts.reduce((a, b) => a + b, 0);

        // Fallback per-user if collectionGroup counts are blocked
        if (pendingTotal === 0 && userIdsForFallback.length > 0) {
          try {
            const perUserPending = await Promise.all(
              userIdsForFallback.map(async (uid) => {
                const [shipSnap, invSnap, prSnap] = await Promise.all([
                  getDocs(query(collection(db, `users/${uid}/shipmentRequests`), where("status", "in", ["pending", "Pending"]))),
                  getDocs(query(collection(db, `users/${uid}/inventoryRequests`), where("status", "in", ["pending", "Pending"]))),
                  getDocs(query(collection(db, `users/${uid}/productReturns`), where("status", "in", ["pending", "Pending", "approved", "Approved", "in_progress", "In Progress", "in progress"]))),
                ]);
                return shipSnap.size + invSnap.size + prSnap.size;
              })
            );
            pendingTotal = perUserPending.reduce((a, b) => a + b, 0);
          } catch {
            // ignore fallback errors
          }
        }

        setPendingRequestsCount(pendingTotal);
      } catch {
        setPendingRequestsCount(0);
      } finally {
        setRequestsLoading(false);
      }
    };

    run();
    const interval = setInterval(run, 60000);
    return () => clearInterval(interval);
  }, [users, adminUser]);

  // Orders shipped today & received units today (all users) – real-time via Firestore listeners
  const [ordersShippedToday, setOrdersShippedToday] = useState(0);
  const [receivedUnitsToday, setReceivedUnitsToday] = useState(0);
  const [shippedAndReceivedLoading, setShippedAndReceivedLoading] = useState(true);

  const toMs = useMemo(() => {
    return (v: unknown): number => {
      if (!v) return 0;
      if (typeof v === "string") {
        const t = new Date(v).getTime();
        return Number.isNaN(t) ? 0 : t;
      }
      if (typeof v === "object" && v !== null && "seconds" in v && typeof (v as { seconds: number }).seconds === "number") {
        return (v as { seconds: number }).seconds * 1000;
      }
      if (v instanceof Date) return v.getTime();
      return 0;
    };
  }, []);

  useEffect(() => {
    const adminUid = adminUser?.uid;
    if (!adminUid) {
      setOrdersShippedToday(0);
      setReceivedUnitsToday(0);
      setShippedAndReceivedLoading(false);
      return;
    }

    let loadedShipped = false;
    let loadedInventory = false;
    const maybeDone = () => {
      if (loadedShipped && loadedInventory) setShippedAndReceivedLoading(false);
    };

    const now = () => new Date();
    const getTodayBounds = () => {
      const n = now();
      const start = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0).getTime();
      const end = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0, 0).getTime();
      return { start, end };
    };
    const inToday = (ms: number, { start, end }: { start: number; end: number }) => ms >= start && ms < end;

    const unsubShipped = onSnapshot(collectionGroup(db, "shipped"), (snapshot) => {
      const { start, end } = getTodayBounds();
      let count = 0;
      snapshot.docs.forEach((d) => {
        const pathSegments = d.ref.path.split("/");
        const userId = pathSegments[1];
        if (userId === adminUid) return;
        const data = d.data() as { date?: unknown };
        const ms = toMs(data?.date);
        if (inToday(ms, { start, end })) count += 1;
      });
      setOrdersShippedToday(count);
      loadedShipped = true;
      maybeDone();
    }, (err) => {
      console.warn("Admin dashboard: shipped snapshot", err);
      loadedShipped = true;
      maybeDone();
    });

    const unsubInventory = onSnapshot(collectionGroup(db, "inventory"), (snapshot) => {
      const { start, end } = getTodayBounds();
      let qty = 0;
      snapshot.docs.forEach((d) => {
        const pathSegments = d.ref.path.split("/");
        const userId = pathSegments[1];
        if (userId === adminUid) return;
        const data = d.data() as { dateAdded?: unknown; receivingDate?: unknown; quantity?: number };
        const receiveMs = toMs(data?.receivingDate) || toMs(data?.dateAdded);
        if (inToday(receiveMs, { start, end })) qty += Number(data?.quantity) || 0;
      });
      setReceivedUnitsToday(qty);
      loadedInventory = true;
      maybeDone();
    }, (err) => {
      console.warn("Admin dashboard: inventory snapshot", err);
      loadedInventory = true;
      maybeDone();
    });

    return () => {
      unsubShipped();
      unsubInventory();
    };
  }, [adminUser?.uid, toMs]);

  // Get pending invoices count and amount
  const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
  const [pendingInvoicesAmount, setPendingInvoicesAmount] = useState(0);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  useEffect(() => {
    const fetchPendingInvoices = async () => {
      try {
        setInvoicesLoading(true);
        let totalPending = 0;
        let totalPendingAmount = 0;
        
        // Ensure users array is valid and not empty
        if (!users || users.length === 0) {
          setPendingInvoicesCount(0);
          setPendingInvoicesAmount(0);
          setInvoicesLoading(false);
          return;
        }
        
        for (const user of users) {
          // Normalize user ID - handle both uid and id fields
          const userId = user?.uid || user?.id;
          // Skip if no valid user ID or if it's the admin user
          if (!userId || typeof userId !== 'string' || userId.trim() === '' || userId === adminUser?.uid) {
            continue;
          }
          try {
            const invoicesRef = collection(db, `users/${userId}/invoices`);
            const invoicesSnapshot = await getDocs(invoicesRef);
            const userInvoices = invoicesSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as Invoice[];
            
            const pending = userInvoices.filter(inv => inv.status === 'pending');
            totalPending += pending.length;
            totalPendingAmount += pending.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
          } catch (error) {
            console.error(`Error fetching invoices for user ${userId}:`, error);
            // Continue with other users even if one fails
          }
        }
        
        setPendingInvoicesCount(totalPending);
        setPendingInvoicesAmount(totalPendingAmount);
      } catch (error) {
        console.error('Error fetching pending invoices:', error);
        // Set defaults on error
        setPendingInvoicesCount(0);
        setPendingInvoicesAmount(0);
      } finally {
        setInvoicesLoading(false);
      }
    };

    if (users && users.length > 0) {
      fetchPendingInvoices();
    } else {
      setInvoicesLoading(false);
    }
  }, [users, adminUser]);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-2 border-orange-200/50 bg-gradient-to-br from-orange-50 to-orange-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-orange-900">Pending Users</CardTitle>
            <div className="h-10 w-10 rounded-full bg-orange-500 flex items-center justify-center shadow-md">
              <Shield className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-900">{pendingUsersCount}</div>
            <p className="text-xs text-orange-700 mt-1">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-green-200/50 bg-gradient-to-br from-green-50 to-green-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-900">Active Users</CardTitle>
            <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center shadow-md">
              <Users className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-900">{activeUsersCount}</div>
            <p className="text-xs text-green-700 mt-1">Approved users</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-200/50 bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-900">Number of Pending Invoices</CardTitle>
            <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
              <Receipt className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-3xl font-bold text-blue-900">{pendingInvoicesCount}</div>
                <p className="text-xs text-blue-700 mt-1">Pending Amount: ${pendingInvoicesAmount.toFixed(2)}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-indigo-200/50 bg-gradient-to-br from-indigo-50 to-indigo-100/50 shadow-lg md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-indigo-900">Total Pending Requests</CardTitle>
            <div className="h-10 w-10 rounded-full bg-indigo-500 flex items-center justify-center shadow-md">
              <Bell className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-3xl font-bold text-indigo-900">{pendingRequestsCount}</div>
                <p className="text-xs text-indigo-700 mt-1">Across all request types</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-teal-200/50 bg-gradient-to-br from-teal-50 to-teal-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-teal-900">Orders Shipped Today</CardTitle>
            <div className="h-10 w-10 rounded-full bg-teal-500 flex items-center justify-center shadow-md">
              <Truck className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            {shippedAndReceivedLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-3xl font-bold text-teal-900">{ordersShippedToday}</div>
                <p className="text-xs text-teal-700 mt-1">Shipments recorded today</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-amber-200/50 bg-gradient-to-br from-amber-50 to-amber-100/50 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-900">Received Units Today</CardTitle>
            <div className="h-10 w-10 rounded-full bg-amber-500 flex items-center justify-center shadow-md">
              <PackageCheck className="h-5 w-5 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            {shippedAndReceivedLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-3xl font-bold text-amber-900">{receivedUnitsToday}</div>
                <p className="text-xs text-amber-700 mt-1">Units added to inventory today</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

