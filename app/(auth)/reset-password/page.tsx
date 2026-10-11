import { AuthShell } from "@/components/auth/auth-shell";
import { SetNewPasswordForm } from "@/components/auth/reset-forms";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password."
      description="Use a password you have not used for this account before."
    >
      <SetNewPasswordForm />
    </AuthShell>
  );
}
