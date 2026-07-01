import { redirect } from "next/navigation";
import { getCurrentGuest, getCurrentUser, getUserHomePath } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(getUserHomePath(user));
  }

  const guest = await getCurrentGuest();
  if (guest) {
    redirect("/guest/schedule");
  }

  redirect("/login");
}
