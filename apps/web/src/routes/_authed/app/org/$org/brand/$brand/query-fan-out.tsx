import { IconChevronDown, IconChevronRight, IconSearch } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo, useState } from "react";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { FanoutEngineStatusCard, fanoutByModel } from "@/components/fanout-engine-status";
import { InfoTip, QueryWordsSection, VariationLine } from "@/components/fanout-sections";
import { ALL_MODELS_VALUE, FilterBar } from "@/components/filter-bar";
import { HistoryButton } from "@/components/history-button";
import { FilterSection, PageHeader } from "@/components/page-header";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { useListFilters } from "@/hooks/use-list-filters";
import { usePromptsSummary } from "@/hooks/use-prompts-summary";
import { useQueryFanout } from "@/hooks/use-query-fanout";
import { type PromptFanoutStat, promptKeywords, type TopQueryStat } from "@/lib/fanout-analysis";
import { pageHead } from "@/lib/route-head";
import { getModelDisplayName } from "@/lib/utils";

/** The active tab lives in `?tab=` so each tab is directly linkable. */
const FANOUT_TABS = ["fanout", "top-queries", "words"] as const;
type FanoutTab = (typeof FANOUT_TABS)[number];

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/query-fan-out")({
	staticData: { crumb: "查询扩展" },
	validateSearch: (search: Record<string, unknown>): { tab?: FanoutTab } => ({
		tab: FANOUT_TABS.includes(search.tab as FanoutTab) ? (search.tab as FanoutTab) : undefined,
	}),
	head: pageHead({
		description: "查看 AI 引擎在回答你的提示词时执行的网页搜索，以及它们如何改写你的措辞。",
	}),
	component: QueryFanoutPage,
});

function QueryFanoutPage() {
	const brandId = useBrandId();
	const { model, lookback, tags } = useListFilters();
	const tab = Route.useSearch({ select: (s) => s.tab ?? "fanout" });
	const navigate = Route.useNavigate();
	const setTab = (next: FanoutTab) =>
		navigate({
			search: (prev) => ({ ...prev, tab: next === "fanout" ? undefined : next }),
			replace: true,
			resetScroll: false,
		});

	const { data: brand } = useBrand(brandId);
	const trackedTargets = brand?.trackedTargets ?? [];
	const modelParam = model === ALL_MODELS_VALUE ? undefined : model;

	const { data: promptsSummary } = usePromptsSummary(brandId, { lookback, model: modelParam });
	const availableTags = promptsSummary?.availableTags ?? [];

	const { data, isLoading, error } = useQueryFanout(brandId, {
		lookback,
		tags,
		model: modelParam,
	});

	const infoContent = (
		<p>
			具备网页搜索能力的 AI 引擎在回答提示词时，可能会在生成回答前先执行若干次网页搜索。这些底层的网页搜索（即网页查询词）只在部分引擎上可获取。
		</p>
	);

	let content: React.ReactNode;
	if (isLoading && !data) {
		content = <LoadingState />;
	} else if (error && !data) {
		content = <EmptyState message="暂时无法加载查询扩展数据，请重新加载页面后再试。" />;
	} else if (!data || data.totalRuns === 0) {
		// totalRuns counts only web-search-enabled runs — a brand whose models all
		// run without web search lands here even with plenty of runs.
		content = (
			<TooltipProvider delay={150}>
				<div className="space-y-6">
					<FanoutEngineStatusCard targets={trackedTargets} model={modelParam} />
					<EmptyState message="所选筛选条件下没有启用网页搜索的采样。等已开启网页搜索的引擎采样过你的提示词后，才会出现查询扩展数据。" />
				</div>
			</TooltipProvider>
		);
	} else if (data.totalQueries === 0) {
		// Runs happened but none exposed fan-out — still show the KPIs (run counts)
		// above the explanation rather than hiding everything.
		content = (
			<TooltipProvider delay={150}>
				<div className="space-y-6">
					<StatRow data={data} />
					<FanoutEngineStatusCard targets={trackedTargets} model={modelParam} />
					<EmptyState message="所选时间段内没有网页查询词——你追踪的引擎没有为这些提示词和筛选条件返回任何搜索记录。" />
				</div>
			</TooltipProvider>
		);
	} else {
		content = (
			<TooltipProvider delay={150}>
				<div className="space-y-6">
					<StatRow data={data} />
					{fanoutByModel(trackedTargets).some((e) => e.support.status !== "supported") && (
						<FanoutEngineStatusCard targets={trackedTargets} model={modelParam} />
					)}
					<Tabs value={tab} onValueChange={(v) => setTab(v as FanoutTab)} className="gap-4">
						<TabsList className="max-w-full">
							<TabsTrigger value="fanout" className="max-[380px]:text-xs">
								提示词扩展
							</TabsTrigger>
							<TabsTrigger value="top-queries" className="max-[380px]:text-xs">
								热门查询词
							</TabsTrigger>
							<TabsTrigger value="words" className="max-[380px]:text-xs">
								查询词用词
							</TabsTrigger>
						</TabsList>
						<TabsContent value="fanout">
							<Prompts prompts={data.byPrompt} />
						</TabsContent>
						<TabsContent value="top-queries">
							<TopQueries data={data} />
						</TabsContent>
						<TabsContent value="words">
							<QueryWordsSection terms={data.terms} wordChanges={data.wordChanges} />
						</TabsContent>
					</Tabs>
				</div>
			</TooltipProvider>
		);
	}

	return (
		<PageHeader
			title="查询扩展"
			subtitle="AI 引擎回答你的提示词时执行的网页搜索。"
			infoContent={infoContent}
		>
			<FilterSection>
				<FilterBar availableTags={availableTags} trackedTargets={trackedTargets} showSearch={false} showModelSelector />
			</FilterSection>
			{content}
		</PageHeader>
	);
}

