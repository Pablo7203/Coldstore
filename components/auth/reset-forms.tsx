"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, setNewPassword } from "@/app/(auth)/actions";
import {
  AuthMessage,
  fieldClassName,
  submitClassName,
} from "@/components/auth/auth-shell";

export function RequestPasswordResetForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, {});

  return (
    <div>
      <div className="mb-7">
        <h2 className="text-2xl font-semibold tracking-tight">Reset your password</h2>
        <p className="mt-2 text-sm leading-6 text-[#5e6b64]">
          Enter your account email and we’ll send a reset link if an account matches.
        </p>
      </div>
      <form action={formAction} className="space-y-5">
        <AuthMessage message={state.message} success={state.success} />
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={fieldClassName}
          />
        </div>
        <button type="submit" disabled={pending} className={submitClassName}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-6 text-sm">
        <Link
          href="/login"
          className="font-semibold text-[#2f654f] underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export function SetNewPasswordForm() {
  const [state, formAction, pending] = useActionState(setNewPassword, {});

  return (
    <div>
      <div className="mb-7">
        <h2 className="text-2xl font-semibold tracking-tight">Choose a new password</h2>
        <p className="mt-2 text-sm leading-6 text-[#5e6b64]">
          Set a password with at least 8 characters.
        </p>
      </div>
      <form action={formAction} className="space-y-5">
        <AuthMessage message={state.message} success={state.success} />
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={fieldClassName}
          />
        </div>
        <div>
          <label htmlFor="confirmation" className="text-sm font-medium">
            Confirm new password
          </label>
          <input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className={fieldClassName}
          />
        </div>
        <button type="submit" disabled={pending} className={submitClassName}>
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
