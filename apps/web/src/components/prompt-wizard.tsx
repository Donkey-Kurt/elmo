/**
 * Single-step onboarding wizard.
 *
 * One LLM call returns brand info, competitors, and prompts for review before
 * saving.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { cleanAndValidateDomain, validateAdditionalDomain } from "@workspace/lib/citations/domain-categories";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { AlertCircle, Play, Rocket } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { type CompetitorEntry, CompetitorsEditor, newCompetitorEntry } from "@/components/competitors-editor";
import { type EditablePrompt, newPromptEntry, PromptsListEditor } from "@/components/prompts-list-editor";
import { WriteErrorMessage } from "@/components/write-error-message";
import { brandKeys, useBrand } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { usePolledBrandJob } from "@/hooks/use-polled-brand-job";
import { promptsSummaryKeys } from "@/hooks/use-prompts-summary";
import { trackEvent } from "@/lib/posthog";
import { useWriteErrorMessage } from "@/lib/write-errors";
import {
	cancelAnalyzeBrandFn,
	getAnalyzeBrandStatusFn,
	startAnalyzeBrandFn,
	updateOnboardedBrandFn,
} from "@/server/onboarding";

interface PromptWizardProps {
	onComplete: () => void;
}

interface WizardData {
	brandName: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	competitors: CompetitorEntry[];
	prompts: EditablePrompt[];
}

const DOMAIN_PASTE_SPLITTER = /[\n,\t]+/;
const normalizeDomain = (raw: string) => cleanAndValidateDomain(raw) ?? raw.trim();

const EditableTagsInput = memo(
	({
		items,
		onValueChange,
		placeholder = "添加项…",
		maxItems = 10,
		normalizeValue,
		pasteSplitter,
		onValidate,
	}: {
		items: string[];
		onValueChange: (value: string[]) => void;
		placeholder?: string;
		maxItems?: number;
		normalizeValue?: (raw: string) => string;
		pasteSplitter?: RegExp;
		onValidate?: (value: string, current: string[]) => true | string;
	}) => (
		<div className="space-y-2">
			<TagsInput
				value={items}
				onValueChange={onValueChange}
				placeholder={placeholder}
				searchPlaceholder={placeholder}
				maxItems={maxItems}
				normalizeValue={normalizeValue}
				pasteSplitter={pasteSplitter}
				onValidate={onValidate}
			/>
			<p className="text-xs text-muted-foreground">
				<strong>
					{items.length}/{maxItems}
				</strong>{" "}
				{items.length >= maxItems ? "项已达上限，移除一项后可再添加。" : "项已输入。"}
			</p>
		</div>
	),
);
EditableTagsInput.displayName = "EditableTagsInput";

export default function PromptWizard({ onComplete }: PromptWizardProps) {
	const { data: brand } = useBrand();
	const queryClient = useQueryClient();
	const router = useRouter();
	const writeError = useWriteErrorMessage();
	const [reviewing, setReviewing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [data, setData] = useState<WizardData>({
		brandName: "",
		website: "",
		additionalDomains: [],
		aliases: [],
		competitors: [],
		prompts: [],
	});

	const brandId = brand?.id;

	const analysis = usePolledBrandJob({
		queryKey: ["analyze-brand", brandId],
		start: () => {
			if (!brand?.id || !brand.website) throw new Error("品牌信息尚未加载完成。");
			return startAnalyzeBrandFn({ data: { brandId: brand.id, website: brand.website, brandName: brand.name } });
		},
		poll: () => getAnalyzeBrandStatusFn({ data: { brandId: brandId! } }),
		cancel: () => cancelAnalyzeBrandFn({ data: { brandId: brandId! } }),
		onDone: ({ suggestion }) => {
			const website = brand?.website || suggestion.website || "";
			setData({
				brandName: suggestion.brandName || brand?.name || "",
				website,
				additionalDomains: suggestion.additionalDomains.reduce<string[]>(
					(kept, domain) => (validateAdditionalDomain(domain, [website, ...kept]) === true ? [...kept, domain] : kept),
					[],
				),
				aliases: suggestion.aliases,
				competitors: suggestion.competitors.map((c) =>
					newCompetitorEntry({
						name: c.name,
						domains: c.domains,
						aliases: c.aliases,
						expanded: false,
					}),
				),
				prompts: suggestion.suggestedPrompts.map((p) =>
					newPromptEntry({ value: p.prompt, tags: p.tags, enabled: true }),
				),
			});
			setReviewing(true);
			trackEvent("onboarding_analyzed", {
				competitor_count: suggestion.competitors.length,
				prompt_count: suggestion.suggestedPrompts.length,
			});
		},
		onError: setError,
		startErrorFallback: "分析失败",
		timeoutMessage: "品牌分析超时，请重试。",
	});

	const handleAnalyze = () => {
		if (!brand?.website || !brand?.id) return;
		setError(null);
		analysis.run();
	};

	const updateBrandName = useCallback((brandName: string) => setData((p) => ({ ...p, brandName })), []);
	const updateWebsite = useCallback((website: string) => setData((p) => ({ ...p, website })), []);
	const updateAliases = useCallback((aliases: string[]) => setData((p) => ({ ...p, aliases })), []);
	const updateAdditionalDomains = useCallback(
		(additionalDomains: string[]) => setData((p) => ({ ...p, additionalDomains })),
		[],
	);
	const updateCompetitors = useCallback(
		(competitors: CompetitorEntry[]) => setData((p) => ({ ...p, competitors })),
		[],
	);
	const updatePrompts = useCallback((prompts: EditablePrompt[]) => setData((p) => ({ ...p, prompts })), []);

	const validateDomain = useCallback(
		(val: string, current: string[]) =>
			validateAdditionalDomain(val, [data.website.trim() || brand?.website, ...current]),
		[data.website, brand?.website],
	);

	const previewCounts = useMemo(() => {
		const enabled = data.prompts.filter((p) => p.enabled && p.value.trim().length > 0).length;
		return { totalNew: enabled };
	}, [data.prompts]);

	const handleSubmit = useCallback(async () => {
		if (!brand?.id) return;
		setSubmitError(null);
		setIsSaving(true);
		try {
			const competitorsPayload = data.competitors
				.filter((c) => c.name.trim() && c.domains.some((d) => d.trim()))
				.map((c) => ({
					name: c.name.trim(),
					domains: c.domains.filter((d) => d.trim()),
					aliases: c.aliases,
				}));

			const promptsPayload = data.prompts
				.filter((p) => p.enabled && p.value.trim())
				.map((p) => ({ value: p.value.trim(), tags: p.tags, enabled: true }));

			await updateOnboardedBrandFn({
				data: {
					brandId: brand.id,
					brandName: data.brandName.trim() || brand.name,
					website: data.website.trim() || brand.website,
					additionalDomains: data.additionalDomains,
					aliases: data.aliases,
					competitors: competitorsPayload,
					prompts: promptsPayload,
				},
			});

			trackEvent("wizard_completed", {
				prompts_created: promptsPayload.length,
				competitors_created: competitorsPayload.length,
				skipped: false,
			});

			// Deployments without an onboardingRedirectUrlTemplate (e.g. local mode) skip the full reload, so caches fetched while !onboarded must be busted explicitly.
			queryClient.invalidateQueries({ queryKey: brandKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: promptsSummaryKeys.all });
			// The $brand route loader feeds `brand` into AppSidebar; invalidate it so the sidebar picks up onboarded=true.
			await router.invalidate();

			onComplete();
		} catch (err) {
			setSubmitError(writeError(err, "保存失败"));
		} finally {
			setIsSaving(false);
		}
	}, [brand, data, queryClient, router, onComplete, writeError]);

	if (!reviewing) {
		return (
			<div className="max-w-2xl mx-auto space-y-3">
				<p className="text-sm text-muted-foreground">
					我们将通过网络搜索分析 <strong>{brand?.website}</strong>，为你推荐竞品、额外域名/别名，以及一组可供追踪的初始 AI
					提示词。
				</p>
				{error && (
					<div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
						<AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
						<span>
							<WriteErrorMessage message={error} />
						</span>
					</div>
				)}
				<div className="flex items-center gap-2">
					<Button
						onClick={handleAnalyze}
						disabled={analysis.running}
						className="flex items-center gap-2 cursor-pointer"
					>
						{analysis.running ? (
							<>
								<Spinner /> 正在分析品牌…
							</>
						) : (
							<>
								<Play className="h-4 w-4" /> 分析品牌
							</>
						)}
					</Button>
					{analysis.running && (
						<Button variant="outline" onClick={analysis.cancel} className="cursor-pointer">
							取消
						</Button>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<div className="space-y-2">
				<h2 className="text-2xl font-bold">品牌详情</h2>
				<p className="text-muted-foreground">确认用于追踪的品牌身份、额外域名与别名。</p>
				<div className="space-y-3">
					<div>
						<p className="text-xs text-muted-foreground">品牌名称</p>
						<Input value={data.brandName} onChange={(e) => updateBrandName(e.target.value)} placeholder="品牌名称" />
					</div>
					<div>
						<p className="text-xs text-muted-foreground">网站链接地址</p>
						<Input
							type="url"
							value={data.website}
							onChange={(e) => updateWebsite(e.target.value)}
							placeholder="https://example.com"
						/>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">额外域名</p>
						<EditableTagsInput
							items={data.additionalDomains}
							onValueChange={updateAdditionalDomains}
							placeholder="添加域名…"
							maxItems={10}
							normalizeValue={normalizeDomain}
							pasteSplitter={DOMAIN_PASTE_SPLITTER}
							onValidate={validateDomain}
						/>
					</div>
					<div>
						<p className="text-xs text-muted-foreground">别名</p>
						<EditableTagsInput
							items={data.aliases}
							onValueChange={updateAliases}
							placeholder="添加别名…"
							maxItems={10}
						/>
					</div>
				</div>
			</div>

			<Separator />

			<div className="space-y-3">
				<div>
					<h2 className="text-2xl font-bold">竞品</h2>
					<p className="text-muted-foreground">希望与你的品牌一同追踪的公司。</p>
				</div>
				<CompetitorsEditor competitors={data.competitors} onChange={updateCompetitors} disabled={isSaving} />
			</div>

			<Separator />

			<div className="space-y-3">
				<div>
					<h2 className="text-2xl font-bold">提示词</h2>
					<p className="text-muted-foreground">
						选择要开始追踪的 AI 提示词。取消勾选不需要的项、编辑标签，或在底部添加自定义提示词。
					</p>
				</div>
				<PromptsListEditor prompts={data.prompts} onChange={updatePrompts} showSystemTags={false} />
			</div>

			{submitError && (
				<div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
					<AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
					<div className="text-sm">
						<WriteErrorMessage message={submitError} />
					</div>
				</div>
			)}

			<Button
				onClick={handleSubmit}
				disabled={isSaving || previewCounts.totalNew === 0}
				className="flex items-center gap-2 cursor-pointer"
			>
				{isSaving ? (
					<>
						<Spinner /> 保存中…
					</>
				) : (
					<>
						<Rocket className="h-4 w-4" /> 开始追踪（{previewCounts.totalNew} 条新提示词）
					</>
				)}
			</Button>
		</div>
	);
}
