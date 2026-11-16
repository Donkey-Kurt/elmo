/**
 * /admin/workflows - Monitor prompt scheduling, job execution, and worker health
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Progress } from "@workspace/ui/components/progress";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import {
	Activity,
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Clock,
	Play,
	RefreshCw,
	Server,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { getJobLogsFn, getWorkflowDataFn, retryJobFn } from "@/server/admin";

interface SchedulerInfo {
	exists: boolean;
	nextRunAt: number | null;
	cadenceHours: number | null;
}

interface TargetRunStatus {
	lastRunAt: string | null;
	isOverdue: boolean;
	overdueByMs: number | null;
}

interface PromptScheduleStatus {
	promptId: string;
	promptValue: string;
	brandId: string;
	brandName: string;
	enabled: boolean;
	runFrequencyMs: number;
	/** Keyed by target (model + web search), which is what the plan runs. */
	lastRunsByTarget: Record<string, TargetRunStatus>;
	schedulerInfo: SchedulerInfo;
	recentFailures: number;
	jobStatus: "active" | "created" | "retry" | "none";
}

interface BrandScheduleSummary {
	brandId: string;
	brandSlug: string | null;
	brandName: string;
	organizationSlug: string;
	website: string;
	enabled: boolean;
	totalPrompts: number;
	enabledPrompts: number;
	runFrequencyMs: number;
	/**
	 * The union of targets across the brand's prompts. Premium targets are
	 * assigned per prompt, so no single row's targets are the whole column set.
	 */
	targetColumns: { key: string; label: string }[];
	overduePrompts: number;
	onSchedulePrompts: number;
	schedulerCoverage: { scheduled: number; total: number };
	prompts: PromptScheduleStatus[];
}

interface QueueStats {
	name: string;
	created: number;
	active: number;
	retry: number;
	completed: number;
	failed: number;
	totalPending: number;
}

interface RecentJob {
	id: string;
	name: string;
	data: { promptId?: string };
	status: "completed" | "failed";
	failedReason: string | null;
	attemptsMade: number;
	timestamp: number;
	processedOn: number | null;
	finishedOn: number | null;
}

interface WorkflowsData {
	summary: {
		totalBrands: number;
		totalPrompts: number;
		totalEnabled: number;
		totalOverdue: number;
		totalOnSchedule: number;
		percentOnSchedule: number;
	};
	queue: QueueStats;
	recentJobs: RecentJob[];
	brands: BrandScheduleSummary[];
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const weeks = Math.floor(days / 7);

	if (weeks > 0) {
		const remainingDays = days % 7;
		return remainingDays > 0 ? `${weeks}周 ${remainingDays}天` : `${weeks}周`;
	}
	if (days > 0) {
		const remainingHours = hours % 24;
		return remainingHours > 0 ? `${days}天 ${remainingHours}小时` : `${days}天`;
	}
	if (hours > 0) {
		const remainingMinutes = minutes % 60;
		return remainingMinutes > 0 ? `${hours}小时 ${remainingMinutes}分钟` : `${hours}小时`;
	}
	if (minutes > 0) return `${minutes}分钟`;
	return `${seconds}秒`;
}

function formatRelativeTime(dateStr: string | null): string {
	if (!dateStr) return "从未";
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	return `${formatDuration(diffMs)} 前`;
}

function formatFutureTime(timestamp: number | null): string {
	if (!timestamp) return "未知";
	const now = Date.now();
	const diffMs = timestamp - now;
	if (diffMs < 0) return "已逾期";
	return `${formatDuration(diffMs)} 后`;
}

