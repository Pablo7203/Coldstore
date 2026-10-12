"use client";

import { useActionState } from "react";
import { deactivateStaffAccount } from "@/app/(staff)/staff/actions";
import { AuthMessage } from "@/components/auth/auth-shell";
import type { Database } from "@/types/database";

type StaffProfile = Database["public"]["Tables"]["staff_profiles"]["Row"];

const roleNames = {
  admin: "Administrator",
  manager: "Manager",
  cashier: "Cashier",
  stock_assistant: "Stock assistant",
} as const;

export function StaffDirectory({ profiles }: { profiles: StaffProfile[] }) {
  return (
    <section className="mt-8 rounded-2xl border border-[#d9ded3] bg-white p-6 sm:p-8">
      <h2 className="text-lg font-semibold">Staff accounts</h2>
      <ul className="mt-4 divide-y divide-[#e5e8e1]">
        {profiles.map((profile) => (
          <StaffDirectoryRow key={profile.user_id} profile={profile} />
        ))}
      </ul>
    </section>
  );
}

function StaffDirectoryRow({ profile }: { profile: StaffProfile }) {
  const [state, formAction, pending] = useActionState(deactivateStaffAccount, {});

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="font-medium">{profile.full_name}</p>
        <p className="mt-1 text-sm text-[#667066]">
          {roleNames[profile.role]} · {profile.is_active ? "Active" : "Inactive"}
        </p>
        {state.message ? (
          <AuthMessage message={state.message} success={state.success} />
        ) : null}
      </div>
      {profile.is_active ? (
        <form action={formAction}>
          <input type="hidden" name="userId" value={profile.user_id} />
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 rounded-lg border border-[#cfd6cc] px-3 text-sm font-medium hover:bg-[#f7f8f5] disabled:opacity-60"
          >
            {pending ? "Deactivating…" : "Deactivate"}
          </button>
        </form>
      ) : null}
    </li>
  );
}
