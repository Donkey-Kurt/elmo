import { IconInfoCircle } from "@tabler/icons-react";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";

function StatCard({
	title,
	tooltip,
	value,
	className,
}: {
	title: string;
	tooltip: React.ReactNode;
	value: React.ReactNode;
	className?: string;
}) {
	return (
		<Card className={cn("flex flex-col", className)}>
			<CardHeader className="gap-0">
				<CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
					{title}
					<Tooltip>
						<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 cursor-help" />} />
						<TooltipContent className="max-w-xs text-sm font-normal">{tooltip}</TooltipContent>
					</Tooltip>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex-1 flex items-center">
				<div className="text-2xl sm:text-3xl lg:text-4xl font-bold">{value}</div>
			</CardContent>
		</Card>
	);
}

export function CitationStatsCards({
	brandShare,
	uniqueDomains,
	totalCitations,
}: {
	brandShare: number;
	uniqueDomains: number;
	totalCitations: number;
}) {
	return (
		<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
			<StatCard
				title="品牌引用来源份额"
				className="col-span-2 sm:col-span-1"
				tooltip="全部引用来源中指向品牌域名的百分比。份额越高，说明 AI 模型越有可能引用你的内容。"
				value={`${brandShare}%`}
			/>
			<StatCard
				title="独立域名"
				tooltip="本周期内全部提示词评估中被引用的不同域名数量。"
				value={uniqueDomains.toLocaleString()}
			/>
			{/* Kept deliberately simple: the user doesn't need the Google AI Mode
			    search/shopping nuance. Those surfaces aren't citations in the
			    traditional sense (they point back into Google's own product/search
			    results, not an external domain w.r.t. the model), so they're
			    excluded from this count and broken out in the Google Shopping card. */}
			<StatCard
				title="引用来源合计"
				tooltip="AI 模型在提示词评估中引用的外部网站总数。"
				value={totalCitations.toLocaleString()}
			/>
		</div>
	);
}
