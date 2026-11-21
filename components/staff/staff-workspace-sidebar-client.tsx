"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Boxes,
  ClipboardList,
  CreditCard,
  Home,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  ReceiptText,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  Snowflake,
  Truck,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

const links = [
  { href: "/staff", label: "Workspace", icon: Home },
  { href: "/pos", label: "Point of sale", icon: ShoppingCart },
  { href: "/offline-conflicts", label: "Offline sale review", icon: RefreshCw },
  { href: "/sales", label: "Sales history", icon: ReceiptText },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/products", label: "Products", icon: Package },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/stock-movements", label: "Movement history", icon: ClipboardList },
  { href: "/credit", label: "Customer credit", icon: CreditCard },
  { href: "/orders", label: "Online orders", icon: ShoppingBag },
  { href: "/staff#team-management", label: "Team management", icon: Users },
  { href: "/settings/delivery", label: "Delivery rate", icon: Truck },
] as const satisfies readonly {
  href: string;
  label: string;
  icon: LucideIcon;
}[];

export type StaffWorkspacePath = (typeof links)[number]["href"];

export type StaffWorkspaceSidebarProps = {
  active: StaffWorkspacePath;
  canViewHistory?: boolean;
  canViewSales?: boolean;
  canViewCustomers?: boolean;
  canUsePos?: boolean;
  canViewCredit?: boolean;
  canResolveConflicts?: boolean;
};

type StaffWorkspaceSidebarClientProps = StaffWorkspaceSidebarProps & {
  canManageStaff: boolean;
  canManageOrders: boolean;
  canUpdateSettings: boolean;
  canResolveConflicts: boolean;
};

export function StaffWorkspaceSidebarClient({
  active,
  canViewHistory = false,
  canViewSales = false,
  canViewCustomers = false,
  canUsePos = false,
  canViewCredit = false,
  canResolveConflicts = false,
  canManageStaff,
  canManageOrders,
  canUpdateSettings,
}: StaffWorkspaceSidebarClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleLinks = links.filter(({ href }) => {
    if (href === "/stock-movements") return canViewHistory;
    if (href === "/sales") return canViewSales;
    if (href === "/customers") return canViewCustomers;
    if (href === "/pos") return canUsePos;
    if (href === "/offline-conflicts") return canResolveConflicts;
    if (href === "/credit") return canViewCredit;
    if (href === "/orders") return canManageOrders;
    if (href === "/staff#team-management") return canManageStaff;
    if (href === "/settings/delivery") return canUpdateSettings;
    return true;
  });

  return (
    <>
      <header className="staff-workspace-mobile-bar fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between bg-[#153c33] px-4 text-white shadow-sm lg:hidden">
        <Link href="/staff" className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#e6b94f] text-[#153c33]">
            <Snowflake aria-hidden="true" className="size-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Grand Pa’s</span>
            <span className="block text-[10px] uppercase tracking-[0.16em] text-[#d9e7e0]">
              Cold Store
            </span>
          </span>
        </Link>
        <button
          type="button"
          aria-label={mobileOpen ? "Close staff menu" : "Open staff menu"}
          aria-controls="staff-workspace-navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((isOpen) => !isOpen)}
          className="grid size-10 place-items-center rounded-xl border border-white/20 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6b94f]"
        >
          {mobileOpen ? (
            <X aria-hidden="true" className="size-5" />
          ) : (
            <Menu aria-hidden="true" className="size-5" />
          )}
        </button>
      </header>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close staff menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-[#0b211b]/55 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        id="staff-workspace-navigation"
        aria-label="Staff workspace"
        className={`staff-workspace-sidebar fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-[#153c33] text-white shadow-xl transition-transform duration-200 motion-reduce:transition-none lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e6b94f] text-[#153c33]">
            <Snowflake aria-hidden="true" className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold tracking-tight">
              Grand Pa’s
            </span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-[#d9e7e0]">
              Cold Store
            </span>
          </span>
          <button
            type="button"
            aria-label="Close staff menu"
            onClick={() => setMobileOpen(false)}
            className="grid size-9 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6b94f] lg:hidden"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="px-5 pb-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b9d0c4]">
          Staff workspace
        </div>

        <nav
          aria-label="Staff workspace navigation"
          className="flex-1 overflow-y-auto px-3 pb-4"
        >
          <ul className="space-y-1">
            {visibleLinks.map((link) => {
              const Icon = link.icon;
              const isActive = active === link.href;

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6b94f] ${
                      isActive
                        ? "bg-[#f7f4ec] text-[#153c33] shadow-sm"
                        : "text-[#e7f0eb] hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-[18px] shrink-0"
                      strokeWidth={1.8}
                    />
                    <span>{link.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3 text-xs text-[#d9e7e0]">
            <Settings2 aria-hidden="true" className="size-4 shrink-0 text-[#e6b94f]" />
            <span>Store operations workspace</span>
          </div>
          <form action={signOut}>
            <button className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/15 px-3 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6b94f]">
              <LogOut aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
