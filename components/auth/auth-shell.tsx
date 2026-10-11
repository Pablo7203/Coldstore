import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-svh bg-[#f4f3ed] px-5 py-10 text-[#20251f] sm:px-8 sm:py-14">
      <div className="mx-auto grid min-h-[calc(100svh-5rem)] w-full max-w-5xl overflow-hidden rounded-3xl border border-[#d9ded3] bg-white shadow-[0_24px_80px_-48px_rgba(31,49,37,0.38)] sm:min-h-[calc(100svh-7rem)] sm:grid-cols-[0.88fr_1.12fr]">
        <section className="flex flex-col justify-between bg-[#30483a] p-7 text-[#f7f7f1] sm:p-10 lg:p-12">
          <Link href="/" className="w-fit text-sm font-semibold tracking-wide">
            GRAND PA’S <span className="font-normal text-[#c8d0c5]">· COLD STORE</span>
          </Link>
          <div className="my-12 max-w-sm sm:my-0">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#c8d0c5]">
              {eyebrow}
            </p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-[#dce2d8]">
              {description}
            </p>
          </div>
          <p className="text-xs text-[#c8d0c5]">
            A simpler way to keep the store moving.
          </p>
        </section>
        <section className="flex items-center justify-center px-6 py-9 sm:px-10 lg:px-16">
          <div className="w-full max-w-md">{children}</div>
        </section>
      </div>
    </main>
  );
}

export function AuthMessage({
  message,
  success = false,
}: {
  message?: string;
  success?: boolean;
}) {
  if (!message) return null;

  return (
    <p
      className={`rounded-lg border px-3 py-2.5 text-sm leading-5 ${success ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}
      role={success ? "status" : "alert"}
    >
      {message}
    </p>
  );
}

export const fieldClassName =
  "mt-1.5 block min-h-11 w-full rounded-lg border border-[#cfd6cc] bg-white px-3.5 text-sm text-[#20251f] outline-none transition placeholder:text-[#879087] focus:border-[#496652] focus:ring-2 focus:ring-[#496652]/20";

export const submitClassName =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#30483a] px-4 text-sm font-semibold text-white transition hover:bg-[#253a2d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#496652] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";
