import { JoinCodesClient } from "@/components/roster-workflow-client";
import { requirePageUser } from "@/lib/auth";

export default async function JoinCodesPage() {
  const user = await requirePageUser();
  if (user.role === "MEMBER") return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  return <JoinCodesClient />;
}
