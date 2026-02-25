"use client";

import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import type { InventoryItem, ShippedItem, Invoice } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Boxes,
  Clock3,
  DollarSign,
  AlertTriangle,
  Truck,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  PlugZap,
  Bell,
  Search,
  CalendarDays,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, Pie, PieChart, CartesianGrid, XAxis, Cell } from "recharts";

type InventoryRequestLite = {
  status?: string;
  productName?: string;
  rejectionReason?: string;
};

type ShipmentRequestLite = {
  id?: string;
  status?: string;
  requestedAt?: { seconds: number; nanoseconds: number } | string;
  date?: { seconds: number; nanoseconds: number } | string;
  shipTo?: string;
  shipments?: Array<{
    productName?: string;
    quantity?: number;
    packOf?: number;
  }>;
};

type InventoryItemWithSource = InventoryItem & {
  source?: "shopify" | "ebay";
};

function normalizeDate(value: ShippedItem["date"]): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function normalizeInventoryDate(value: InventoryItem["dateAdded"]): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function normalizeRequestDate(
  value?: { seconds: number; nanoseconds: number } | string
): Date | null {
  if (!value) return null;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function MiniSparkline({
  points,
  colorClass,
}: {
  points: number[];
  colorClass: string;
}) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = Math.max(1, max - min);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 100 - ((p - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 30" className="h-8 w-full">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        points={path}
        className={colorClass}
      />
    </svg>
  );
}

function kpiToneClasses(tone: "blue" | "amber" | "orange" | "green" | "purple" | "emerald") {
  switch (tone) {
    case "blue":
      return {
        card: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white",
        icon: "bg-blue-500 text-white",
        spark: "text-blue-500",
      };
    case "amber":
      return {
        card: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white",
        icon: "bg-amber-500 text-white",
        spark: "text-amber-500",
      };
    case "orange":
      return {
        card: "border-orange-200/70 bg-gradient-to-br from-orange-50 to-white",
        icon: "bg-orange-500 text-white",
        spark: "text-orange-500",
      };
    case "green":
      return {
        card: "border-green-200/70 bg-gradient-to-br from-green-50 to-white",
        icon: "bg-green-500 text-white",
        spark: "text-green-500",
      };
    case "purple":
      return {
        card: "border-purple-200/70 bg-gradient-to-br from-purple-50 to-white",
        icon: "bg-purple-500 text-white",
        spark: "text-purple-500",
      };
    default:
      return {
        card: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white",
        icon: "bg-emerald-500 text-white",
        spark: "text-emerald-500",
      };
  }
}

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const [trendRange, setTrendRange] = useState<7 | 14 | 30>(14);

  useEffect(() => {
    if (userProfile && hasRole(userProfile, "commission_agent") && !hasRole(userProfile, "user")) {
      router.replace("/dashboard/agent");
    }
  }, [userProfile, router]);

  const {
    data: inventoryData,
    loading: inventoryLoading,
  } = useCollection<InventoryItem>(
    userProfile ? `users/${userProfile.uid}/inventory` : ""
  );
  const {
    data: shippedData,
    loading: shippedLoading,
  } = useCollection<ShippedItem>(
    userProfile ? `users/${userProfile.uid}/shipped` : ""
  );
  const {
    data: invoices,
    loading: invoicesLoading,
  } = useCollection<Invoice>(
    userProfile ? `users/${userProfile.uid}/invoices` : ""
  );
  const { data: inventoryRequests } = useCollection<InventoryRequestLite>(
    userProfile ? `users/${userProfile.uid}/inventoryRequests` : ""
  );
  const { data: shipmentRequests } = useCollection<ShipmentRequestLite>(
    userProfile ? `users/${userProfile.uid}/shipmentRequests` : ""
  );
  const { data: shopifyConnections, loading: shopifyConnectionsLoading } = useCollection<Record<string, unknown>>(
    userProfile ? `users/${userProfile.uid}/shopifyConnections` : ""
  );
  const { data: ebayConnections, loading: ebayConnectionsLoading } = useCollection<Record<string, unknown>>(
    userProfile ? `users/${userProfile.uid}/ebayConnections` : ""
  );

  const totalItemsInInventory = useMemo(() => {
    return inventoryData.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [inventoryData]);

  const lowStockItems = useMemo(() => {
    return inventoryData
      .filter((item) => (item.quantity || 0) > 0 && (item.quantity || 0) <= 10)
      .sort((a, b) => (a.quantity || 0) - (b.quantity || 0));
  }, [inventoryData]);

  const totalPendingAmount = useMemo(() => {
    const pendingInvoices = invoices.filter((inv) => inv.status === "pending");
    return pendingInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
  }, [invoices]);

  const pendingFulfillmentCount = useMemo(() => {
    return shipmentRequests.filter((r) => (r.status || "").toLowerCase() === "pending").length;
  }, [shipmentRequests]);

  const rejectedInventoryRequests = useMemo(() => {
    return inventoryRequests.filter((r) => (r.status || "").toLowerCase() === "rejected");
  }, [inventoryRequests]);

  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
  });

  const headerDateRange = useMemo(() => {
    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const from = first.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const to = today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${from} – ${to}`;
  }, [currentDate]);

  useEffect(() => {
    const updateDate = () => {
      const today = new Date();
      const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(today.getDate()).padStart(2, "0")}`;
      setCurrentDate(todayString);
    };
    updateDate();
    const interval = setInterval(updateDate, 60000);
    return () => clearInterval(interval);
  }, []);

  const todaysShippedOrders = useMemo(() => {
    return shippedData.filter((item) => {
      const itemDate = normalizeDate(item.date);
      if (!itemDate) return false;
      const itemDateString = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(itemDate.getDate()).padStart(2, "0")}`;
      return itemDateString === currentDate;
    }).length;
  }, [shippedData, currentDate]);

  const integrationHealth = useMemo(() => {
    const hasShopify = shopifyConnections.length > 0;
    const hasEbay = ebayConnections.length > 0;
    if (hasShopify && hasEbay) return { label: "Healthy", pct: 100 };
    if (hasShopify || hasEbay) return { label: "Partial", pct: 70 };
    return { label: "Not Connected", pct: 20 };
  }, [shopifyConnections.length, ebayConnections.length]);

  const sourceSplit = useMemo(() => {
    const rows = inventoryData as InventoryItemWithSource[];
    const shopify = rows.filter((r) => r.source === "shopify").length;
    const ebay = rows.filter((r) => r.source === "ebay").length;
    const manual = rows.length - shopify - ebay;
    return { shopify, ebay, manual };
  }, [inventoryData]);

  const inventoryAndShipmentTrend = useMemo(() => {
    const days = trendRange;
    const now = new Date();
    const buckets = new Map<string, { label: string; shipped: number; added: number }>();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      buckets.set(key, { label, shipped: 0, added: 0 });
    }

    for (const row of shippedData) {
      const d = normalizeDate(row.date);
      if (!d) continue;
      const key = d.toISOString().slice(0, 10);
      if (!buckets.has(key)) continue;
      const qty = Number(row.shippedQty ?? 0);
      buckets.get(key)!.shipped += Number.isFinite(qty) ? qty : 0;
    }

    for (const row of inventoryData) {
      const d = normalizeInventoryDate(row.dateAdded);
      if (!d) continue;
      const key = d.toISOString().slice(0, 10);
      if (!buckets.has(key)) continue;
      const qty = Number(row.quantity ?? 0);
      buckets.get(key)!.added += Number.isFinite(qty) ? qty : 0;
    }

    return Array.from(buckets.values());
  }, [inventoryData, shippedData, trendRange]);

  const orderStatusData = useMemo(() => {
    const statusCounts = {
      pending: 0,
      shipped: shippedData.length,
      rejected: 0,
      processing: 0,
    };

    for (const req of shipmentRequests) {
      const status = (req.status || "").toLowerCase();
      if (status === "pending") statusCounts.pending += 1;
      else if (status === "rejected") statusCounts.rejected += 1;
      else if (status === "approved" || status === "in_progress" || status === "confirmed") statusCounts.processing += 1;
    }

    return [
      { name: "Shipped", value: statusCounts.shipped, fill: "var(--color-shipped)" },
      { name: "Pending", value: statusCounts.pending, fill: "var(--color-pending)" },
      { name: "Processing", value: statusCounts.processing, fill: "var(--color-processing)" },
      { name: "Rejected", value: statusCounts.rejected, fill: "var(--color-rejected)" },
    ];
  }, [shipmentRequests, shippedData.length]);

  const sourceSplitData = useMemo(
    () => [
      { source: "Shopify", count: sourceSplit.shopify, fill: "var(--color-shopify)" },
      { source: "eBay", count: sourceSplit.ebay, fill: "var(--color-ebay)" },
      { source: "Manual", count: sourceSplit.manual, fill: "var(--color-manual)" },
    ],
    [sourceSplit]
  );

  const trendChartConfig = {
    shipped: { label: "Shipped Units", color: "#3b82f6" },
    added: { label: "Inventory Added", color: "#22c55e" },
  } satisfies ChartConfig;

  const orderStatusChartConfig = {
    shipped: { label: "Shipped", color: "#22c55e" },
    pending: { label: "Pending", color: "#f59e0b" },
    processing: { label: "Processing", color: "#3b82f6" },
    rejected: { label: "Rejected", color: "#ef4444" },
  } satisfies ChartConfig;

  const sourceSplitChartConfig = {
    shopify: { label: "Shopify", color: "#2563eb" },
    ebay: { label: "eBay", color: "#22c55e" },
    manual: { label: "Manual", color: "#f59e0b" },
  } satisfies ChartConfig;

  const topMovingProducts = useMemo(() => {
    const moved = new Map<string, number>();

    for (const row of shippedData) {
      if (Array.isArray(row.items) && row.items.length > 0) {
        for (const item of row.items) {
          const name = item.productName || "Unknown Product";
          const qty = Number(item.shippedQty ?? item.quantity ?? 0);
          moved.set(name, (moved.get(name) || 0) + (Number.isFinite(qty) ? qty : 0));
        }
      } else if (row.productName) {
        const qty = Number(row.shippedQty ?? 0);
        moved.set(row.productName, (moved.get(row.productName) || 0) + (Number.isFinite(qty) ? qty : 0));
      }
    }

    const inventoryMap = new Map(
      inventoryData.map((inv) => [inv.productName.toLowerCase(), inv.quantity || 0])
    );

    return Array.from(moved.entries())
      .map(([name, units]) => ({
        name,
        units,
        stockLeft: inventoryMap.get(name.toLowerCase()) ?? 0,
      }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 8);
  }, [shippedData, inventoryData]);

  const recentOrders = useMemo(() => {
    return shipmentRequests
      .slice()
      .sort((a, b) => {
        const ad = normalizeRequestDate(a.requestedAt || a.date)?.getTime() || 0;
        const bd = normalizeRequestDate(b.requestedAt || b.date)?.getTime() || 0;
        return bd - ad;
      })
      .slice(0, 8);
  }, [shipmentRequests]);

  const recentInventoryChanges = useMemo(() => {
    return inventoryData
      .slice()
      .sort((a, b) => {
        const ad = normalizeInventoryDate(a.dateAdded)?.getTime() || 0;
        const bd = normalizeInventoryDate(b.dateAdded)?.getTime() || 0;
        return bd - ad;
      })
      .slice(0, 8);
  }, [inventoryData]);

  const recentShipments = useMemo(() => {
    return shippedData
      .slice()
      .sort((a, b) => {
        const ad = normalizeDate(a.date)?.getTime() || 0;
        const bd = normalizeDate(b.date)?.getTime() || 0;
        return bd - ad;
      })
      .slice(0, 8);
  }, [shippedData]);

  const kpiCards = [
    {
      title: "Total Inventory Units",
      value: String(totalItemsInInventory),
      hint: "Total units across all products",
      tone: "blue",
      icon: Boxes,
      delta: "+2.1%",
      positive: true,
      spark: [30, 34, 32, 38, 36, 42, 46],
    },
    {
      title: "Low Stock SKUs",
      value: String(lowStockItems.length),
      hint: "Quantity 10 or less",
      tone: "amber",
      icon: AlertTriangle,
      delta: "-3%",
      positive: false,
      spark: [44, 42, 40, 41, 38, 36, 34],
    },
    {
      title: "Pending Fulfillment",
      value: String(pendingFulfillmentCount),
      hint: "Open shipment requests",
      tone: "orange",
      icon: Clock3,
      delta: "-5%",
      positive: true,
      spark: [38, 36, 34, 33, 31, 29, 27],
    },
    {
      title: "Pending Invoice Amount",
      value: invoicesLoading ? "..." : `$${totalPendingAmount.toFixed(2)}`,
      hint: "Open invoice balance",
      tone: "green",
      icon: DollarSign,
      delta: "+8.5%",
      positive: true,
      spark: [26, 28, 30, 31, 35, 37, 39],
    },
    {
      title: "Today Shipped",
      value: String(todaysShippedOrders),
      hint: "Orders shipped today",
      tone: "purple",
      icon: Truck,
      delta: "+12%",
      positive: true,
      spark: [24, 25, 27, 30, 32, 35, 36],
    },
    {
      title: "Integration Health",
      value: shopifyConnectionsLoading || ebayConnectionsLoading ? "..." : `${integrationHealth.pct}%`,
      hint: integrationHealth.label,
      tone: "emerald",
      icon: RefreshCw,
      delta: "+1%",
      positive: true,
      spark: [62, 64, 65, 66, 68, 69, 70],
    },
  ] as const;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 rounded-2xl bg-slate-50/60 p-4 md:p-5">
      {/* Page header - template style */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 md:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Operations overview and key metrics
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
              <Button variant="outline" size="sm" className="h-9 gap-2 text-slate-600">
                <CalendarDays className="h-4 w-4" />
                {headerDateRange}
              </Button>
              <div className="relative w-[200px] sm:w-[220px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="h-9 pl-8" placeholder="Search..." />
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                <Bell className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs font-medium text-slate-600">
                    {(userProfile?.name || userProfile?.email || "U").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-slate-700">
                  {userProfile?.name || "User"}
                </span>
              </div>
            </div>
          </div>
          {/* Quick actions - template style */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Quick actions
            </span>
            <Link href="/dashboard/inventory">
              <Button variant="secondary" size="sm" className="h-8 gap-1.5">
                <Boxes className="h-3.5 w-3.5" />
                Manage Inventory
              </Button>
            </Link>
            <Link href="/dashboard/create-shipment-with-labels">
              <Button variant="secondary" size="sm" className="h-8 gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                Create Shipment
              </Button>
            </Link>
            <Link href="/dashboard/integrations">
              <Button variant="secondary" size="sm" className="h-8 gap-1.5">
                <PlugZap className="h-3.5 w-3.5" />
                Integrations
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          const tone = kpiToneClasses(kpi.tone);
          return (
            <Card
              key={kpi.title}
              className={cn(
                "rounded-xl border shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                tone.card
              )}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-5 px-5">
                <CardTitle className="text-sm font-medium text-slate-700">{kpi.title}</CardTitle>
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shadow-sm", tone.icon)}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="text-2xl font-bold tracking-tight text-slate-900">{kpi.value}</div>
                <MiniSparkline
                  points={kpi.spark}
                  colorClass={kpi.positive ? tone.spark : "text-rose-500"}
                />
                <div className="mt-1">
                  <Badge variant={kpi.positive ? "secondary" : "destructive"} className="text-xs">
                    {kpi.delta}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-slate-500">{kpi.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-7 rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-4 pt-6 px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Inventory & Shipment Trend ({trendRange} days)
                </CardTitle>
                <CardDescription className="text-slate-500">
                  Compare shipped units vs newly added inventory.
                </CardDescription>
              </div>
              <div className="inline-flex rounded-md border bg-slate-50 p-1">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setTrendRange(d as 7 | 14 | 30)}
                    className={`rounded px-3 py-1 text-xs font-medium transition ${
                      trendRange === d
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <ChartContainer config={trendChartConfig} className="h-[300px] w-full">
              <AreaChart data={inventoryAndShipmentTrend}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  dataKey="added"
                  type="monotone"
                  fill="var(--color-added)"
                  fillOpacity={0.25}
                  stroke="var(--color-added)"
                  strokeWidth={2}
                />
                <Area
                  dataKey="shipped"
                  type="monotone"
                  fill="var(--color-shipped)"
                  fillOpacity={0.25}
                  stroke="var(--color-shipped)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="xl:col-span-3 rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3 pt-6 px-6">
            <CardTitle className="text-lg font-semibold text-slate-900">Orders by Status</CardTitle>
            <CardDescription className="text-slate-500">Live mix of shipped and request statuses.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <ChartContainer config={orderStatusChartConfig} className="h-[300px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={orderStatusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={96}
                  paddingAngle={2}
                >
                  {orderStatusData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2 xl:row-span-2 rounded-xl border border-rose-200/70 bg-white shadow-sm">
          <CardHeader className="pb-3 pt-6 px-6">
            <CardTitle className="text-lg font-semibold text-rose-900">Alerts</CardTitle>
            <CardDescription className="text-slate-500">Issues needing your attention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            <div className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/60 p-3">
              <p className="text-sm font-medium text-amber-900">Low Stock Alerts ({lowStockItems.length})</p>
              {lowStockItems.length === 0 ? (
                <p className="mt-1 text-xs text-amber-700">No low stock items right now.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {lowStockItems.slice(0, 3).map((item) => (
                    <p key={item.id} className="text-xs text-amber-800">
                      {item.productName}: {item.quantity} left
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-rose-200 bg-gradient-to-br from-rose-50 to-rose-100/60 p-3">
              <p className="text-sm font-medium text-rose-900">
                Rejected Inventory Requests ({rejectedInventoryRequests.length})
              </p>
              {rejectedInventoryRequests.length === 0 ? (
                <p className="mt-1 text-xs text-rose-700">No rejected requests.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {rejectedInventoryRequests.slice(0, 2).map((req, idx) => (
                    <p key={`${req.productName || "item"}-${idx}`} className="text-xs text-rose-800">
                      {req.productName || "Inventory item"}: {req.rejectionReason || "Rejected by admin"}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/60 p-3">
              <p className="text-sm font-medium text-blue-900">Pending Fulfillment ({pendingFulfillmentCount})</p>
              <p className="mt-1 text-xs text-blue-700">
                Open shipment requests are waiting for processing.
              </p>
              <Link href="/dashboard/shipped-orders" className="mt-2 inline-block text-xs font-medium text-blue-700 underline">
                Review shipped orders and requests
              </Link>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/60 p-3">
              <p className="text-sm font-medium text-emerald-900">Integration Status</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Shopify: {shopifyConnections.length > 0 ? "Connected" : "Not connected"}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                eBay: {ebayConnections.length > 0 ? "Connected" : "Not connected"}
              </div>
              <Link href="/dashboard/integrations" className="mt-2 inline-block text-xs font-medium text-emerald-700 underline">
                Open integration settings
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-5 rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pt-6 px-6">
            <CardTitle className="text-lg font-semibold text-slate-900">Source Split</CardTitle>
            <CardDescription className="text-slate-500">Inventory items by source channel.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <ChartContainer config={sourceSplitChartConfig} className="h-[260px] w-full">
              <BarChart data={sourceSplitData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="source" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="count" radius={8} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="xl:col-span-7 rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pt-6 px-6">
            <CardTitle className="text-lg font-semibold text-slate-900">Top Moving Products</CardTitle>
            <CardDescription className="text-slate-500">
              Products with highest shipped volume.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {shippedLoading || inventoryLoading ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="font-semibold text-slate-700">Product</TableHead>
                      <TableHead className="text-right font-semibold text-slate-700">Shipped Units</TableHead>
                      <TableHead className="text-right font-semibold text-slate-700">Stock Left</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topMovingProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-slate-500">
                          No shipped data yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      topMovingProducts.map((item) => (
                        <TableRow key={item.name}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-right">{item.units}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={item.stockLeft <= 10 ? "destructive" : "secondary"}>
                              {item.stockLeft}
                            </Badge>
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
      </div>

      <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className="pt-6 px-6">
          <CardTitle className="text-lg font-semibold text-slate-900">Recent Activity</CardTitle>
          <CardDescription className="text-slate-500">
            Latest records across orders, inventory changes, and shipments.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <Tabs defaultValue="orders" className="w-full">
            <TabsList className="mb-4 inline-flex h-10 rounded-lg bg-slate-100 p-1 text-slate-600">
              <TabsTrigger value="orders" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                Recent Orders
              </TabsTrigger>
              <TabsTrigger value="inventory" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                Inventory Changes
              </TabsTrigger>
              <TabsTrigger value="shipments" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                Shipments
              </TabsTrigger>
            </TabsList>

            <TabsContent value="orders">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="font-semibold text-slate-700">Request</TableHead>
                      <TableHead className="font-semibold text-slate-700">Status</TableHead>
                      <TableHead className="font-semibold text-slate-700">Ship To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-slate-500">
                          No recent order requests.
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentOrders.map((order, idx) => (
                        <TableRow key={order.id || `req-${idx}`}>
                          <TableCell className="font-medium">{order.id || "Request"}</TableCell>
                          <TableCell>
                            <Badge variant={(order.status || "").toLowerCase() === "rejected" ? "destructive" : "outline"}>
                              {(order.status || "pending").replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>{order.shipTo || "N/A"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="inventory">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="font-semibold text-slate-700">Product</TableHead>
                      <TableHead className="text-right font-semibold text-slate-700">Quantity</TableHead>
                      <TableHead className="font-semibold text-slate-700">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentInventoryChanges.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-slate-500">
                          No inventory changes yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentInventoryChanges.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell>
                            <Badge variant={item.status === "Out of Stock" ? "destructive" : "secondary"}>
                              {item.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="shipments">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50/80">
                      <TableHead className="font-semibold text-slate-700">Product</TableHead>
                      <TableHead className="text-right font-semibold text-slate-700">Shipped Qty</TableHead>
                      <TableHead className="font-semibold text-slate-700">Destination</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentShipments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-slate-500">
                          No shipments yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      recentShipments.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.productName || "Multi-item Shipment"}</TableCell>
                          <TableCell className="text-right">{item.shippedQty || item.totalUnits || 0}</TableCell>
                          <TableCell>{item.shipTo || "N/A"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
