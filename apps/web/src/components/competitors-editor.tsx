/**
 * Shared competitor list editor — used by both the settings/competitors page
 * (long-lived edits) and the prompt wizard's Review step (one-shot setup).
 *
 * Controlled component: caller owns the `competitors` array + the change
 * callbacks. State helpers like expand/collapse and the "X/MAX competitors
 * configured" footer live here so both surfaces look identical.
 */

import { IconInfoCircle } from "@tabler/icons-react";
import { cleanAndValidateDomain } from "@workspace/lib/citations/domain-categories";
import { MAX_COMPETITORS } from "@workspace/lib/constants";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { SiteIcon } from "@/components/site-icon";

export interface CompetitorEntry {
	_key: string;
	name: string;
	domains: string[];
	aliases: string[];
	expanded: boolean;
}

interface CompetitorsEditorProps {
	competitors: CompetitorEntry[];
	onChange: (next: CompetitorEntry[]) => void;
	disabled?: boolean;
}

export function newCompetitorEntry(partial?: Partial<CompetitorEntry>): CompetitorEntry {
	return {
		_key: uuidv4(),
		name: partial?.name ?? "",
		domains: partial?.domains ?? [],
		aliases: partial?.aliases ?? [],
		expanded: partial?.expanded ?? true,
	};
}

export function CompetitorsEditor({ competitors, onChange, disabled }: CompetitorsEditorProps) {
	const validateDomain = useCallback((val: string): true | string => {
		const cleaned = cleanAndValidateDomain(val);
		if (!cleaned) return `"${val}" 不是有效的域名`;
		return true;
	}, []);

	const update = (key: string, patch: Partial<CompetitorEntry>) => {
		onChange(competitors.map((c) => (c._key === key ? { ...c, ...patch } : c)));
	};
	const remove = (index: number) => onChange(competitors.filter((_, i) => i !== index));
	const add = () => {
		if (competitors.length >= MAX_COMPETITORS) return;
		onChange([...competitors, newCompetitorEntry()]);
	};

	const validCount = competitors.filter((c) => c.name.trim() && c.domains.some((d) => d.trim())).length;

	return (
		<div className="space-y-4">
			{competitors.map((competitor, index) => (
				<div key={competitor._key} className="border rounded-lg overflow-hidden">
					<div className="flex items-center gap-3 p-3">
						<SiteIcon domain={competitor.domains.find(Boolean)} size="lg" />
						<div className="flex-1 min-w-0">
							{competitor.name ? (
								<span className="text-sm font-medium">{competitor.name}</span>
							) : (
								<span className="text-sm text-muted-foreground italic">未命名竞品</span>
							)}
							{competitor.domains.some(Boolean) && (
								<span className="text-xs text-muted-foreground ml-2">{competitor.domains.filter(Boolean)[0]}</span>
							)}
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => update(competitor._key, { expanded: !competitor.expanded })}
							className="p-1.5 h-auto cursor-pointer shrink-0"
							disabled={disabled}
						>
							<Pencil className="h-3.5 w-3.5 text-muted-foreground" />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => remove(index)}
							className="p-1.5 h-auto cursor-pointer shrink-0 text-muted-foreground hover:text-destructive"
							disabled={disabled}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
					</div>

					{competitor.expanded && (
						<div className="px-3 pb-3 pt-0 space-y-3 border-t bg-muted/30">
							<div className="space-y-1.5 pt-3">
								<Label className="text-xs font-medium flex items-center gap-1.5">
									名称
									<Tooltip>
										<TooltipTrigger
											render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />}
										/>
										<TooltipContent className="max-w-xs text-xs font-normal">
											用于在 AI 回答中识别该竞品的主要名称。提及检测仅适用于<strong>未来</strong>的提示词运行。
										</TooltipContent>
									</Tooltip>
								</Label>
								<Input
									type="text"
									value={competitor.name}
									onChange={(e) => update(competitor._key, { name: e.target.value })}
									placeholder="竞品名称"
									className="bg-background"
									disabled={disabled}
								/>
							</div>

							<div className="space-y-1.5">
								<Label className="text-xs font-medium flex items-center gap-1.5">
									域名
									<Tooltip>
										<TooltipTrigger
											render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />}
										/>
										<TooltipContent className="max-w-xs text-xs font-normal">
											该竞品拥有的所有域名。引用分类会追溯更新 —— 来自这些域名的现有引用将立即被归类为 &quot;竞品&quot;。
										</TooltipContent>
									</Tooltip>
								</Label>
								<TagsInput
									value={competitor.domains.filter(Boolean)}
									onValueChange={(values) => update(competitor._key, { domains: values })}
									placeholder="添加域名..."
									maxItems={10}
									normalizeValue={(raw) => cleanAndValidateDomain(raw) ?? raw.trim()}
									pasteSplitter={/[\n,\t]+/}
									onValidate={validateDomain}
								/>
							</div>

							<div className="space-y-1.5">
								<Label className="text-xs font-medium flex items-center gap-1.5">
									别名
									<Tooltip>
										<TooltipTrigger
											render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />}
										/>
										<TooltipContent className="max-w-xs text-xs font-normal">
											该竞品的其他名称（子品牌、产品名称、缩写）。仅用于<strong>未来</strong>提示词运行的提及检测 —— 不会追溯生效。
										</TooltipContent>
									</Tooltip>
								</Label>
								<TagsInput
									value={competitor.aliases}
									onValueChange={(values) => update(competitor._key, { aliases: values })}
									placeholder="添加别名..."
									maxItems={10}
								/>
							</div>
						</div>
					)}
				</div>
			))}

			{competitors.length < MAX_COMPETITORS && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={add}
					className="flex items-center gap-2 cursor-pointer"
					disabled={disabled}
				>
					<Plus className="h-4 w-4" /> 添加竞品
				</Button>
			)}

			{competitors.length >= MAX_COMPETITORS && (
				<p className="text-xs text-muted-foreground">
					最多允许 {MAX_COMPETITORS} 个竞品。请移除一个以添加新竞品。
				</p>
			)}

			<p className="text-xs text-muted-foreground">
				<strong>
					{validCount}/{MAX_COMPETITORS}
				</strong>{" "}
				个竞品已配置
			</p>
		</div>
	);
}