type FanoutData = NonNullable<ReturnType<typeof useQueryFanout>["data"]>;

function StatCard({ label, value, tip }: { label: string; value: React.ReactNode; tip: React.ReactNode }) {
	return (
		<Card className="py-4">
			<CardContent className="max-sm:px-4">
				<div className="text-muted-foreground flex items-center gap-1 text-xs sm:text-sm">
					{label}
					<InfoTip>{tip}</InfoTip>
				</div>
				<div className="mt-1.5 text-2xl font-bold tabular-nums sm:text-3xl">{value}</div>
			</CardContent>
		</Card>
	);
}

function RunsTooltip({ breakdown }: { breakdown: FanoutData["byModel"] }) {
	return (
		<>
			<p>
				产生了至少一次网页搜索的提示词采样。部分引擎不会公开网页搜索记录，所以该数字可能低于预期。
			</p>
			{breakdown.length > 0 && (
				<div className="border-border/60 mt-2 space-y-0.5 border-t pt-2">
					{breakdown.map((m) => (
						<div key={m.model} className="flex items-center justify-between gap-3">
							<span>{getModelDisplayName(m.model)}</span>
							<span className="tabular-nums">{m.fanoutRuns.toLocaleString()}</span>
						</div>
					))}
				</div>
			)}
		</>
	);
}

function UnknownRunsTooltip({ byModel }: { byModel: FanoutData["byModel"] }) {
	const rows = byModel
		.map((m) => ({ model: m.model, unknown: m.runs - m.fanoutRuns }))
		.filter((m) => m.unknown > 0)
		.sort((a, b) => b.unknown - a.unknown);
	return (
		<>
			<p>
				启用了搜索、但查询词未知的采样。引擎可能完全没有执行搜索，也可能只用提示词本身作搜索，或执行了搜索但没有公开查询词。
			</p>
			{rows.length > 0 && (
				<div className="border-border/60 mt-2 space-y-0.5 border-t pt-2">
					{rows.map((m) => (
						<div key={m.model} className="flex items-center justify-between gap-3">
							<span>{getModelDisplayName(m.model)}</span>
							<span className="tabular-nums">{m.unknown.toLocaleString()}</span>
						</div>
					))}
				</div>
			)}
		</>
	);
}

function StatRow({ data }: { data: FanoutData }) {
	// Only models that actually produced fan-out — the tooltip describes runs that
	// "produced at least one web search", so engines that ran but exposed none (e.g.
	// OpenRouter) are left off rather than listed as 0.
	const breakdown = data.byModel.filter((m) => m.fanoutRuns > 0).sort((a, b) => b.fanoutRuns - a.fanoutRuns);
	return (
		<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
			<StatCard
				label="启用搜索的提示词采样"
				value={data.totalRuns.toLocaleString()}
				tip="你的提示词在已配置网页搜索的引擎上被采样的次数。单次采样中，引擎仍可能选择不执行搜索。"
			/>
			<StatCard
				label="查询词未知的提示词采样"
				value={(data.totalRuns - data.fanoutRuns).toLocaleString()}
				tip={<UnknownRunsTooltip byModel={data.byModel} />}
			/>
			<StatCard
				label="查询词已知的提示词采样"
				value={data.fanoutRuns.toLocaleString()}
				tip={<RunsTooltip breakdown={breakdown} />}
			/>
			<StatCard
				label="平均扩展查询数"
				value={data.avgQueriesPerFanoutRun.toLocaleString()}
				tip="至少有一次网页查询词的采样中，平均每次的查询词数量。"
			/>
		</div>
	);
}

