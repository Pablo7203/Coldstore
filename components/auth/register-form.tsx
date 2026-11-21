"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpCustomer } from "@/app/(auth)/actions";
import {
  AuthMessage,
  fieldClassName,
  submitClassName,
} from "@/components/auth/auth-shell";

export function RegisterForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signUpCustomer, {});

  return (
    <div>
      <div className="mb-7">
        <h2 className="text-2xl font-semibold tracking-tight">
          Create a customer account
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#5e6b64]">
          Use your details to place and follow orders with Grand Pa’s.
        </p>
      </div>
      <form action={formAction} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <AuthMessage message={state.message} success={state.success} />
        <div>
          <label htmlFor="fullName" className="text-sm font-medium">
            Full name
          </label>
          <input
            id="fullName"
            name="fullName"
            autoComplete="name"
            minLength={2}
            maxLength={120}
            required
            className={fieldClassName}
          />
        </div>
        <div>
          <label htmlFor="phone" className="text-sm font-medium">
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            minLength={7}
            maxLength={32}
            required
            className={fieldClassName}
          />
        </div>
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
          <label htmlFor="password" className="text-sm font-medium">
            Password
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
          <p className="mt-1.5 text-xs text-[#5e6b64]">Use at least 8 characters.</p>
        </div>
        <button type="submit" disabled={pending} className={submitClassName}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[#5e6b64]">
        Already registered?{" "}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-semibold text-[#2f654f] underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
