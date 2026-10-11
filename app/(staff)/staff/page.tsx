import { signOut } from "@/app/(auth)/actions";
import { requireStaffContext } from "@/lib/auth/authorization";

const roleNames = {
  admin: "Administrator",
  manager: "Manager",
  cashier: "Cashier",
  stock_assistant: "Stock assistant",
} as const;

export default async function StaffHomePage() {
  const staff = await requireStaffContext();

  return (
    <main className="min-h-svh bg-[#f4f3ed] px-5 py-8 text-[#20251f] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d9ded3] pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60705f]">
              Grand Pa’s · Staff workspace
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Welcome, {staff.fullName}
            </h1>
          </div>
          <form action={signOut}>
            <button className="min-h-10 rounded-lg border border-[#cfd6cc] bg-white px-4 text-sm font-medium hover:bg-[#f7f8f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#496652]">
              Sign out
            </button>
          </form>
        </header>
        <section className="mt-8 rounded-2xl border border-[#d9ded3] bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#667066]">
            Your access
          </p>
          <p className="mt-2 text-lg font-semibold">{roleNames[staff.role]}</p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#667066]">
            Your account is active. Store operations will be added in their planned
            project phases.
          </p>
        </section>
      </div>
    </main>
  );
}