function LoadingState() {
	return (
		<div className="space-y-6">
			<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
				{["a", "b", "c", "d"].map((k) => (
					<Card key={k} className="py-4">
						<CardContent className="space-y-2">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-8 w-16" />
						</CardContent>
					</Card>
				))}
			</div>
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-48" />
				</CardHeader>
				<CardContent className="space-y-4">
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-1/2" />
				</CardContent>
			</Card>
		</div>
	);
}

function EmptyState({ message }: { message: string }) {
	return (
		<Card>
			<CardContent className="py-8">
				<div className="text-muted-foreground text-center">{message}</div>
			</CardContent>
		</Card>
	);
}

type SortKey = "queries" | "avg";

function SortHead<K extends string>({
	k,
	label,
	sort,
	setSort,
}: {
	k: K;
	label: string;
	sort: K;
	setSort: (k: K) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => setSort(k)}
			className={cn(
				"hover:text-foreground cursor-pointer uppercase tracking-wide",
				sort === k ? "text-foreground" : "",
			)}
		>
			{label}
		</button>
	);
}

// Phones drop the per-run average so the prompt itself stays readable.
const GRID = "grid grid-cols-[1.25rem_1fr_3.5rem] items-center gap-2 sm:grid-cols-[1.25rem_1fr_4.5rem_7rem] sm:gap-3";

