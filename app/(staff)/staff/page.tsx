import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CreateStaffForm } from "@/components/staff/create-staff-form";
import { StaffDirectory } from "@/components/staff/staff-directory";
import { StaffWorkspaceNav } from "@/components/staff/staff-workspace-nav";
import { requireStaffContext, userHasPermission } from "@/lib/auth/authorization";
import { createClient } from "@/lib/supabase/server";

const roleNames = {
  admin: "Administrator",
  manager: "Manager",
  cashier: "Cashier",
  stock_assistant: "Stock assistant",
} as const;

type DashboardAction = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export default async function StaffHomePage() {
  const staff = await requireStaffContext();
  const [
    canManageStaff,
    canManageOrders,
    canManageSettings,
    canUsePos,
    canViewSales,
    canViewCustomers,
    canViewHistory,
    canViewCredit,
  ] = await Promise.all([
    userHasPermission("manage_staff"),
    userHasPermission("manage_orders"),
    userHasPermission("manage_delivery_rate"),
    userHasPermission("complete_sale"),
    userHasPermission("view_sales_history"),
    userHasPermission("view_customers"),
    userHasPermission("view_stock_history"),
    userHasPermission("view_credit"),
  ]);

  const client = canManageStaff ? await createClient() : null;
  const { data: staffProfiles } = client
    ? await client
        .from("staff_profiles")
        .select("user_id, full_name, phone, role, is_active, created_at, updated_at")
        .order("full_name")
    : { data: [] };

  const firstName = staff.fullName.trim().split(/\s+/u)[0] || staff.fullName;
  const primaryAction: DashboardAction = canManageOrders
    ? {
        href: "/orders",
        label: "View online orders",
        description: "Prepare pickups and update delivery progress.",
        icon: ClipboardList,
      }
    : canUsePos
      ? {
          href: "/pos",
          label: "Start a sale",
          description: "Open the counter and serve your next customer.",
          icon: ShoppingBag,
        }
      : {
          href: "/inventory",
          label: "Check inventory",
          description: "Review available stock and recent movements.",
          icon: Boxes,
        };

  const dailyActions: DashboardAction[] = [
    ...(canUsePos
      ? [
          {
            href: "/pos",
            label: "Point of sale",
            description: "Scan products and take a customer payment.",
            icon: ShoppingBag,
          },
        ]
      : []),
    {
      href: "/inventory",
      label: "Check inventory",
      description: "Review stock availability and record movements.",
      icon: Boxes,
    },
    {
      href: "/products",
      label: "Manage products",
      description: "Keep product details and prices current.",
      icon: PackageCheck,
    },
    ...(canViewHistory
      ? [
          {
            href: "/stock-movements",
            label: "Review stock movements",
            description: "See recorded receipts and adjustments.",
            icon: ClipboardList,
          },
        ]
      : []),
  ]
    .filter((action) => action.href !== primaryAction.href)
    .slice(0, 3);

  const moreTools: DashboardAction[] = [
    ...(canViewSales
      ? [
          {
            href: "/sales",
            label: "Sales history",
            description: "Search transactions and receipts.",
            icon: ReceiptText,
          },
        ]
      : []),
    ...(canViewCustomers
      ? [
          {
            href: "/customers",
            label: "Customers",
            description: "Find customer records and contact details.",
            icon: Users,
          },
        ]
      : []),
    ...(canViewCredit
      ? [
          {
            href: "/credit",
            label: "Customer credit",
            description: "Review balances and repayments.",
            icon: CreditCard,
          },
        ]
      : []),
    ...(canManageSettings
      ? [
          {
            href: "/settings/delivery",
            label: "Delivery rate",
            description: "Set the flat fee used at checkout.",
            icon: Truck,
          },
        ]
      : []),
  ];

  return (
    <main className="min-h-svh min-w-0 bg-[#f7f4ec] text-[#1f2924]">
      <StaffWorkspaceNav
        active="/staff"
        canUsePos={canUsePos}
        canViewSales={canViewSales}
        canViewCustomers={canViewCustomers}
        canViewHistory={canViewHistory}
        canViewCredit={canViewCredit}
      />

      <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-5 sm:px-7 lg:px-10 lg:pt-7">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5e6b64]">
            Staff workspace
          </p>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden min-h-10 items-center gap-2 rounded-full border border-[#d7e0d9] bg-white px-3.5 text-sm font-medium sm:inline-flex">
              <UserRound aria-hidden="true" className="size-4 text-[#2f654f]" />
              {staff.fullName}
            </span>
          </div>
        </header>

        <section
          aria-labelledby="welcome-title"
          className="grid overflow-hidden rounded-[24px] border border-[#d7e0d9] bg-white lg:grid-cols-[minmax(0,1.08fr)_minmax(20rem,0.92fr)]"
        >
          <div className="flex flex-col items-start justify-center p-6 sm:p-9 lg:p-10">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#eaf2f3] px-3 py-1.5 text-xs font-semibold text-[#153c33]">
              <ShieldCheck aria-hidden="true" className="size-4" />
              Store operations
            </p>
            <h1
              id="welcome-title"
              className="mt-4 max-w-xl text-3xl font-semibold tracking-tight text-[#153c33] sm:text-4xl"
            >
              Welcome back, {firstName}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-[#5e6b64] sm:text-base">
              Keep orders moving, stock accurate, and the counter ready.
            </p>
            <Link
              href={primaryAction.href}
              className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#b7472a] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#96391f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b7472a] focus-visible:ring-offset-2 active:translate-y-px motion-reduce:transition-none"
            >
              <primaryAction.icon aria-hidden="true" className="size-[18px]" />
              {primaryAction.label}
              <ArrowUpRight aria-hidden="true" className="ml-1 size-4" />
            </Link>
            <p className="mt-3 text-xs leading-5 text-[#5e6b64]">
              {primaryAction.description}
            </p>
          </div>
          <div className="relative min-h-[220px] bg-[#eaf2f3] sm:min-h-[280px] lg:min-h-[330px]">
            <Image
              src="/storefront-freezer.png"
              alt="Frozen meat and fish displayed in a cold-store freezer"
              fill
              preload
              sizes="(max-width: 1023px) 100vw, 45vw"
              className="object-cover"
            />
          </div>
        </section>

        <div className="mt-5 grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.8fr)]">
          <section
            aria-labelledby="operations-title"
            className="rounded-[22px] border border-[#d7e0d9] bg-white p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="operations-title"
                  className="text-xl font-semibold tracking-tight"
                >
                  Daily operations
                </h2>
                <p className="mt-1 text-sm text-[#5e6b64]">
                  Pick up where you need to work.
                </p>
              </div>
            </div>

            {dailyActions.length ? (
              <div className="mt-5 divide-y divide-[#eaf2f3]">
                {dailyActions.map((action) => {
                  const Icon = action.icon;

                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="group flex min-h-[76px] items-center gap-3 py-3 first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2f654f]"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eaf2f3] text-[#153c33] transition-colors group-hover:bg-[#dce9e9] motion-reduce:transition-none">
                        <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[#1f2924]">
                          {action.label}
                        </span>
                        <span className="mt-1 block text-sm leading-5 text-[#5e6b64]">
                          {action.description}
                        </span>
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-5 shrink-0 text-[#2f654f] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-[#f7f4ec] px-4 py-4 text-sm leading-6 text-[#5e6b64]">
                Your account is active. Contact an administrator if you need access to
                more store tools.
              </p>
            )}
          </section>

          <section
            aria-labelledby="access-title"
            className="rounded-[22px] border border-[#d7e0d9] bg-[#eaf2f3] p-5 sm:p-6"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#153c33] text-[#e6b94f]">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 id="access-title" className="text-lg font-semibold tracking-tight">
                  Store access
                </h2>
                <p className="text-sm text-[#5e6b64]">Your account and role</p>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-[#d7e0d9] bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5e6b64]">
                Assigned role
              </p>
              <p className="mt-2 text-lg font-semibold text-[#153c33]">
                {roleNames[staff.role]}
              </p>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm font-medium text-[#2f654f]">
              <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
              Account active
            </p>
            <p className="mt-2 text-sm leading-6 text-[#5e6b64]">
              Available tools follow the permissions assigned to your role.
            </p>
          </section>
        </div>

        {moreTools.length ? (
          <section aria-labelledby="more-tools-title" className="mt-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2
                  id="more-tools-title"
                  className="text-xl font-semibold tracking-tight"
                >
                  More tools
                </h2>
                <p className="mt-1 text-sm text-[#5e6b64]">
                  Other areas available to your role.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {moreTools.map((action) => {
                const Icon = action.icon;

                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group flex min-h-[104px] items-center gap-3 rounded-2xl border border-[#d7e0d9] bg-white p-4 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-[#9eb5aa] hover:shadow-[0_10px_24px_rgba(21,60,51,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f] focus-visible:ring-offset-2 active:translate-y-px motion-reduce:transform-none motion-reduce:transition-none"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f7f4ec] text-[#153c33]">
                      <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[#1f2924]">
                        {action.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#5e6b64]">
                        {action.description}
                      </span>
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-[#2f654f]"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {canManageStaff ? (
          <section
            id="team-management"
            aria-labelledby="team-management-title"
            className="mt-10 scroll-mt-8"
          >
            <div className="mb-4">
              <h2
                id="team-management-title"
                className="text-xl font-semibold tracking-tight"
              >
                Team management
              </h2>
              <p className="mt-1 text-sm text-[#5e6b64]">
                Create staff accounts and manage existing access.
              </p>
            </div>
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <StaffDirectory profiles={staffProfiles ?? []} />
              <CreateStaffForm />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
