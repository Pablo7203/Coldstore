"use client";

import { useActionState } from "react";
import {
  resolveOfflinePosOperation,
  type ConflictActionState,
} from "@/app/(staff)/offline-conflicts/actions";

const initialState: ConflictActionState = {};

export function OfflineConflictActions({ operationId }: { operationId: string }) {
  const [state, formAction, pending] = useActionState(
    resolveOfflinePosOperation,
    initialState,
  );

  return (
    <form action={formAction} className="mt-5 space-y-3">
      <input type="hidden" name="operationId" value={operationId} />
      <label className="grid gap-1 text-sm font-medium">
        Review note <span className="font-normal text-[#5e6b64]">(required)</span>
        <textarea
          name="note"
          required
          minLength={3}
          maxLength={1000}
          rows={2}
          placeholder="For example: checked receipt, stock adjusted in movement MOV-1042"
          className="w-full rounded-xl border border-[#7c8980] bg-white px-3 py-2 text-[#1f2924] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f654f]"
        />
      </label>
      <p className="text-xs leading-5 text-[#5e6b64]">
        Accept only after confirming the cash receipt and reconciling available stock.
        Mark void only when the physical sale did not complete.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="resolution"
          value="accept"
          disabled={pending}
          className="min-h-10 rounded-xl bg-[#153c33] px-4 text-sm font-semibold text-white hover:bg-[#2f654f] disabled:opacity-60"
        >
          {pending ? "Saving review…" : "Accept and record sale"}
        </button>
        <button
          type="submit"
          name="resolution"
          value="void"
          disabled={pending}
          className="min-h-10 rounded-xl border border-[#d7e0d9] bg-white px-4 text-sm font-semibold text-[#1f2924] hover:bg-[#f7f4ec] disabled:opacity-60"
        >
          Mark void with reason
        </button>
      </div>
      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={`rounded-xl p-3 text-sm ${
            state.success
              ? "bg-emerald-50 text-emerald-900"
              : "bg-amber-50 text-amber-950"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
