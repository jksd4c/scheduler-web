import Link from "next/link";
import { FeedbackClient } from "@/components/feedback-client";
import { PaginationLinks } from "@/components/pagination-links";
import { requirePageSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

export default async function AdminFeedbackPage({ searchParams }: { searchParams?: { page?: string } }) {
  const user = await requirePageSuperAdmin();
  if (!user) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">无权限访问</div>;
  }

  const page = Math.max(1, Number(searchParams?.page ?? 1) || 1);
  const [feedback, totalFeedback] = await Promise.all([
    prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        pageUrl: true,
        contact: true,
        status: true,
        createdAt: true,
        user: { select: { username: true, displayName: true } },
        hospital: { select: { name: true } },
        department: { select: { name: true } },
        unit: { select: { name: true } }
      }
    }),
    prisma.feedback.count()
  ]);

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm font-medium text-slate-600 hover:text-slate-950">
        返回最高管理员后台
      </Link>
      <FeedbackClient initialFeedback={feedback} admin />
      <PaginationLinks basePath="/admin/feedback" page={page} pageSize={PAGE_SIZE} total={totalFeedback} label="反馈" />
    </div>
  );
}
