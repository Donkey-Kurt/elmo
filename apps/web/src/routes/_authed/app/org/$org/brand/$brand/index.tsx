import { IconActivity, IconArrowRight, IconClock, IconInfoCircle, IconList, IconRefresh } from "@tabler/icons-react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { labelForModelFilter } from "@workspace/config/model-filter";
import type { ClientConfig } from "@workspace/config/types";
import type { BrandTrackingState } from "@workspace/lib/brand-state";
import { buttonVariants } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { type ReactNode, useEffect } from "react";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { CompetitiveLandscape } from "@/components/overview/competitive-landscape";
import { HeadlineCard } from "@/components/overview/headline-card";
import { FilterSection, PageHeader } from "@/components/page-header";
import PromptWizard from "@/components/prompt-wizard";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useDashboardSummary } from "@/hooks/use-dashboard-summary";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useBrandParams } from "@/hooks/use-route-params";
import { brandRank, LANDSCAPE_METRICS } from "@/lib/landscape";
import { describeTargetSchedule, type TrackedTarget } from "@/lib/model-filter";
import { METRIC_META } from "@/lib/overview-metrics";
import { setPersonProperties } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import { BRAND_ROUTE_ID } from "@/lib/route-subject";
import type { DashboardSummaryResponse } from "@/server/dashboard";

function formatRelativeTime(dateString: string | null): string {
	if (!dateString) return "从未";

	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "刚刚";
	if (diffMins < 60) return `${diffMins} 分钟前`;
	if (diffHours < 24) return `${diffHours} 小时前`;
	if (diffDays < 7) return `${diffDays} 天前`;

	return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function formatRunFrequency(hours: number): string {
	const weeks = Math.floor(hours / (7 * 24));
	const days = Math.floor((hours % (7 * 24)) / 24);
	const remainingHours = hours % 24;

	const parts: string[] = [];
	if (weeks > 0) parts.push(`${weeks} 周`);
	if (days > 0) parts.push(`${days} 天`);
	if (remainingHours > 0) parts.push(`${remainingHours} 小时`);

	return parts.length > 0 ? `约 ${parts.join(" ")}` : "约 1 小时";
}

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/")({
	staticData: { crumb: "总览" },
	head: pageHead({ description: "AI 回答如何描述你的品牌与竞品。" }),
	component: DashboardPage,
});

function StatWithTooltip({
	icon: Icon,
	label,
	value,
	tooltip,
}: {
	icon: typeof IconList;
	label: string;
	value: string | number;
	tooltip: ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger render={<div className="flex items-center gap-2 cursor-help" />}>
				<Icon className="h-4 w-4 flex-shrink-0" />
				<span>
					<span className="font-semibold text-foreground">{value}</span> {label}
				</span>
				<IconInfoCircle className="h-3.5 w-3.5 opacity-50" />
			</TooltipTrigger>
			<TooltipContent className="max-w-xs text-sm">{tooltip}</TooltipContent>
		</Tooltip>
	);
}

const STAT_PLACEHOLDERS = [
	{ label: "条提示词追踪中", icon: IconList },
	{ label: "次采样", icon: IconActivity },
	{ label: "采样频率", icon: IconClock },
	{ label: "最后更新", icon: IconRefresh },
];

