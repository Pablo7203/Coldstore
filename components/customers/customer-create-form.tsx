"use client";

import { useState, type FormEvent } from "react";

export function CustomerCreateForm({
  compact = false,
  onCreated,
}: {
  compact?: boolean;
  onCreated?: (customer: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
  }) => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    setBusy(true);
    setMessage("");
    setDuplicateWarning(false);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: String(form.get("fullName") ?? ""),
          phone: String(form.get("phone") ?? ""),
          email: String(form.get("email") ?? ""),
          notes: String(form.get("notes") ?? ""),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        customer?: { id: string; full_name: string; phone: string; email: string | null };
        duplicateWarning?: boolean;
        duplicateMatches?: Array<{ full_name: string; phone: string }>;
      };
      if (!response.ok || !result.customer)
        throw new Error(result.error ?? "Customer could not be saved.");
      setDuplicateWarning(Boolean(result.duplicateWarning));
      const matchingPeople = result.duplicateMatches
        ?.map((person) => `${person.full_name} (${person.phone})`)
        .join(", ");
      setMessage(
        result.duplicateWarning
          ? `Customer created. Possible duplicate: ${matchingPeople || "review matching records"}.`
          : "Customer created.",
      );
      onCreated?.(result.customer);
      formElement.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Customer could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-xl border border-[#d7e0d9] bg-white p-4"
    >
      <h2 className="font-semibold">{compact ? "Quick customer" : "Add a customer"}</h2>
      <label className="grid gap-1 text-sm">
        Full name
        <input
          required
          name="fullName"
          minLength={2}
          maxLength={120}
          autoComplete="name"
          className="min-h-11 rounded-lg border border-[#d7e0d9] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f]"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Ghana phone
        <input
          required
          name="phone"
          inputMode="tel"
          autoComplete="tel"
          placeholder="024 123 4567"
          className="min-h-11 rounded-lg border border-[#d7e0d9] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f]"
        />
      </label>
      {!compact && (
        <label className="grid gap-1 text-sm">
          Email (optional)
          <input
            type="email"
            name="email"
            autoComplete="email"
            className="min-h-11 rounded-lg border border-[#d7e0d9] px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f]"
          />
        </label>
      )}
      {!compact && (
        <label className="grid gap-1 text-sm">
          Notes (optional)
          <textarea
            name="notes"
            maxLength={1000}
            rows={2}
            className="rounded-lg border border-[#d7e0d9] px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f]"
          />
        </label>
      )}
      <button
        disabled={busy}
        className="min-h-11 rounded-lg bg-[#153c33] px-4 font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Saving customer…" : "Create customer"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${duplicateWarning ? "text-amber-900" : "text-[#526052]"}`}
      >
        {message}
      </p>
    </form>
  );
}
