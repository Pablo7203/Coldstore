import { connection } from "next/server";
import { requireCustomerContext } from "@/lib/auth/authorization";

export default async function CustomerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  await requireCustomerContext();
  return children;
}
