/**
 * The page renders a structured opportunities report. We assemble a deterministic
 * digest of the brand's tracked citation data (per-query standing vs the leading
 * competitor over 7d + 30d, citation difficulty, where answers are sourced, and
 * per-platform visibility) and make a single structured LLM completion (no web
 * search) to turn it into categorized opportunities. The report is cached
 * server-side and regenerated only when stale — see server/opportunities.ts.
 */

import { IconClock } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { OpportunitiesReport } from "@/components/opportunities-report";
import { PageHeader } from "@/components/page-header";
import { useBrandId } from "@/hooks/use-brand-id";
import { useOpportunities } from "@/hooks/use-opportunities";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/opportunities")({
	staticData: { crumb: "优化机会" },
	head: pageHead({ description: "由 AI 生成、帮你获得更多 AI 引用的优化机会。" }),
	component: OpportunitiesPage,
});

function OpportunitiesPage() {
	const brandId = useBrandId();
	const { data, isLoading, error } = useOpportunities(brandId);

	const infoContent = "基于你的可见度与引用指标生成的建议，每周刷新一次。";

	let content: React.ReactNode;
	if (isLoading) {
		content = <LoadingState />;
	} else if (error) {
		content = <EmptyCard>暂时无法生成建议，请重新加载页面后再试。</EmptyCard>;
	} else if (!data || data.reason === "insufficient-data" || !data.report) {
		content = (
			<EmptyCard>
				我们还需要更多追踪数据，才能给出优化机会——等你的提示词运行几天后再来看看。
			</EmptyCard>
		);
	} else {
		content = <OpportunitiesReport report={data.report} />;
	}

	return (
		<PageHeader
			title="优化机会"
			subtitle="该创作什么内容、向谁推荐、把内容投放到哪些渠道，才能获得更多 AI 引用——依据你追踪的回答数据生成。"
			infoContent={infoContent}
		>
			<div className="space-y-6">
				{data?.report && data.lastEvaluatedAt && <LastEvaluatedAt date={data.lastEvaluatedAt} />}
				{content}
			</div>
		</PageHeader>
	);
}

function LastEvaluatedAt({ date }: { date: string }) {
	return (
		<p className="flex items-center gap-1.5 text-sm text-muted-foreground">
			<IconClock className="size-4" aria-hidden />
			上次评估{" "}
			<time dateTime={date}>
				{new Date(date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
			</time>
		</p>
	);
}

function EmptyCard({ children }: { children: React.ReactNode }) {
	return (
		<div className="rounded-xl border border-border">
			<p className="px-6 py-10 text-center text-sm text-muted-foreground">{children}</p>
		</div>
	);
}

function LoadingState() {
	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Spinner />
				正在分析你的引用格局，并起草优化机会…
			</div>
			<div className="space-y-2">
				<Skeleton className="h-6 w-2/3" />
				<Skeleton className="h-4 w-full max-w-[70ch]" />
				<Skeleton className="h-4 w-1/2" />
			</div>
			<div className="space-y-3">
				{[0, 1, 2].map((i) => (
					<Skeleton key={i} className="h-28 w-full rounded-xl" />
				))}
			</div>
		</div>
	);
}