function TrackingStats({
	loading,
	totalPrompts,
	totalRuns,
	lastUpdatedAt,
	delayHours,
	trackedTargets,
}: {
	loading: boolean;
	totalPrompts: number;
	totalRuns: number;
	lastUpdatedAt: string | null;
	delayHours: number;
	trackedTargets: TrackedTarget[];
}) {
	if (loading) {
		return (
			<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
				{STAT_PLACEHOLDERS.map(({ label, icon: Icon }) => (
					<div key={label} className="flex items-center gap-2">
						<Icon className="h-4 w-4 flex-shrink-0" />
						<Skeleton className="h-4 w-28" />
					</div>
				))}
			</div>
		);
	}

	return (
		<div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
			<StatWithTooltip
				icon={IconList}
				label="条提示词追踪中"
				value={totalPrompts.toLocaleString()}
				tooltip={
					trackedTargets.length > 0 ? (
						<>
							<p>为 AI 可见度追踪的提示词，每条在以下平台评估：</p>
							<ul className="mt-1 space-y-0.5">
								{trackedTargets.map((target) => (
									<li key={target.value}>{labelForModelFilter(target.value)}</li>
								))}
							</ul>
						</>
					) : (
						"为 AI 可见度追踪的提示词。该品牌尚未配置任何平台。"
					)
				}
			/>
			<StatWithTooltip
				icon={IconActivity}
				label="次采样"
				value={totalRuns.toLocaleString()}
				tooltip="所选时间段内，把提示词提交给大模型评估的总次数。每条提示词都会在多个 AI 模型上重复评估多次。"
			/>
			<StatWithTooltip
				icon={IconClock}
				label="采样频率"
				value={formatRunFrequency(delayHours)}
				tooltip={
					trackedTargets.length > 0 ? (
						<>
							{/* One rate for the brand is a summary, not the truth: a
							    grounded call samples far less often than a scraped one,
							    and self-hosted repeats every sample. */}
							<p>各平台的采样频率：</p>
							<ul className="mt-1 space-y-0.5">
								{trackedTargets.map((target) => (
									<li key={target.value}>{describeTargetSchedule(target)}</li>
								))}
							</ul>
						</>
					) : (
						"该品牌尚未配置任何平台。"
					)
				}
			/>
			<StatWithTooltip
				icon={IconRefresh}
				label="最后更新"
				value={formatRelativeTime(lastUpdatedAt)}
				tooltip={
					lastUpdatedAt
						? `最近一次针对你品牌的评估执行于 ${new Date(lastUpdatedAt).toLocaleString("zh-CN")}`
						: "尚未执行任何评估。"
				}
			/>
		</div>
	);
}

/**
 * Shown until the first evaluation lands. What to do next depends on whether
 * any prompt is configured, and whether any of them are enabled.
 */
function AwaitingFirstEvaluation({ totalPrompts, hasPrompts }: { totalPrompts: number; hasPrompts: boolean }) {
	const params = useBrandParams();
	const hasEnabledPrompts = totalPrompts > 0;
	const message = hasEnabledPrompts
		? "已就绪，可以开始追踪 AI 可见度。我们正在执行首次针对 AI 模型的评估，通常需要几分钟。"
		: hasPrompts
			? "你已配置提示词，但目前没有启用任何一条。添加或启用提示词即可开始追踪 AI 可见度。"
			: "先配置提示词，才能开始追踪 AI 可见度。配置完成后，我们会自动把它们提交给 AI 模型评估。";

	return (
		<div className="flex flex-1 flex-col items-center justify-center p-8 max-w-xl mx-auto text-center">
			<div className="rounded-full bg-muted p-4 mb-6">
				<IconClock className="h-10 w-10 text-muted-foreground" />
			</div>
			<h2 className="text-2xl font-bold mb-3">{hasEnabledPrompts ? "等待首次采样" : "暂无数据"}</h2>
			<p className="text-muted-foreground mb-6 text-balance">{message}</p>
			<div className="flex flex-col gap-3 w-full">
				{hasEnabledPrompts && (
					<div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
						<div className="flex items-center gap-2">
							<IconList className="h-5 w-5 text-muted-foreground" />
							<span className="text-sm">已配置并启用的提示词</span>
						</div>
						<span className="font-semibold">{totalPrompts.toLocaleString()}</span>
					</div>
				)}
				<Link
					to="/app/org/$org/brand/$brand/settings/prompts"
					params={params}
					className={buttonVariants({ variant: "outline", className: "w-full" })}
				>
					{hasEnabledPrompts ? "查看提示词" : hasPrompts ? "编辑提示词" : "设置提示词"}{" "}
					<IconArrowRight className="h-4 w-4 ml-1" />
				</Link>
			</div>
			{hasEnabledPrompts && (
				<p className="text-xs text-muted-foreground mt-6">
					几分钟后刷新本页，即可看到你的 AI 可见度数据。
				</p>
			)}
		</div>
	);
}

function ResearchBrandData({ brandId, clientConfig }: { brandId: string; clientConfig?: ClientConfig }) {
	return (
		<div className="space-y-6 max-w-2xl p-4">
			<div className="space-y-2">
				<h2 className="text-2xl font-bold">分析品牌数据</h2>
				<p className="text-muted-foreground text-balance">
					我们会分析你的网站，找出最适合追踪的生成式 AI 提示词。这个过程可能需要几分钟。
				</p>
			</div>
			<PromptWizard
				onComplete={() => {
					const template = clientConfig?.branding.onboardingRedirectUrlTemplate;
					if (template) window.location.href = template.replace("{brandId}", brandId);
				}}
			/>
		</div>
	);
}

