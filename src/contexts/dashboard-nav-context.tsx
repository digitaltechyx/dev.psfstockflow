"use client";

import * as React from "react";

type DashboardNavContextValue = {
  dateRangeFrom: Date | undefined;
  dateRangeTo: Date | undefined;
  setDateRangeFrom: (d: Date | undefined) => void;
  setDateRangeTo: (d: Date | undefined) => void;
  sourceFilter: string;
  setSourceFilter: (v: string) => void;
};

const DashboardNavContext = React.createContext<DashboardNavContextValue | null>(null);

export function DashboardNavProvider({ children }: { children: React.ReactNode }) {
  const [dateRangeFrom, setDateRangeFrom] = React.useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [dateRangeTo, setDateRangeTo] = React.useState<Date | undefined>(() => new Date());
  const [sourceFilter, setSourceFilter] = React.useState<string>("all");

  const value: DashboardNavContextValue = {
    dateRangeFrom,
    dateRangeTo,
    setDateRangeFrom,
    setDateRangeTo,
    sourceFilter,
    setSourceFilter,
  };

  return (
    <DashboardNavContext.Provider value={value}>
      {children}
    </DashboardNavContext.Provider>
  );
}

export function useDashboardNav() {
  const ctx = React.useContext(DashboardNavContext);
  if (!ctx) {
    return null;
  }
  return ctx;
}
