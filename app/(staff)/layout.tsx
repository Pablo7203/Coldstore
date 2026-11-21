import { connection } from "next/server";
import { requireStaffContext } from "@/lib/auth/authorization";

export default async function StaffRoutesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  await requireStaffContext();
  return children;
}
