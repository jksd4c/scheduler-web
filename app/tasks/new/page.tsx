import { NewTaskForm } from "@/components/new-task-form";
import { requirePageUser } from "@/lib/auth";

export default async function NewTaskPage() {
  await requirePageUser();
  return <NewTaskForm />;
}
