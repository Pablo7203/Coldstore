import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; next?: string }>;
}) {
  const { notice, next } = await searchParams;

  return (
    <AuthShell
      eyebrow="Staff and customer access"
      title="Good to have you back."
      description="Sign in to continue to your Grand Pa’s account. Your role determines which parts of the store you can access."
    >
      <LoginForm notice={notice} next={next} />
    </AuthShell>
  );
}
