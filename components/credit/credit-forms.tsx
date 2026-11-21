"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveCreditAccount, recordCreditRepayment } from "@/app/(staff)/credit/actions";
import { formatGhs } from "@/lib/inventory/format";

type State = { message?: string; success?: boolean; paymentId?: string };
const initial: State = {};

export function CreditAccountForm({
  customerId,
  limit = "0.00",
  status = "active",
  submitLabel = "Save account",
  pendingLabel = "Saving…",
}: {
  customerId: string;
  limit?: string;
  status?: "active" | "suspended";
  submitLabel?: string;
  pendingLabel?: string;
}) {
  const [state, action, pending] = useActionState(saveCreditAccount, initial);
  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border border-[#d7e0d9] bg-white p-4 sm:grid-cols-[1fr_12rem_auto]"
    >
      <input type="hidden" name="customerId" value={customerId} />
      <label className="grid gap-1 text-sm">
        Credit limit (GHS)
        <input
          name="creditLimit"
          defaultValue={limit}
          inputMode="decimal"
          required
          placeholder="e.g. 500.00"
          className="min-h-11 rounded-lg border px-3"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Account status
        <select
          name="status"
          defaultValue={status}
          className="min-h-11 rounded-lg border bg-white px-3"
        >
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </label>
      <button
        disabled={pending}
        className="min-h-11 self-end rounded-lg bg-[#153c33] px-4 font-semibold text-white disabled:opacity-60"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
      {state.message && (
        <p role={state.success ? "status" : "alert"} className="text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}

export function RepaymentForm({
  customerId,
  balance,
}: {
  customerId: string;
  balance: string;
}) {
  const [state, action, pending] = useActionState(recordCreditRepayment, initial);
  return (
    <form
      action={action}
      className="grid gap-3 rounded-xl border border-[#d7e0d9] bg-white p-4 sm:grid-cols-2"
    >
      <input type="hidden" name="customerId" value={customerId} />
      <p className="sm:col-span-2 text-sm">
        Outstanding balance: <strong>{formatGhs(balance)}</strong>
      </p>
      <label className="grid gap-1 text-sm">
        Amount received (GHS)
        <input
          name="amount"
          inputMode="decimal"
          required
          className="min-h-11 rounded-lg border px-3"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Received by
        <select name="paymentMethod" className="min-h-11 rounded-lg border bg-white px-3">
          <option value="cash">Cash</option>
          <option value="external_momo">Externally confirmed MoMo</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        MoMo reference (optional)
        <input
          name="reference"
          maxLength={120}
          className="min-h-11 rounded-lg border px-3"
        />
      </label>
      <button
        disabled={pending}
        className="min-h-11 rounded-lg bg-[#153c33] px-4 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record repayment"}
      </button>
      {state.message && (
        <p role={state.success ? "status" : "alert"} className="self-center text-sm">
          {state.message}
          {state.paymentId && state.success && (
            <>
              {" "}
              <Link className="underline" href={`/credit/repayments/${state.paymentId}`}>
                View receipt
              </Link>
            </>
          )}
        </p>
      )}
    </form>
  );
}
