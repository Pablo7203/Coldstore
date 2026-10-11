import { signOut } from "@/app/(auth)/actions";
import { requireCustomerContext } from "@/lib/auth/authorization";

export default async function CustomerAccountPage() {
  const customer = await requireCustomerContext();

  return (
    <main className="min-h-svh bg-[#f4f3ed] px-5 py-8 text-[#20251f] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d9ded3] pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60705f]">
              Grand Pa’s · Customer account
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Hello, {customer.fullName}
            </h1>
          </div>
          <form action={signOut}>
            <button className="min-h-10 rounded-lg border border-[#cfd6cc] bg-white px-4 text-sm font-medium hover:bg-[#f7f8f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#496652]">
              Sign out
            </button>
          </form>
        </header>
        <section className="mt-8 rounded-2xl border border-[#d9ded3] bg-white p-6 sm:p-8">
          <p className="text-sm leading-6 text-[#667066]">
            Your customer account is ready. Online ordering will be added in a later
            project phase.
          </p>
        </section>
      </div>
    </main>
  );
}
