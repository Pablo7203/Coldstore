"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/(auth)/actions";
import {
  AuthMessage,
  fieldClassName,
  submitClassName,
} from "@/components/auth/auth-shell";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState(signIn, {});
  const noticeMessage =
    notice === "inactive"
      ? "This staff account is inactive. Contact the administrator."
      : notice === "link"
        ? "That sign-in link is invalid or has expired. Request a new one."
        : undefined;

  return (
    <div>
      <div className="mb-7">
        <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
        <p className="mt-2 text-sm leading-6 text-[#667066]">
          Staff and customers can use their email and password.
        </p>
      </div>
      <form action={formAction} className="space-y-5">
        <AuthMessage message={state.message ?? noticeMessage} success={state.success} />
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
        <div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-[#45634d] underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            className={fieldClassName}
          />
        </div>
        <button type="submit" disabled={pending} className={submitClassName}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[#667066]">
        Shopping with us online?{" "}
        <Link
          href="/register"
          className="font-semibold text-[#45634d] underline-offset-4 hover:underline"
        >
          Create a customer account
        </Link>
      </p>
    </div>
  );
}
