import { StaffTagsClient } from "@/components/staff-tags-client";
import { isSchedulerAdminRole, requirePageUser, USER_ROLE } from "@/lib/auth";

export default async function StaffTagsPage() {
  const user = await requirePageUser();
  if (user.role !== USER_ROLE.SUPER_ADMIN && !isSchedulerAdminRole(user.role)) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }
  return <StaffTagsClient />;
}
