import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeRedirectPath } from "@/lib/auth/redirect-path";
import { sendWelcomeEmail } from "@/lib/email/notifications";
import { createClient } from "@/lib/supabase/server";

const otpTypes: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const destination = safeRedirectPath(url.searchParams.get("next"));
  const supabase = await createClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  let isSignupConfirmation = url.searchParams.get("event") === "signup";

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL("/login?notice=link", request.url));
  } else if (tokenHash && type && otpTypes.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return NextResponse.redirect(new URL("/login?notice=link", request.url));
    isSignupConfirmation ||= type === "signup";
  } else {
    return NextResponse.redirect(new URL("/login?notice=link", request.url));
  }

  if (isSignupConfirmation) {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    const fullName = user?.user_metadata?.full_name;
    if (user?.email && user.user_metadata?.account_type === "customer" && user.id) {
      await sendWelcomeEmail({
        userId: user.id,
        email: user.email,
        fullName: typeof fullName === "string" ? fullName : "there",
      });
    }
  }

  return NextResponse.redirect(new URL(destination, request.url));
}
