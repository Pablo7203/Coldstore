import { AuthShell } from "@/components/auth/auth-shell";
import { RequestPasswordResetForm } from "@/components/auth/reset-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Let’s get you back in."
      description="We’ll send a secure reset link to the address associated with your account."
    >
      <RequestPasswordResetForm />
    </AuthShell>
  );
}
