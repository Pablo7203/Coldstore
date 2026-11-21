import { userHasPermission } from "@/lib/auth/authorization";
import {
  StaffWorkspaceSidebarClient,
  type StaffWorkspaceSidebarProps,
} from "@/components/staff/staff-workspace-sidebar-client";

/** Resolve permission-based links on the server and render the shared sidebar. */
export async function StaffWorkspaceNav(props: StaffWorkspaceSidebarProps) {
  const [canManageStaff, canManageOrders, canUpdateSettings, canResolveConflicts] =
    await Promise.all([
      userHasPermission("manage_staff"),
      userHasPermission("manage_orders"),
      userHasPermission("manage_delivery_rate"),
      userHasPermission("resolve_conflicts"),
    ]);

  return (
    <StaffWorkspaceSidebarClient
      {...props}
      canManageStaff={canManageStaff}
      canManageOrders={canManageOrders}
      canUpdateSettings={canUpdateSettings}
      canResolveConflicts={canResolveConflicts}
    />
  );
}
