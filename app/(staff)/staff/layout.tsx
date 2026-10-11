import { requireStaffContext } from "@/lib/auth/authorization";

export default async function StaffLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireStaffContext();
  return children;
}
