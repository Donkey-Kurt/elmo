import type { LandscapeMetric } from "@/lib/landscape";

export type Grade = "good" | "fair" | "poor";

export interface MetricMeta {
	label: string;
	short: string;
	/** For tight spots, like the landscape's measure switch on a phone. */
	abbr?: string;
	info: string;
	format: (value: number) => string;
	formatChange: (change: number) => string;
	/** `rank` is the brand's place among the tracked companies on this measure. */
	grade: (value: number, rank: number) => Grade;
	page:
		| "/app/org/$org/brand/$brand/visibility"
		| "/app/org/$org/brand/$brand/share-of-voice"
		| "/app/org/$org/brand/$brand/sentiment";
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const points = (change: number) => `${Math.abs(Math.round(change * 100))}pt`;
/** Out of 100 rather than a percent: it isn't a share of answers. */
const score = (value: number) => `${Math.round(value * 100)}`;

export const METRIC_META: Record<LandscapeMetric, MetricMeta> = {
	visibility: {
		label: "AI 可见度",
		short: "可见度",
		info: "在所有针对你提示词的 AI 回答中，提及你品牌的比例。",
		format: percent,
		formatChange: points,
		grade: (value) => (value > 0.75 ? "good" : value > 0.45 ? "fair" : "poor"),
		page: "/app/org/$org/brand/$brand/visibility",
	},
	share: {
		label: "声量份额",
		short: "声量份额",
		abbr: "SoV",
		info: "在你与所追踪竞品的全部提及中，你的品牌所占的份额。",
		format: percent,
		formatChange: points,
		// A raw share depends on how many competitors are tracked, so it's judged by standing instead.
		grade: (_value, rank) => (rank === 1 ? "good" : rank <= 3 ? "fair" : "poor"),
		page: "/app/org/$org/brand/$brand/share-of-voice",
	},
	sentiment: {
		label: "情绪倾向",
		short: "情绪倾向",
		info: "AI 提及你品牌时的正面程度，0 到 100。50 为中性；越高表示褒多于贬，越低表示贬多于褒。",
		format: score,
		formatChange: (change) => `${Math.abs(Math.round(change * 100))}`,
		// Neutral answers alone score 50: fair, since only criticism outweighing praise is poor.
		grade: (value) => (value >= 0.65 ? "good" : value >= 0.5 ? "fair" : "poor"),
		page: "/app/org/$org/brand/$brand/sentiment",
	},
	position: {
		label: "排名位置",
		short: "位置",
		info: "在回答所提及的受追踪公司中，你的品牌排第几位，按各提示词的最新回答取平均。1 表示被排在首位。",
		format: (value) => value.toFixed(1),
		formatChange: (change) => Math.abs(change).toFixed(1),
		grade: (value) => (value <= 1.5 ? "good" : value <= 2.5 ? "fair" : "poor"),
		page: "/app/org/$org/brand/$brand/visibility",
	},
};

export const GRADE_STYLES: Record<Grade, { card: string; text: string; stroke: string; fill: string }> = {
	good: {
		card: "bg-emerald-50 border-emerald-200",
		text: "text-emerald-700",
		stroke: "#059669",
		fill: "#a7f3d0",
	},
	fair: {
		card: "bg-amber-50 border-amber-200",
		text: "text-amber-700",
		stroke: "#d97706",
		fill: "#fde68a",
	},
	poor: {
		card: "bg-rose-50 border-rose-200",
		text: "text-rose-700",
		stroke: "#e11d48",
		fill: "#fecdd3",
	},
};
