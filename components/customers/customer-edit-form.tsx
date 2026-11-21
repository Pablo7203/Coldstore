"use client";

import { useState } from "react";
import { updateCustomer } from "@/app/(staff)/customers/actions";

export function CustomerEditForm({
  customer,
}: {
  customer: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    notes: string | null;
    status: "active" | "inactive";
  };
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      action={async (data) => {
        setBusy(true);
        setMessage("");
        const result = await updateCustomer(data);
        setBusy(false);
        setMessage(result.error ?? "Customer details saved.");
      }}
      className="grid max-w-xl gap-4 rounded-xl border border-[#d7e0d9] bg-white p-5"
    >
      <input type="hidden" name="id" value={customer.id} />
      <label className="grid gap-1 text-sm">
        Full name
        <input
          required
          name="fullName"
          defaultValue={customer.full_name}
          className="min-h-11 rounded-lg border px-3"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Ghana phone
        <input
          required
          name="phone"
          defaultValue={customer.phone}
          inputMode="tel"
          className="min-h-11 rounded-lg border px-3"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Email (optional)
        <input
          type="email"
          name="email"
          defaultValue={customer.email ?? ""}
          className="min-h-11 rounded-lg border px-3"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Staff notes
        <textarea
          name="notes"
          defaultValue={customer.notes ?? ""}
          maxLength={1000}
          rows={3}
          className="rounded-lg border px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Status
        <select
          name="status"
          defaultValue={customer.status}
          className="min-h-11 rounded-lg border px-3"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      <p className="text-sm text-[#5e6b64]">
        Customer records are deactivated rather than deleted. Existing sales keep their
        customer reference.
      </p>
      <button
        disabled={busy}
        className="min-h-11 rounded-lg bg-[#153c33] px-4 font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save customer"}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