function QueueStatsCard({ stats, title }: { stats: QueueStats; title: string }) {
	const hasIssues = stats.failed > 0;

	return (
		<Card className={hasIssues ? "border-amber-500/50" : ""}>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium flex items-center gap-2">
					<Server className="h-4 w-4" />
					{title}
				</CardTitle>
				<CardDescription>pg-boss 任务队列状态</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-3 gap-4 text-sm">
					<div title="等待 worker 领取的任务">
						<p className="text-muted-foreground">已创建</p>
						<p className="text-xl font-semibold text-blue-600">{stats.created}</p>
					</div>
					<div title="正在处理的任务">
						<p className="text-muted-foreground">进行中</p>
						<p className="text-xl font-semibold text-emerald-600">{stats.active}</p>
					</div>
					<div title="失败后等待重试的任务">
						<p className="text-muted-foreground">重试</p>
						<p className="text-xl font-semibold text-amber-600">{stats.retry}</p>
					</div>
					<div>
						<p className="text-muted-foreground">已完成</p>
						<p className="text-xl font-semibold">{stats.completed.toLocaleString()}</p>
					</div>
					<div>
						<p className="text-muted-foreground">失败</p>
						<p className={`text-xl font-semibold ${stats.failed > 0 ? "text-red-600" : ""}`}>{stats.failed}</p>
					</div>
					<div>
						<p className="text-muted-foreground">待处理合计</p>
						<p className="text-xl font-semibold text-violet-600">{stats.totalPending}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function SchedulerCell({ info }: { info: SchedulerInfo }) {
	if (!info.exists) {
		return <span className="text-muted-foreground text-xs">&mdash;</span>;
	}
	const nextText = info.nextRunAt ? formatFutureTime(info.nextRunAt) : "未知";
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs font-medium">下次：{nextText}</span>
		</div>
	);
}

/** Whether any target of an enabled prompt has missed its cadence. */
function isPromptStuck(prompt: PromptScheduleStatus): boolean {
	return prompt.enabled && Object.values(prompt.lastRunsByTarget).some((status) => status?.isOverdue);
}

function TargetStatus({ status }: { status?: TargetRunStatus }) {
	if (!status) {
		return <span className="text-muted-foreground">-</span>;
	}
	const lastRunText = status.lastRunAt ? formatRelativeTime(status.lastRunAt) : "从未";

	if (status.isOverdue) {
		return (
			<div className="flex flex-col gap-0.5">
				<div className="flex items-center gap-1">
					<AlertTriangle className="h-3 w-3 text-amber-500" />
					<span className="text-amber-600 text-xs">{lastRunText}</span>
				</div>
				{status.overdueByMs && <span className="text-red-500 text-xs">(+{formatDuration(status.overdueByMs)})</span>}
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1">
			<CheckCircle2 className="h-3 w-3 text-emerald-500" />
			<span className="text-emerald-600 text-xs">{lastRunText}</span>
		</div>
	);
}

function RetryButton({ promptId, onSuccess }: { promptId?: string; jobId?: string; onSuccess: () => void }) {
	const [isLoading, setIsLoading] = useState(false);
	const writeError = useWriteErrorMessage();
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<"queued" | "recreated" | false>(false);

	const handleRetry = async () => {
		setIsLoading(true);
		setError(null);
		setSuccess(false);

		try {
			await retryJobFn({ data: { promptId } });
			setSuccess("queued");
			setTimeout(() => onSuccess(), 1000);
		} catch (err) {
			setError(writeError(err, "重试失败"));
		} finally {
			setIsLoading(false);
		}
	};

	if (success) {
		return (
			<Button size="sm" variant="outline" disabled className="cursor-default">
				<CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
				{success === "recreated" ? "调度器已重置" : "已入队"}
			</Button>
		);
	}

	return (
		<div className="flex flex-col gap-1">
			<Button size="sm" variant="outline" onClick={handleRetry} disabled={isLoading} className="cursor-pointer text-xs">
				{isLoading ? <Spinner className="mr-1 size-3" /> : <Play className="h-3 w-3 mr-1" />}
				重试
			</Button>
			{error && <span className="text-xs text-red-500">{error}</span>}
		</div>
	);
}

/** Logs load lazily, only once the dialog has been opened. */
function useJobLogs(jobId: string, isOpen: boolean) {
	const [logs, setLogs] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isOpen || !jobId) return;
		setLoading(true);
		setError(null);
		getJobLogsFn({ data: { jobId } })
			.then((data) => setLogs(data.logs || []))
			.catch((err) => setError(err.message))
			.finally(() => setLoading(false));
	}, [isOpen, jobId]);

	return { logs, loading, error };
}

