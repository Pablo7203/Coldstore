import { requireCustomerContext } from "@/lib/auth/authorization";

export default async function CustomerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireCustomerContext();
  return children;
}
