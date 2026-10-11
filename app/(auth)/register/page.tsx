import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="Customer account"
      title="A familiar store, a simpler way to order."
      description="Create an account to place orders and keep track of them. Your customer profile is separate from staff access."
    >
      <RegisterForm />
    </AuthShell>
  );
}
