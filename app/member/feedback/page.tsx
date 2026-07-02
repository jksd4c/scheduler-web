import { MemberFeedbackClient } from "@/components/member-feedback-client";
import { AuthError, requirePageUser, USER_ROLE } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function MemberFeedbackPage() {
  try {
    const user = await requirePageUser();
    if (user.role !== USER_ROLE.MEMBER && user.role !== USER_ROLE.SUPER_ADMIN) {
      redirect("/dashboard");
    }
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect("/login");
    throw error;
  }
  return <MemberFeedbackClient />;
}