/** Mirrors the brand's active prompt count onto the PostHog person. */
function useReportedPromptCount(totalPrompts: number | undefined) {
	useEffect(() => {
		if (totalPrompts != null) setPersonProperties({ active_prompt_count: totalPrompts });
	}, [totalPrompts]);
}

function OverviewFigures({
	summary,
	loading,
	failed,
}: {
	summary?: DashboardSummaryResponse;
	loading: boolean;
	failed: boolean;
}) {
	if (failed) {
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">
				暂时无法加载总览。请刷新页面重试。
			</p>
		);
	}
	const landscape = summary?.landscape;
	return (
		<>
			<div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
				{LANDSCAPE_METRICS.map((metric) => (
					<HeadlineCard
						key={metric}
						metric={metric}
						card={summary?.cards[metric]}
						rank={landscape ? brandRank(landscape, metric) : 0}
						loading={loading}
					/>
				))}
			</div>
			<CompetitiveLandscape landscape={landscape} loading={loading} />
		</>
	);
}

// A brand that failed to load also lands on the wizard, the safe fallback.
function showsOnboarding(isLoading: boolean, brand: { trackingState: BrandTrackingState } | undefined): boolean {
	if (isLoading) return false;
	return !brand || brand.trackingState === "onboarding";
}

function DashboardPage() {
	const brandId = useBrandId();
	const { data: brand, isLoading: isLoadingBrand } = useBrand();
	const { model, lookback, tags } = useListFilters();
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;
	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const {
		data: summary,
		isLoading: isLoadingSummary,
		error: summaryError,
	} = useDashboardSummary(brand?.id, {
		lookback,
		model: modelParam,
		tags,
	});
	// A tag filter narrows the count, which would understate the brand's prompts.
	useReportedPromptCount(tags.length === 0 ? summary?.totalPrompts : undefined);
	const context = useRouteContext({ from: BRAND_ROUTE_ID }) as { clientConfig?: ClientConfig };
	const clientConfig = context.clientConfig;
	// The footer reports what this brand actually runs, resolved server-side.
	const trackedTargets = brand?.trackedTargets ?? [];
	const loading = isLoadingBrand || isLoadingSummary;

	if (showsOnboarding(isLoadingBrand, brand)) {
		return <ResearchBrandData brandId={brandId} clientConfig={clientConfig} />;
	}

	// No runs yet (and no filter narrowing them away): nothing to plot, so point at what to do next.
	if (!loading && summary?.totalRuns === 0 && !modelParam && tags.length === 0) {
		return (
			<AwaitingFirstEvaluation totalPrompts={summary.totalPrompts} hasPrompts={(brand?.prompts?.length ?? 0) > 0} />
		);
	}

	return (
		<div className="flex flex-1 flex-col">
			{/* Wide screens fit the page to the viewport below the 4rem site header, the inset's margins and
			    borders, and the page content's padding, so a long list of competitors scrolls inside the
			    landscape instead of the page. */}
			<div className="flex w-full max-w-[1600px] flex-col gap-4 xl:h-[max(40rem,calc(100svh-8rem-2px))]">
				<PageHeader
					title="总览"
					subtitle="AI 回答如何描述你的品牌与竞品。"
					infoContent={
						<p>
							每个数字统计所选模型与标签下、截至所选时间段结束时各提示词的最新回答；旁边的变化量表示从期初到期末的变动。
						</p>
					}
				>
					<FilterSection>
						<FilterBar
							availableTags={promptsSummary?.availableTags ?? []}
							trackedTargets={trackedTargets}
							showSearch={false}
							showModelSelector
						/>
					</FilterSection>
				</PageHeader>

				<OverviewFigures summary={summary} loading={loading} failed={!!summaryError && !summary} />

				<section className="shrink-0 pt-2">
					<TrackingStats
						loading={loading}
						totalPrompts={summary?.totalPrompts ?? 0}
						totalRuns={summary?.totalRuns ?? 0}
						lastUpdatedAt={summary?.lastUpdatedAt ?? null}
						delayHours={brand?.delayOverrideHours ?? clientConfig?.defaultDelayHours ?? 24}
						trackedTargets={trackedTargets}
					/>
				</section>
			</div>
		</div>
	);
}
