import { createFileRoute, Link } from "@tanstack/react-router";
import { PromptsDisplay } from "@/components/prompts-display";
import { useBrandParams } from "@/hooks/use-route-params";
import { coercePromptOrder, DEFAULT_PROMPT_ORDER, type PromptOrder } from "@/lib/prompt-order";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/visibility")({
	staticData: { crumb: "可见度" },
	validateSearch: (search: Record<string, unknown>): { order?: PromptOrder } => {
		const order = coercePromptOrder(search.order);
		return order === DEFAULT_PROMPT_ORDER ? {} : { order };
	},
	head: pageHead({ description: "追踪大模型如何回答关于你品牌的提示词。" }),
	component: VisibilityPage,
});

function VisibilityPage() {
	const params = useBrandParams();

	const infoContent = (
		<>
			查看不同大模型如何回答与你的品牌、产品及
			<Link to="/app/org/$org/brand/$brand/settings/competitors" params={params} className="underline">
				竞品
			</Link>
			相关的提示词。
		</>
	);

	return (
		<PromptsDisplay
			pageTitle="可见度"
			pageDescription="查看大模型如何评估与你的品牌相关的提示词。"
			pageInfoContent={infoContent}
		/>
	);
}
