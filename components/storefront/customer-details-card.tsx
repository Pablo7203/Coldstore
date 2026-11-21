"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserRound } from "lucide-react";
import {
  requestCustomerEmailChange,
  updateCustomerDetails,
} from "@/app/(customer)/account/actions";

type CustomerDetailsCardProps = {
  fullName: string;
  phone: string | null;
  email: string | null;
  unavailable?: boolean;
  localEmailPreviewUrl?: string | null;
};

const fieldClassName =
  "mt-1.5 h-11 w-full rounded-xl border border-[#7c8980] bg-white px-3 text-sm text-[#1f2924] outline-none transition-colors focus:border-[#2f654f]";

export function CustomerDetailsCard({
  fullName,
  phone,
  email,
  unavailable = false,
  localEmailPreviewUrl = null,
}: CustomerDetailsCardProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [detailsState, detailsAction, detailsPending] = useActionState(
    updateCustomerDetails,
    {},
  );
  const [emailState, emailAction, emailPending] = useActionState(
    requestCustomerEmailChange,
    {},
  );

  useEffect(() => {
    if (detailsState.updatedAt) router.refresh();
  }, [detailsState.updatedAt, router]);

  return (
    <section
      id="customer-details"
      className="scroll-mt-24 rounded-3xl border border-[var(--store-line)] bg-[var(--store-surface)] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--store-soft)] text-[#153c33]">
            <UserRound size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold">Your details</h2>
            <p className="text-xs text-[var(--store-muted)]">Used for order updates</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--store-line)] px-3 text-xs font-semibold text-[#153c33] transition-colors hover:bg-[var(--store-soft)]"
          aria-expanded={editing}
          aria-controls={editing ? "customer-details-editor" : undefined}
        >
          {editing ? null : <Pencil size={14} aria-hidden="true" />}
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--store-muted)]">Name</dt>
          <dd className="mt-0.5 font-medium">{fullName}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--store-muted)]">Email</dt>
          <dd className="mt-0.5 break-all font-medium">{email ?? "Not provided"}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--store-muted)]">Phone</dt>
          <dd className="mt-0.5 font-medium">{phone ?? "Not provided"}</dd>
        </div>
      </dl>
      {unavailable ? (
        <p className="mt-3 text-xs text-[var(--store-muted)]">
          Contact details are temporarily unavailable.
        </p>
      ) : null}

      {editing ? (
        <div
          id="customer-details-editor"
          className="mt-5 space-y-6 border-t border-[var(--store-line)] pt-5"
        >
          <form action={detailsAction} className="space-y-4">
            <h3 className="text-sm font-semibold">Contact details</h3>
            <div>
              <label htmlFor="account-full-name" className="text-xs font-semibold">
                Full name
              </label>
              <input
                id="account-full-name"
                name="fullName"
                type="text"
                autoComplete="name"
                defaultValue={fullName}
                minLength={2}
                maxLength={120}
                required
                className={fieldClassName}
              />
            </div>
            <div>
              <label htmlFor="account-phone" className="text-xs font-semibold">
                Phone number
              </label>
              <input
                id="account-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                defaultValue={phone ?? ""}
                placeholder="e.g. +233 24 555 0302"
                required
                className={fieldClassName}
              />
            </div>
            {detailsState.message ? (
              <p
                role={detailsState.success ? "status" : "alert"}
                aria-live="polite"
                className={`rounded-xl px-3 py-2 text-xs leading-5 ${detailsState.success ? "bg-[#eaf2f3] text-[#153c33]" : "bg-[#fff0eb] text-[#87351f]"}`}
              >
                {detailsState.message}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={detailsPending}
              className="store-button-primary w-full justify-center disabled:cursor-wait disabled:opacity-60"
            >
              {detailsPending ? "Saving…" : "Save details"}
            </button>
          </form>

          <form
            action={emailAction}
            className="space-y-3 border-t border-[var(--store-line)] pt-5"
          >
            <div>
              <h3 className="text-sm font-semibold">Change email address</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--store-muted)]">
                We use this for sign in, receipts, and payment. Confirm the change from
                both inboxes before the new address takes effect.
              </p>
              {localEmailPreviewUrl ? (
                <p className="mt-2 text-xs leading-5 text-[var(--store-muted)]">
                  Local test emails appear in{" "}
                  <a
                    href={localEmailPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[#153c33] underline underline-offset-2 dark:text-[#e6b94f]"
                  >
                    Mailpit
                  </a>
                  , not your personal inbox.
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="account-email" className="text-xs font-semibold">
                New email address
              </label>
              <input
                id="account-email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={email ?? ""}
                maxLength={254}
                required
                className={fieldClassName}
              />
            </div>
            {emailState.message ? (
              <p
                role={emailState.success ? "status" : "alert"}
                aria-live="polite"
                className={`rounded-xl px-3 py-2 text-xs leading-5 ${emailState.success ? "bg-[#eaf2f3] text-[#153c33]" : "bg-[#fff0eb] text-[#87351f]"}`}
              >
                {emailState.message}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={emailPending}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2f654f] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#39785e] disabled:cursor-wait disabled:opacity-60"
            >
              {emailPending ? "Sending links…" : "Send confirmation links"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
