"use client";

import { useActionState } from "react";
import { createStaffAccount } from "@/app/(staff)/staff/actions";
import {
  AuthMessage,
  fieldClassName,
  submitClassName,
} from "@/components/auth/auth-shell";

export function CreateStaffForm() {
  const [state, formAction, pending] = useActionState(createStaffAccount, {});

  return (
    <section className="mt-8 rounded-2xl border border-[#d9ded3] bg-white p-6 sm:p-8">
      <h2 className="text-lg font-semibold">Create a staff account</h2>
      <p className="mt-2 text-sm leading-6 text-[#667066]">
        Staff can set their password through the password recovery link after the account
        is created.
      </p>
      <form action={formAction} className="mt-6 grid gap-4 sm:grid-cols-2">
        <AuthMessage message={state.message} success={state.success} />
        <div>
          <label htmlFor="staff-full-name" className="text-sm font-medium">
            Full name
          </label>
          <input
            id="staff-full-name"
            name="fullName"
            autoComplete="name"
            minLength={2}
            maxLength={120}
            required
            className={fieldClassName}
          />
        </div>
        <div>
          <label htmlFor="staff-email" className="text-sm font-medium">
            Email address
          </label>
          <input
            id="staff-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={fieldClassName}
          />
        </div>
        <div>
          <label htmlFor="staff-phone" className="text-sm font-medium">
            Ghana phone number
          </label>
          <input
            id="staff-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            className={fieldClassName}
          />
          <p className="mt-1.5 text-xs text-[#667066]">
            Optional. Stored as +233 followed by nine digits.
          </p>
        </div>
        <div>
          <label htmlFor="staff-role" className="text-sm font-medium">
            Staff role
          </label>
          <select
            id="staff-role"
            name="role"
            required
            className={fieldClassName}
            defaultValue="cashier"
          >
            <option value="admin">Administrator</option>
            <option value="manager">Manager</option>
            <option value="cashier">Cashier</option>
            <option value="stock_assistant">Stock assistant</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className={submitClassName}>
            {pending ? "Creating account…" : "Create staff account"}
          </button>
        </div>
      </form>
    </section>
  );
}
