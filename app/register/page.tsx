import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/register-form";
import { getCurrentUser, getUserHomePath } from "@/lib/auth";
import { getActiveOrganizationOptions } from "@/lib/organizations";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(getUserHomePath(user));
  }

  const hospitals = await getActiveOrganizationOptions();

  return <RegisterForm hospitals={hospitals} />;
}