function JobLogsPanel({ logs, loading, error }: { logs: string[]; loading: boolean; error: string | null }) {
	if (loading) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Spinner />
				正在加载日志...
			</div>
		);
	}
	if (error) {
		return (
			<div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">加载日志出错：{error}</div>
		);
	}
	if (logs.length === 0) return <p className="text-sm text-muted-foreground italic">暂无日志</p>;

	return (
		<pre className="bg-muted rounded p-3 text-xs overflow-x-auto max-h-80 whitespace-pre-wrap">{logs.join("\n")}</pre>
	);
}

/** Closes the dialog a beat after a successful retry, so the confirmation is
 *  visible before the list refreshes underneath it. */
function RetryJobFooter({
	job,
	onClose,
	onRetrySuccess,
}: {
	job: RecentJob;
	onClose: () => void;
	onRetrySuccess?: () => void;
}) {
	const writeError = useWriteErrorMessage();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [succeeded, setSucceeded] = useState(false);

	const handleRetry = async () => {
		setIsLoading(true);
		setError(null);
		setSucceeded(false);

		try {
			await retryJobFn({ data: { jobId: job.id, promptId: job.data?.promptId } });
			setSucceeded(true);
			setTimeout(() => {
				onClose();
				onRetrySuccess?.();
			}, 1000);
		} catch (err) {
			setError(writeError(err, "无法重试此任务"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex items-center gap-3 pt-2 border-t">
			{succeeded ? (
				<div className="flex items-center gap-2 text-emerald-600">
					<CheckCircle2 className="h-4 w-4" />
					<span>任务已加入重试队列</span>
				</div>
			) : (
				<>
					<Button onClick={handleRetry} disabled={isLoading} className="cursor-pointer">
						{isLoading ? <Spinner className="mr-2" /> : <Play className="h-4 w-4 mr-2" />}
						重试此任务
					</Button>
					{error && <span className="text-sm text-red-600">{error}</span>}
				</>
			)}
		</div>
	);
}

function JobDetailsDialog({ job, onRetrySuccess }: { job: RecentJob; onRetrySuccess?: () => void }) {
	const isFailed = job.status === "failed";
	const [isOpen, setIsOpen] = useState(false);
	const { logs, loading: logsLoading, error: logsError } = useJobLogs(job.id, isOpen);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						className={`cursor-pointer ${isFailed ? "text-red-600 hover:text-red-700" : "text-muted-foreground hover:text-foreground"}`}
					/>
				}
			>
				查看日志
			</DialogTrigger>
			<DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-full max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{isFailed ? (
							<XCircle className="h-5 w-5 text-red-500" />
						) : (
							<CheckCircle2 className="h-5 w-5 text-emerald-500" />
						)}
						{isFailed ? "失败任务详情" : "已完成任务详情"}
					</DialogTitle>
					<DialogDescription>任务 ID：{job.id}</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<p className="text-muted-foreground">状态</p>
							<Badge className={isFailed ? "bg-red-500" : "bg-emerald-600"}>{job.status}</Badge>
						</div>
						<div>
							<p className="text-muted-foreground">提示词 ID</p>
							<p className="font-mono text-xs">{job.data?.promptId || "暂无"}</p>
						</div>
						<div>
							<p className="text-muted-foreground">完成时间</p>
							<p>{job.finishedOn ? new Date(job.finishedOn).toLocaleString() : "未知"}</p>
						</div>
					</div>
					{isFailed && job.failedReason && (
						<div>
							<p className="text-muted-foreground mb-1">错误信息</p>
							<div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">{job.failedReason}</div>
						</div>
					)}
					<div>
						<p className="text-muted-foreground mb-1">执行日志</p>
						<JobLogsPanel logs={logs} loading={logsLoading} error={logsError} />
					</div>
					{isFailed && <RetryJobFooter job={job} onClose={() => setIsOpen(false)} onRetrySuccess={onRetrySuccess} />}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function BrandRow({
	brand,
	isExpanded,
	onToggle,
	recentJobs,
	onRefresh,
}: {
	brand: BrandScheduleSummary;
	isExpanded: boolean;
	onToggle: () => void;
	recentJobs: RecentJob[];
	onRefresh: () => void;
}) {
	const hasOverdue = brand.overduePrompts > 0;
	const scheduleHealth =
		brand.enabledPrompts > 0 ? Math.round((brand.onSchedulePrompts / brand.enabledPrompts) * 100) : 100;

	return (
		<>
			<TableRow className={`cursor-pointer hover:bg-muted/50 ${hasOverdue ? "bg-amber-50/50" : ""}`} onClick={onToggle}>
				<TableCell>
					<div className="flex items-center gap-2">
						{isExpanded ? (
							<ChevronDown className="h-4 w-4 text-muted-foreground" />
						) : (
							<ChevronRight className="h-4 w-4 text-muted-foreground" />
						)}
						<div>
							<Link
								to="/app/org/$org/brand/$brand"
								params={{ org: brand.organizationSlug, brand: brand.brandSlug ?? brand.brandId }}
								className="font-medium text-primary hover:underline"
								onClick={(e) => e.stopPropagation()}
							>
								{brand.brandName}
							</Link>
							<p className="text-xs text-muted-foreground">{brand.website}</p>
						</div>
					</div>
				</TableCell>
				<TableCell className="text-center">
					<div className="text-sm">
						<span className="font-medium">{brand.enabledPrompts}</span>
						<span className="text-muted-foreground">/{brand.totalPrompts}</span>
					</div>
				</TableCell>
				<TableCell className="text-center">
					<span className="text-sm">{formatDuration(brand.runFrequencyMs)}</span>
				</TableCell>
				<TableCell className="text-center">
					<div className="flex items-center justify-center gap-2">
						<Progress value={scheduleHealth} className="w-20 h-2" />
						<span className={`text-sm font-medium ${scheduleHealth < 80 ? "text-amber-600" : "text-emerald-600"}`}>
							{scheduleHealth}%
						</span>
					</div>
				</TableCell>
				<TableCell className="text-center">
					{brand.overduePrompts > 0 ? (
						<Badge variant="destructive" className="bg-amber-500">
							{brand.overduePrompts} 个已逾期
						</Badge>
					) : (
						<Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
							全部按计划
						</Badge>
					)}
				</TableCell>
			</TableRow>
			{isExpanded && brand.prompts.length > 0 && (
				<TableRow>
					<TableCell colSpan={5} className="bg-muted/30 p-0">
						<div className="p-4">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[250px]">提示词</TableHead>
										<TableHead className="text-center">状态</TableHead>
										{brand.targetColumns.map((column) => (
											<TableHead key={column.key} className="text-center">
												{column.label}
											</TableHead>
										))}
										<TableHead className="text-center">生产调度器</TableHead>
										<TableHead className="text-center">最近任务</TableHead>
										<TableHead className="text-center">操作</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{[...brand.prompts]
										.sort((a, b) => {
											const getCategory = (p: typeof a) => {
												if (isPromptStuck(p)) return 0;
												if (p.enabled) return 1;
												return 2;
											};
											return getCategory(a) - getCategory(b);
										})
										.map((prompt) => {
											const isStuck = isPromptStuck(prompt);
											const promptJobs = recentJobs
												.filter((j) => j.data?.promptId === prompt.promptId)
												.sort((a, b) => b.timestamp - a.timestamp);
											const latestJob = promptJobs[0];
											const hasActiveJob = prompt.jobStatus !== "none";
											const showRetry = prompt.enabled && isStuck && prompt.schedulerInfo.exists && !hasActiveJob;
											const shouldDim = !prompt.enabled;

											return (
												<TableRow key={prompt.promptId} className={shouldDim ? "opacity-50" : ""}>
													<TableCell className="max-w-xs">
														<p className="truncate text-sm" title={prompt.promptValue}>
															{prompt.promptValue}
														</p>
													</TableCell>
													<TableCell className="text-center">
														{!prompt.enabled ? (
															<Badge variant="outline">已停用</Badge>
														) : (
															<div className="flex flex-col items-center gap-1">
																<Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
																	已启用
																</Badge>
																{prompt.jobStatus === "active" && (
																	<Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
																		进行中
																	</Badge>
																)}
																{prompt.jobStatus === "created" && (
																	<Badge variant="secondary" className="bg-blue-100 text-blue-700">
																		已入队
																	</Badge>
																)}
																{prompt.jobStatus === "retry" && (
																	<Badge variant="secondary" className="bg-amber-100 text-amber-700">
																		重试
																	</Badge>
																)}
															</div>
														)}
													</TableCell>
													{brand.targetColumns.map((column) => (
														<TableCell key={column.key} className="text-center">
															{/* A prompt need not run every target its brand does —
															    premium targets are assigned per prompt. */}
															<TargetStatus status={prompt.lastRunsByTarget[column.key]} />
														</TableCell>
													))}
													<TableCell className="text-center">
														<SchedulerCell info={prompt.schedulerInfo} />
													</TableCell>
													<TableCell className="text-center">
														{latestJob && <JobDetailsDialog job={latestJob} onRetrySuccess={onRefresh} />}
													</TableCell>
													<TableCell className="text-center">
														{showRetry && <RetryButton promptId={prompt.promptId} onSuccess={onRefresh} />}
														{prompt.jobStatus === "active" && (
															<span className="text-xs text-muted-foreground">处理中...</span>
														)}
														{prompt.jobStatus === "created" && (
															<span className="text-xs text-muted-foreground">排队中</span>
														)}
														{prompt.jobStatus === "retry" && (
															<span className="text-xs text-muted-foreground">即将重试</span>
														)}
													</TableCell>
												</TableRow>
											);
										})}
								</TableBody>
							</Table>
						</div>
					</TableCell>
				</TableRow>
			)}
		</>
	);
}

export const Route = createFileRoute("/_authed/admin/workflows")({
	staticData: { crumb: "工作流" },
	head: pageHead({ description: "监控提示词调度与任务执行情况。" }),
	component: WorkflowsPage,
});

/** How often the dashboard re-reads the queue while it is open. */
const REFRESH_INTERVAL_MS = 30_000;

function WorkflowsPage() {
	const [data, setData] = useState<WorkflowsData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
	const [isRefreshing, setIsRefreshing] = useState(false);

	const fetchData = useCallback(async (showRefreshing = false) => {
		if (showRefreshing) setIsRefreshing(true);

		try {
			const result = await getWorkflowDataFn();
			setData(result as any);
		} catch (err) {
			setError(err instanceof Error ? err.message : "发生错误");
		} finally {
			setLoading(false);
			setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
		const interval = setInterval(() => fetchData(), REFRESH_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [fetchData]);

	const toggleBrand = (brandId: string) => {
		setExpandedBrands((prev) => {
			const next = new Set(prev);
			if (next.has(brandId)) {
				next.delete(brandId);
			} else {
				next.add(brandId);
			}
			return next;
		});
	};

	if (loading) {
		return (
			<div className="space-y-8">
				<div className="space-y-2">
					<Skeleton className="h-8 w-64" />
					<Skeleton className="h-4 w-96" />
				</div>
				<div className="grid gap-4 md:grid-cols-4">
					{[0, 1, 2, 3].map((n) => (
						<Skeleton key={n} className="h-32" />
					))}
				</div>
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-48" />
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{[0, 1, 2, 3, 4].map((n) => (
								<Skeleton key={n} className="h-16 w-full" />
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-destructive">错误</CardTitle>
				</CardHeader>
				<CardContent>
					<p>{error}</p>
				</CardContent>
			</Card>
		);
	}

	if (!data) return null;

	const THIRTY_MIN_MS = 30 * 60 * 1000;
	const overdueBreakdown = data.brands.reduce(
		(acc, brand) => {
			for (const prompt of brand.prompts) {
				if (!isPromptStuck(prompt)) continue;
				acc.total++;
				const targets = Object.values(prompt.lastRunsByTarget);
				if (targets.some((t) => t?.isOverdue && t.overdueByMs && t.overdueByMs > THIRTY_MIN_MS)) acc.severe++;
			}
			return acc;
		},
		{ total: 0, severe: 0 },
	);

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">工作流</h1>
					<p className="text-muted-foreground">监控提示词调度、任务执行与 worker 健康状态</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={() => fetchData(true)} disabled={isRefreshing} className="cursor-pointer">
						<RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
						刷新
					</Button>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<Activity className="h-4 w-4" />
							调度健康度
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span
								className={`text-3xl font-bold ${data.summary.percentOnSchedule >= 80 ? "text-emerald-600" : "text-amber-600"}`}
							>
								{data.summary.percentOnSchedule}%
							</span>
							<span className="text-muted-foreground text-sm">按计划调度</span>
						</div>
						<Progress value={data.summary.percentOnSchedule} className="mt-2" />
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<CheckCircle2 className="h-4 w-4 text-emerald-500" />
							按计划
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span className="text-3xl font-bold text-emerald-600">{data.summary.totalOnSchedule}</span>
							<span className="text-muted-foreground text-sm">个提示词</span>
						</div>
						<p className="text-xs text-muted-foreground mt-1">共 {data.summary.totalEnabled} 个已启用</p>
					</CardContent>
				</Card>

				<Card
					className={
						overdueBreakdown.severe > 0 ? "border-red-500/50" : overdueBreakdown.total > 0 ? "border-amber-500/50" : ""
					}
				>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<AlertTriangle className={`h-4 w-4 ${overdueBreakdown.severe > 0 ? "text-red-500" : "text-amber-500"}`} />
							逾期超过 30 分钟
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span
								className={`text-3xl font-bold ${overdueBreakdown.severe > 0 ? "text-red-600" : "text-muted-foreground"}`}
							>
								{overdueBreakdown.severe}
							</span>
							<span className="text-muted-foreground text-sm">个提示词</span>
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							另有 {overdueBreakdown.total - overdueBreakdown.severe} 个近期过期
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2">
							<Clock className="h-4 w-4" />
							品牌合计
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex items-baseline gap-2">
							<span className="text-3xl font-bold">{data.summary.totalBrands}</span>
							<span className="text-muted-foreground text-sm">个品牌</span>
						</div>
						<p className="text-xs text-muted-foreground mt-1">共 {data.summary.totalPrompts} 个提示词</p>
					</CardContent>
				</Card>
			</div>

			<QueueStatsCard stats={data.queue} title="提示词队列" />

			<Card>
				<CardHeader>
					<CardTitle>品牌工作流状态</CardTitle>
					<CardDescription>点击品牌展开，查看各提示词状态</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>品牌</TableHead>
								<TableHead className="text-center">提示词</TableHead>
								<TableHead className="text-center">运行频率</TableHead>
								<TableHead className="text-center">健康度</TableHead>
								<TableHead className="text-center">状态</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{[...data.brands]
								.sort((a, b) => b.overduePrompts - a.overduePrompts)
								.map((brand) => (
									<BrandRow
										key={brand.brandId}
										brand={brand}
										isExpanded={expandedBrands.has(brand.brandId)}
										onToggle={() => toggleBrand(brand.brandId)}
										recentJobs={data.recentJobs}
										onRefresh={() => fetchData(true)}
									/>
								))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
