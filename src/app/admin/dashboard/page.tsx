"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useCollection } from "@/hooks/use-collection";
import type { UserProfile, Invoice } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Shield,
  Receipt,
  Bell,
  Truck,
  PackageCheck,
  TrendingUp,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { collection, collectionGroup, getCountFromServer, getDocs, onSnapshot, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, Pie, PieChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts";
import { cn } from "@/lib/utils";

function toMs(v: unknown): number {
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
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function isDateInRange(date: Date | null, from?: Date, to?: Date): boolean {
  if (!date) return false;
  if (!from && !to) return true;
  const t = date.getTime();
  if (from && t < startOfDay(from).getTime()) return false;
  if (to && t > endOfDay(to).getTime()) return false;
  return true;
}

type ShippedDoc = { date?: unknown; shippedQty?: number; items?: Array<{ shippedQty?: number; quantity?: number }> };
type InventoryDoc = { dateAdded?: unknown; receivingDate?: unknown; quantity?: number };
type RequestDoc = { status?: string; requestedAt?: unknown; date?: unknown };

export default function AdminDashboardPage() {
  const { userProfile: adminUser } = useAuth();
  const { data: users } = useCollection<UserProfile>("users");

  const [dateRangeFrom, setDateRangeFrom] = useState<Date | undefined>();
  const [dateRangeTo, setDateRangeTo] = useState<Date | undefined>();
  const trendDays = 30;
  const hasDateRange = Boolean(dateRangeFrom && dateRangeTo);

  const activeUsersCount = useMemo(() => {
    if (!users || !adminUser?.uid) return 0;
    return users.filter(
      (user) =>
        user.uid !== adminUser.uid &&
        (user.status === "approved" || !user.status) &&
        user.status !== "deleted"
    ).length;
  }, [users, adminUser]);

  const pendingUsersCount = useMemo(() => {
    if (!users || !adminUser?.uid) return 0;
    return users.filter((user) => user.uid !== adminUser.uid && user.status === "pending").length;
  }, [users, adminUser]);

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
              } catch {
                return 0;
              }
            })
          );
          return counts.reduce((a, b) => a + b, 0);
        };
        const userIdsForFallback = (users || [])
          .map((u: UserProfile) => String(u?.uid || ""))
          .filter((id) => id && id !== adminUser?.uid);
        const pendingCounts = await Promise.all([
          countStatuses("shipmentRequests", ["pending", "Pending"]).catch(() => 0),
          countStatuses("inventoryRequests", ["pending", "Pending"]).catch(() => 0),
          countStatuses("productReturns", ["pending", "Pending", "approved", "Approved", "in_progress", "In Progress", "in progress"]).catch(() => 0),
        ]);
        let pendingTotal = pendingCounts.reduce((a, b) => a + b, 0);
        if (pendingTotal === 0 && userIdsForFallback.length > 0) {
          try {
            const perUser = await Promise.all(
              userIdsForFallback.map(async (uid) => {
                const [s, i, p] = await Promise.all([
                  getDocs(query(collection(db, `users/${uid}/shipmentRequests`), where("status", "in", ["pending", "Pending"]))),
                  getDocs(query(collection(db, `users/${uid}/inventoryRequests`), where("status", "in", ["pending", "Pending"]))),
                  getDocs(query(collection(db, `users/${uid}/productReturns`), where("status", "in", ["pending", "Pending", "approved", "Approved", "in_progress", "In Progress", "in progress"]))),
                ]);
                return s.size + i.size + p.size;
              })
            );
            pendingTotal = perUser.reduce((a, b) => a + b, 0);
          } catch {
            // ignore
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

  const [ordersShippedToday, setOrdersShippedToday] = useState(0);
  const [receivedUnitsToday, setReceivedUnitsToday] = useState(0);
  const [shippedAndReceivedLoading, setShippedAndReceivedLoading] = useState(true);

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
        const data = d.data() as ShippedDoc;
        const ms = toMs(data?.date);
        if (inToday(ms, { start, end })) count += 1;
      });
      setOrdersShippedToday(count);
      loadedShipped = true;
      maybeDone();
    }, () => {
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
        const data = d.data() as InventoryDoc;
        const receiveMs = toMs(data?.receivingDate) || toMs(data?.dateAdded);
        if (inToday(receiveMs, { start, end })) qty += Number(data?.quantity) || 0;
      });
      setReceivedUnitsToday(qty);
      loadedInventory = true;
      maybeDone();
    }, () => {
      loadedInventory = true;
      maybeDone();
    });
    return () => {
      unsubShipped();
      unsubInventory();
    };
  }, [adminUser?.uid]);

  const [pendingInvoicesCount, setPendingInvoicesCount] = useState(0);
  const [pendingInvoicesAmount, setPendingInvoicesAmount] = useState(0);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  useEffect(() => {
    const fetchPendingInvoices = async () => {
      try {
        setInvoicesLoading(true);
        let totalPending = 0;
        let totalPendingAmount = 0;
        if (!users || users.length === 0) {
          setPendingInvoicesCount(0);
          setPendingInvoicesAmount(0);
          setInvoicesLoading(false);
          return;
        }
        for (const user of users) {
          const userId = user?.uid || user?.id;
          if (!userId || typeof userId !== "string" || userId.trim() === "" || userId === adminUser?.uid) continue;
          try {
            const invoicesSnapshot = await getDocs(collection(db, `users/${userId}/invoices`));
            const userInvoices = invoicesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Invoice[];
            const pending = userInvoices.filter((inv) => inv.status === "pending");
            totalPending += pending.length;
            totalPendingAmount += pending.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
          } catch {
            // continue
          }
        }
        setPendingInvoicesCount(totalPending);
        setPendingInvoicesAmount(totalPendingAmount);
      } catch {
        setPendingInvoicesCount(0);
        setPendingInvoicesAmount(0);
      } finally {
        setInvoicesLoading(false);
      }
    };
    if (users && users.length > 0) fetchPendingInvoices();
    else setInvoicesLoading(false);
  }, [users, adminUser]);

  const [chartData, setChartData] = useState<{
    trend: Array<{ label: string; shipped: number; added: number }>;
    requestTrend: Array<{ label: string; total: number }>;
    requestTypes: Array<{ type: string; count: number; fill: string }>;
    statusDonut: Array<{ name: string; value: number; fill: string }>;
    topUsers: Array<{ user: string; count: number; fill: string }>;
    recentActivity: Array<{ id: string; type: string; userName: string; date: string; status: string }>;
  }>({ trend: [], requestTrend: [], requestTypes: [], statusDonut: [], topUsers: [], recentActivity: [] });
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    if (!adminUser?.uid || !users?.length) {
      setChartData({ trend: [], requestTrend: [], requestTypes: [], statusDonut: [], topUsers: [], recentActivity: [] });
      setChartLoading(false);
      return;
    }
    const adminUid = adminUser.uid;
    const start = hasDateRange && dateRangeFrom ? startOfDay(dateRangeFrom) : new Date(Date.now() - trendDays * 86400000);
    const end = hasDateRange && dateRangeTo ? endOfDay(dateRangeTo) : new Date();

    const run = async () => {
      setChartLoading(true);
      try {
        const buckets = new Map<string, { label: string; shipped: number; added: number }>();
        const requestBuckets = new Map<string, { label: string; total: number }>();
        for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
          const d = new Date(t);
          const key = d.toISOString().slice(0, 10);
          buckets.set(key, {
            label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            shipped: 0,
            added: 0,
          });
          requestBuckets.set(key, {
            label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            total: 0,
          });
        }

        const requestTypeCounts = { Shipment: 0, Inventory: 0, Returns: 0, Dispose: 0 };
        const statusCounts = { Pending: 0, Processing: 0, Shipped: 0, Rejected: 0 };
        const userRequestCounts = new Map<string, number>();
        let shippedOrderCount = 0;
        const recentList: Array<{ id: string; type: string; userName: string; date: string; status: string; ms: number }> = [];

        const nonAdminUserIds = (users || []).map((u) => u.uid).filter((id): id is string => !!id && id !== adminUid);
        const BATCH_SIZE = 6;
        const MAX_USERS = 24;
        const userIdsToFetch = nonAdminUserIds.slice(0, MAX_USERS);

        const fetchOneUser = async (uid: string) => {
          try {
            const [shippedSnap, inventorySnap, shipReqSnap, invReqSnap, returnsSnap, disposeSnap] = await Promise.all([
              getDocs(collection(db, `users/${uid}/shipped`)),
              getDocs(collection(db, `users/${uid}/inventory`)),
              getDocs(query(collection(db, `users/${uid}/shipmentRequests`), limit(80))),
              getDocs(query(collection(db, `users/${uid}/inventoryRequests`), limit(80))),
              getDocs(query(collection(db, `users/${uid}/productReturns`), limit(40))),
              getDocs(query(collection(db, `users/${uid}/disposeRequests`), limit(40))),
            ]);
            return { uid, shippedSnap, inventorySnap, shipReqSnap, invReqSnap, returnsSnap, disposeSnap };
          } catch {
            return null;
          }
        };

        for (let i = 0; i < userIdsToFetch.length; i += BATCH_SIZE) {
          const batch = userIdsToFetch.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(batch.map(fetchOneUser));
          for (const res of results) {
            if (!res) continue;
            const { uid, shippedSnap, inventorySnap, shipReqSnap, invReqSnap, returnsSnap, disposeSnap } = res;
            const userName = users?.find((u) => u.uid === uid)?.name || users?.find((u) => u.uid === uid)?.email || "User";

            shippedSnap.docs.forEach((doc) => {
              const data = doc.data() as ShippedDoc;
              const date = new Date(toMs(data?.date));
              if (!isDateInRange(date, start, end)) return;
              shippedOrderCount += 1;
              const key = date.toISOString().slice(0, 10);
              const bucket = buckets.get(key);
              if (bucket) {
                const qty = Number(data?.shippedQty ?? 0) || (Array.isArray(data?.items) ? data.items.reduce((s, i) => s + (Number(i?.shippedQty ?? i?.quantity) || 0), 0) : 0);
                bucket.shipped += Number.isFinite(qty) ? qty : 0;
              }
            });
            inventorySnap.docs.forEach((doc) => {
              const data = doc.data() as InventoryDoc;
              const date = new Date(toMs(data?.receivingDate) || toMs(data?.dateAdded));
              if (!isDateInRange(date, start, end)) return;
              const key = date.toISOString().slice(0, 10);
              const bucket = buckets.get(key);
              if (bucket) bucket.added += Number(data?.quantity) || 0;
            });

            shipReqSnap.docs.forEach((doc) => {
              const data = doc.data() as RequestDoc;
              requestTypeCounts.Shipment += 1;
              const status = (data?.status || "").toLowerCase();
              if (status === "pending") statusCounts.Pending += 1;
              else if (status === "rejected") statusCounts.Rejected += 1;
              else if (["approved", "in_progress", "confirmed", "shipped"].includes(status)) statusCounts.Processing += 1;
              const ms = toMs(data?.requestedAt || data?.date);
              if (isDateInRange(new Date(ms), start, end)) {
                recentList.push({ id: doc.id, type: "Shipment", userName, date: new Date(ms).toLocaleDateString(), status: data?.status || "—", ms });
                const key = new Date(ms).toISOString().slice(0, 10);
                const bucket = requestBuckets.get(key);
                if (bucket) bucket.total += 1;
                userRequestCounts.set(userName, (userRequestCounts.get(userName) || 0) + 1);
              }
            });
            invReqSnap.docs.forEach((doc) => {
              const data = doc.data() as RequestDoc;
              requestTypeCounts.Inventory += 1;
              const status = (data?.status || "").toLowerCase();
              if (status === "pending") statusCounts.Pending += 1;
              else if (status === "rejected") statusCounts.Rejected += 1;
              else statusCounts.Processing += 1;
              const ms = toMs(data?.requestedAt || data?.date);
              if (isDateInRange(new Date(ms), start, end)) {
                recentList.push({ id: doc.id, type: "Inventory", userName, date: new Date(ms).toLocaleDateString(), status: data?.status || "—", ms });
                const key = new Date(ms).toISOString().slice(0, 10);
                const bucket = requestBuckets.get(key);
                if (bucket) bucket.total += 1;
                userRequestCounts.set(userName, (userRequestCounts.get(userName) || 0) + 1);
              }
            });
            returnsSnap.docs.forEach((doc) => {
              requestTypeCounts.Returns += 1;
              const data = doc.data() as RequestDoc;
              const status = (data?.status || "").toLowerCase();
              if (status === "pending") statusCounts.Pending += 1;
              else if (status === "rejected") statusCounts.Rejected += 1;
              else statusCounts.Processing += 1;
              const ms = toMs(data?.requestedAt || data?.date);
              if (isDateInRange(new Date(ms), start, end)) {
                const key = new Date(ms).toISOString().slice(0, 10);
                const bucket = requestBuckets.get(key);
                if (bucket) bucket.total += 1;
                userRequestCounts.set(userName, (userRequestCounts.get(userName) || 0) + 1);
              }
            });
            disposeSnap.docs.forEach((doc) => {
              requestTypeCounts.Dispose += 1;
              const data = doc.data() as RequestDoc;
              const status = (data?.status || "").toLowerCase();
              if (status === "pending") statusCounts.Pending += 1;
              else if (status === "rejected") statusCounts.Rejected += 1;
              else statusCounts.Processing += 1;
              const ms = toMs(data?.requestedAt || data?.date);
              if (isDateInRange(new Date(ms), start, end)) {
                const key = new Date(ms).toISOString().slice(0, 10);
                const bucket = requestBuckets.get(key);
                if (bucket) bucket.total += 1;
                userRequestCounts.set(userName, (userRequestCounts.get(userName) || 0) + 1);
              }
            });
          }
        }

        statusCounts.Shipped = shippedOrderCount;

        const trend = Array.from(buckets.values());
        const requestTrend = Array.from(requestBuckets.values());
        const requestTypes = [
          { type: "Shipment", count: requestTypeCounts.Shipment, fill: "var(--color-shipment)" },
          { type: "Inventory", count: requestTypeCounts.Inventory, fill: "var(--color-inventory)" },
          { type: "Returns", count: requestTypeCounts.Returns, fill: "var(--color-returns)" },
          { type: "Dispose", count: requestTypeCounts.Dispose, fill: "var(--color-dispose)" },
        ];
        const statusDonut = [
          { name: "Pending", value: statusCounts.Pending, fill: "#f59e0b" },
          { name: "Processing", value: statusCounts.Processing, fill: "#3b82f6" },
          { name: "Shipped", value: statusCounts.Shipped, fill: "#22c55e" },
          { name: "Rejected", value: statusCounts.Rejected, fill: "#ef4444" },
        ].filter((d) => d.value > 0);
        const topUsers = Array.from(userRequestCounts.entries())
          .map(([user, count]) => ({ user, count, fill: "#06b6d4" }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6);

        recentList.sort((a, b) => b.ms - a.ms);
        const recentActivity = recentList.slice(0, 10).map(({ id, type, userName, date, status }) => ({ id, type, userName, date, status }));

        setChartData({
          trend,
          requestTrend,
          requestTypes,
          statusDonut: statusDonut.length ? statusDonut : [{ name: "No data", value: 1, fill: "#94a3b8" }],
          topUsers,
          recentActivity,
        });
      } catch {
        setChartData({
          trend: [],
          requestTrend: [],
          requestTypes: [],
          statusDonut: [{ name: "No data", value: 1, fill: "#94a3b8" }],
          topUsers: [],
          recentActivity: [],
        });
      } finally {
        setChartLoading(false);
      }
    };
    run();
  }, [adminUser?.uid, users, hasDateRange, dateRangeFrom, dateRangeTo, trendDays]);

  const trendChartConfig = {
    shipped: { label: "Shipped", color: "#3b82f6" },
    added: { label: "Inventory added", color: "#22c55e" },
  } satisfies ChartConfig;
  const requestTypesChartConfig = {
    shipment: { label: "Shipment", color: "#2563eb" },
    inventory: { label: "Inventory", color: "#16a34a" },
    returns: { label: "Returns", color: "#ea580c" },
    dispose: { label: "Dispose", color: "#7c3aed" },
  } satisfies ChartConfig;
  const statusChartConfig = {
    pending: { label: "Pending", color: "#f59e0b" },
    processing: { label: "Processing", color: "#3b82f6" },
    shipped: { label: "Shipped", color: "#22c55e" },
    rejected: { label: "Rejected", color: "#ef4444" },
    Pending: { label: "Pending", color: "#f59e0b" },
    Processing: { label: "Processing", color: "#3b82f6" },
    Shipped: { label: "Shipped", color: "#22c55e" },
    Rejected: { label: "Rejected", color: "#ef4444" },
  } satisfies ChartConfig;
  const requestTrendConfig = {
    total: { label: "Requests", color: "#8b5cf6" },
  } satisfies ChartConfig;
  const topUsersConfig = {
    count: { label: "Requests", color: "#06b6d4" },
  } satisfies ChartConfig;

  const kpiCards = [
    { title: "Pending Users", value: String(pendingUsersCount), hint: "Awaiting approval", icon: Shield, color: "orange" },
    { title: "Active Users", value: String(activeUsersCount), hint: "Approved users", icon: Users, color: "green" },
    { title: "Pending Invoices", value: invoicesLoading ? "…" : `${pendingInvoicesCount} ($${pendingInvoicesAmount.toFixed(0)})`, hint: "Outstanding", icon: Receipt, color: "blue" },
    { title: "Pending Requests", value: requestsLoading ? "…" : String(pendingRequestsCount), hint: "All request types", icon: Bell, color: "indigo" },
    { title: "Shipped Today", value: shippedAndReceivedLoading ? "…" : String(ordersShippedToday), hint: "Shipments recorded", icon: Truck, color: "teal" },
    { title: "Received Today", value: shippedAndReceivedLoading ? "…" : String(receivedUnitsToday), hint: "Units added", icon: PackageCheck, color: "amber" },
  ];

  const colorClasses: Record<string, string> = {
    orange: "border-orange-200/60 bg-gradient-to-br from-orange-50/90 to-orange-100/50 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
    green: "border-emerald-200/60 bg-gradient-to-br from-emerald-50/90 to-emerald-100/50 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
    blue: "border-blue-200/60 bg-gradient-to-br from-blue-50/90 to-blue-100/50 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
    indigo: "border-indigo-200/60 bg-gradient-to-br from-indigo-50/90 to-indigo-100/50 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
    teal: "border-teal-200/60 bg-gradient-to-br from-teal-50/90 to-teal-100/50 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
    amber: "border-amber-200/60 bg-gradient-to-br from-amber-50/90 to-amber-100/50 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
  };
  const iconBgClasses: Record<string, string> = {
    orange: "bg-orange-500/12 text-orange-600",
    green: "bg-emerald-500/12 text-emerald-600",
    blue: "bg-blue-500/12 text-blue-600",
    indigo: "bg-indigo-500/12 text-indigo-600",
    teal: "bg-teal-500/12 text-teal-600",
    amber: "bg-amber-500/12 text-amber-600",
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50/95 to-slate-100/80">
      <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-6 md:px-6">
        {/* Page title + Date picker */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">PSF StockFlow — operations overview</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-500" />
            <DateRangePicker
              fromDate={dateRangeFrom}
              toDate={dateRangeTo}
              setFromDate={setDateRangeFrom}
              setToDate={setDateRangeTo}
              className="h-9 min-w-[240px] border-slate-200 bg-white text-sm shadow-sm sm:w-[260px]"
            />
          </div>
        </div>

        {/* KPI Cards — premium compact */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card
                key={kpi.title}
                className={cn(
                  "overflow-hidden rounded-xl border transition-shadow hover:shadow-md",
                  colorClasses[kpi.color] || colorClasses.blue
                )}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconBgClasses[kpi.color] || iconBgClasses.blue)}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{kpi.value}</p>
                  <p className="mt-0.5 text-sm font-medium text-slate-600">{kpi.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{kpi.hint}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Charts row 1: Trend + Status donut */}
        <section className="grid gap-6 lg:grid-cols-12">
          <Card className="overflow-hidden rounded-xl border-slate-200/80 bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:col-span-8">
            <CardHeader className="pb-2 pt-6 px-6">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Shipments & inventory over time</CardTitle>
                  <CardDescription className="text-slate-500">
                    {hasDateRange ? "In selected date range" : `Last ${trendDays} days`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {chartLoading ? (
                <Skeleton className="h-[280px] w-full rounded-lg" />
              ) : (
                <ChartContainer config={trendChartConfig} className="h-[280px] w-full">
                  <AreaChart data={chartData.trend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(226 232 240)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area dataKey="shipped" type="monotone" fill="var(--color-shipped)" fillOpacity={0.2} stroke="var(--color-shipped)" strokeWidth={2} />
                    <Area dataKey="added" type="monotone" fill="var(--color-added)" fillOpacity={0.2} stroke="var(--color-added)" strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-xl border-slate-200/80 bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:col-span-4">
            <CardHeader className="pb-2 pt-6 px-6">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
                  <PieChartIcon className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Request status</CardTitle>
                  <CardDescription className="text-slate-500">Pending, processing, shipped, rejected</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {chartLoading ? (
                <Skeleton className="h-[280px] w-full rounded-lg" />
              ) : (
                <ChartContainer config={statusChartConfig} className="h-[280px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent nameKey="name" className="grid grid-cols-2 gap-x-4 gap-y-2 justify-items-start" />} />
                    <Pie data={chartData.statusDonut} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={2}>
                      {chartData.statusDonut.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Charts row 2: Requests trend + Top users by activity */}
        <section className="grid gap-6 lg:grid-cols-12">
          <Card className="overflow-hidden rounded-xl border-slate-200/80 bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:col-span-6">
            <CardHeader className="pb-2 pt-6 px-6">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Request volume over time</CardTitle>
                  <CardDescription className="text-slate-500">Daily request activity</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {chartLoading ? (
                <Skeleton className="h-[260px] w-full rounded-lg" />
              ) : (
                <ChartContainer config={requestTrendConfig} className="h-[260px] w-full">
                  <AreaChart data={chartData.requestTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(226 232 240)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area dataKey="total" type="monotone" fill="var(--color-total)" fillOpacity={0.22} stroke="var(--color-total)" strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-xl border-slate-200/80 bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:col-span-6">
            <CardHeader className="pb-2 pt-6 px-6">
              <CardTitle className="text-base font-semibold text-slate-900">Top users by request volume</CardTitle>
              <CardDescription className="text-slate-500">Most active users in selected period</CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {chartLoading ? (
                <Skeleton className="h-[260px] w-full rounded-lg" />
              ) : (
                <ChartContainer config={topUsersConfig} className="h-[260px] w-full">
                  <BarChart data={chartData.topUsers} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgb(226 232 240)" />
                    <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis type="category" dataKey="user" tickLine={false} axisLine={false} width={92} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="var(--color-count)" />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Separate section: Requests by type */}
        <section className="grid gap-6 lg:grid-cols-12">
          <Card className="overflow-hidden rounded-xl border-slate-200/80 bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:col-span-12">
            <CardHeader className="pb-2 pt-6 px-6">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Requests by type</CardTitle>
                  <CardDescription className="text-slate-500">Separate analytics section across all users</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {chartLoading ? (
                <Skeleton className="h-[260px] w-full rounded-lg" />
              ) : (
                <ChartContainer config={requestTypesChartConfig} className="h-[260px] w-full">
                  <BarChart data={chartData.requestTypes} layout="vertical" margin={{ left: 18, right: 18 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgb(226 232 240)" />
                    <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis type="category" dataKey="type" tickLine={false} axisLine={false} width={84} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="count" nameKey="type" radius={[0, 6, 6, 0]}>
                      {chartData.requestTypes.map((entry, i) => (
                        <Cell key={`type-cell-${i}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Recent activity table */}
        <section className="grid gap-6 lg:grid-cols-12">
          <Card className="overflow-hidden rounded-xl border-slate-200/80 bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:col-span-12">
            <CardHeader className="pb-2 pt-6 px-6">
              <CardTitle className="text-base font-semibold text-slate-900">Recent activity</CardTitle>
              <CardDescription className="text-slate-500">Latest requests in selected period</CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {chartLoading ? (
                <Skeleton className="h-[260px] w-full rounded-lg" />
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200/80">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                        <TableHead className="font-medium text-slate-600">Type</TableHead>
                        <TableHead className="font-medium text-slate-600">User</TableHead>
                        <TableHead className="font-medium text-slate-600">Date</TableHead>
                        <TableHead className="font-medium text-slate-600">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {chartData.recentActivity.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-10 text-center text-sm text-slate-500">
                            No recent activity in this period
                          </TableCell>
                        </TableRow>
                      ) : (
                        chartData.recentActivity.map((row) => (
                          <TableRow key={row.id} className="border-slate-100">
                            <TableCell className="font-medium text-slate-900">{row.type}</TableCell>
                            <TableCell className="text-slate-600">{row.userName}</TableCell>
                            <TableCell className="text-slate-600">{row.date}</TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                                  row.status.toLowerCase() === "pending" && "bg-amber-100 text-amber-800",
                                  row.status.toLowerCase() === "approved" && "bg-blue-100 text-blue-800",
                                  row.status.toLowerCase() === "rejected" && "bg-red-100 text-red-800",
                                  !["pending", "approved", "rejected"].includes(row.status.toLowerCase()) && "bg-slate-100 text-slate-700"
                                )}
                              >
                                {row.status}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
