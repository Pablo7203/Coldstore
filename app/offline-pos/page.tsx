import { PosTerminal } from "@/components/pos/pos-terminal";

export default function OfflinePosPage() {
  return (
    <main className="min-h-svh bg-[#f7f4ec] px-4 py-6 text-[#1f2924] sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-2xl border border-[#d7e0d9] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5e6b64]">
            Prepared local workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Offline point of sale
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5e6b64]">
            This page uses the catalogue prepared on this device. Only cash sales are
            supported offline. Saved transactions stay in a local sync queue until the
            cashier reconnects and the server accepts them or sends them for review.
          </p>
          <a
            href="/pos"
            className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-[#153c33] px-4 text-sm font-semibold text-[#153c33] hover:bg-[#eaf2f3]"
          >
            Return to live POS
          </a>
        </header>
        <PosTerminal offlineOnly />
      </div>
    </main>
  );
}