function Prompts({ prompts }: { prompts: PromptFanoutStat[] }) {
	const [expanded, setExpanded] = useState<Set<string>>(
		() => new Set(prompts.length === 1 ? [prompts[0].promptId] : []),
	);
	const [sort, setSort] = useState<SortKey>("queries");
	const [search, setSearch] = useState("");

	const rows = useMemo(() => {
		const s = search.trim().toLowerCase();
		const list = s ? prompts.filter((p) => p.promptValue.toLowerCase().includes(s)) : prompts;
		return [...list].sort((a, b) =>
			sort === "avg"
				? b.avgQueriesPerFanoutRun - a.avgQueriesPerFanoutRun || b.totalQueries - a.totalQueries
				: b.totalQueries - a.totalQueries,
		);
	}, [prompts, search, sort]);

	const toggle = (id: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<Card className="gap-4">
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
					<div>
						<CardTitle className="flex items-center gap-1.5 text-base">
							提示词
							<InfoTip>
								每条提示词的扩展情况：共生成多少次搜索（查询词），以及在有搜索的采样中平均每次多少次（每次采样平均）。展开某条提示词可查看这些搜索，你的提示词中的关键词会加粗显示。
							</InfoTip>
						</CardTitle>
						<CardDescription>每条提示词触发的网页搜索。</CardDescription>
					</div>
					<div className="relative w-full shrink-0 sm:w-64">
						<IconSearch className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="搜索提示词..."
							className="h-8 pl-8 text-sm"
						/>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<div className={cn(GRID, "text-muted-foreground/80 border-b py-2 text-[11px] font-medium")}>
					<span />
					<span className="uppercase tracking-wide">提示词</span>
					<span className="text-right">
						<SortHead k="queries" label="查询词" sort={sort} setSort={setSort} />
					</span>
					<span className="text-right max-sm:hidden">
						<SortHead k="avg" label="每次采样平均" sort={sort} setSort={setSort} />
					</span>
				</div>
				<div className="divide-border divide-y">
					{rows.map((p) => {
						const isOpen = expanded.has(p.promptId);
						const keywords = isOpen ? promptKeywords(p.promptValue) : null;
						return (
							<div key={p.promptId} className="py-1">
								<button
									type="button"
									onClick={() => toggle(p.promptId)}
									className={cn(GRID, "hover:bg-muted/50 w-full cursor-pointer rounded-sm py-2 text-left")}
									aria-expanded={isOpen}
								>
									<span className="text-muted-foreground">
										{isOpen ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
									</span>
									<span className="min-w-0">
										<span className="line-clamp-2 text-sm font-medium sm:block sm:truncate" title={p.promptValue}>
											{p.promptValue || "（未命名提示词）"}
										</span>
										<span className="text-muted-foreground text-xs">{p.uniqueQueries.toLocaleString()} 种变体</span>
									</span>
									<span className="text-right text-sm tabular-nums">{p.totalQueries.toLocaleString()}</span>
									<span className="text-right text-sm tabular-nums max-sm:hidden">
										{p.avgQueriesPerFanoutRun.toLocaleString()}
									</span>
								</button>
								{isOpen && keywords && (
									<div className="border-border mb-3 ml-8 mr-2 space-y-2 border-l pl-4">
										{p.variations.map((v) => (
											<VariationLine key={v.query} variation={v} keywords={keywords} />
										))}
										{p.uniqueQueries > p.variations.length && (
											<div className="text-muted-foreground text-xs">
												仅显示前 {p.variations.length} 种变体，共 {p.uniqueQueries.toLocaleString()} 种
											</div>
										)}
										<div className="pt-1">
											<HistoryButton promptId={p.promptId} tab="web-queries" />
										</div>
									</div>
								)}
							</div>
						);
					})}
					{rows.length === 0 && (
						<div className="text-muted-foreground py-6 text-center text-sm">没有符合搜索条件的提示词。</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

type TopSort = "prompts" | "runs";

const TOP_GRID = "grid grid-cols-[1.25rem_1fr_5rem_5.5rem] items-center gap-3";

function TopQueries({ data }: { data: FanoutData }) {
	const [sort, setSort] = useState<TopSort>("prompts");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	const rows: TopQueryStat[] = sort === "prompts" ? data.topByPrompts : data.topByRuns;

	const toggle = (query: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(query)) next.delete(query);
			else next.add(query);
			return next;
		});

	return (
		<Card className="gap-4">
			<CardHeader>
				<CardTitle className="flex items-center gap-1.5 text-base">
					热门查询词
					<InfoTip>
						覆盖范围最广的搜索：可按触发它的去重提示词数量排序，也可按发起它的提示词采样次数排序。展开某条查询词可查看背后的提示词。
					</InfoTip>
				</CardTitle>
				<CardDescription>在你的多条提示词中反复出现的搜索。</CardDescription>
			</CardHeader>
			<CardContent>
				<div className={cn(TOP_GRID, "text-muted-foreground/80 border-b py-2 text-[11px] font-medium")}>
					<span />
					<span className="uppercase tracking-wide">查询词</span>
					<span className="text-right">
						<SortHead k="prompts" label="提示词" sort={sort} setSort={setSort} />
					</span>
					<span className="text-right">
						<SortHead k="runs" label="提示词采样" sort={sort} setSort={setSort} />
					</span>
				</div>
				<div className="divide-border divide-y">
					{rows.map((q) => {
						const isOpen = expanded.has(q.query);
						return (
							<div key={q.query} className="py-1">
								<button
									type="button"
									onClick={() => toggle(q.query)}
									className={cn(TOP_GRID, "hover:bg-muted/50 w-full cursor-pointer rounded-sm py-2 text-left")}
									aria-expanded={isOpen}
								>
									<span className="text-muted-foreground">
										{isOpen ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
									</span>
									<span className="min-w-0 truncate text-sm" title={q.query}>
										{q.query}
									</span>
									<span className="text-right text-sm tabular-nums">{q.prompts.toLocaleString()}</span>
									<span className="text-right text-sm tabular-nums">{q.runs.toLocaleString()}</span>
								</button>
								{isOpen && (
									<div className="border-border mb-3 ml-8 mr-2 space-y-1.5 border-l pl-4">
										{q.promptRefs.map((p) => (
											<div key={p.promptId} className="flex items-baseline justify-between gap-4">
												<BrandPromptLink
													promptId={p.promptId}
													search={{ tab: "web-queries" }}
													className="min-w-0 truncate text-sm hover:underline"
												>
													{p.promptValue || "（未命名提示词）"}
												</BrandPromptLink>
												<span
													className="text-muted-foreground shrink-0 text-sm tabular-nums"
													title="这条提示词中发起该搜索的采样次数"
												>
													{p.runs.toLocaleString()}×
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						);
					})}
					{rows.length === 0 && (
						<div className="text-muted-foreground py-6 text-center text-sm">所选时间段内没有查询词。</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
