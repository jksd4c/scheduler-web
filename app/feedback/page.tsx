import { FeedbackClient } from "@/components/feedback-client";
import { requirePageUser } from "@/lib/auth";
import { PRODUCT_TAGLINE, PRODUCT_VERSION_LABEL } from "@/lib/product";
import { prisma } from "@/lib/prisma";

export default async function FeedbackPage() {
  const user = await requirePageUser();
  const feedback = await prisma.feedback.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { username: true, displayName: true } },
      hospital: true,
      department: true,
      unit: true
    }
  });

  return (
    <div className="space-y-5">
      <section>
        <p className="text-sm font-medium text-hospital-green">{PRODUCT_VERSION_LABEL}</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">反馈</h2>
        <p className="mt-1 text-sm text-slate-600">{PRODUCT_TAGLINE}</p>
      </section>
      <FeedbackClient initialFeedback={feedback} />
    </div>
  );
}
