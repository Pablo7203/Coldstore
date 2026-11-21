"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function OrderTrackingRefresh() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [router]);

  function refreshNow() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 800);
  }

  return (
    <button
      type="button"
      onClick={refreshNow}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#d7e0d9] bg-white px-3 text-sm font-semibold text-[#153c33] hover:bg-[#eaf2f3]"
      aria-label="Refresh order tracking"
    >
      <RefreshCw
        size={15}
        className={refreshing ? "animate-spin" : ""}
        aria-hidden="true"
      />
      Refresh status
    </button>
  );
}
