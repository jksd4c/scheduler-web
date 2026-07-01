import { redirect } from "next/navigation";
import { GuestLoginForm } from "@/components/guest-login-form";
import { getCurrentGuest } from "@/lib/auth";

export default async function GuestPage() {
  const guest = await getCurrentGuest();
  if (guest) {
    redirect("/guest/schedule");
  }

  return <GuestLoginForm />;
}
