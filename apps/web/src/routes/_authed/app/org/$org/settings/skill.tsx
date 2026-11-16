import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { orgLinkParams } from "@workspace/lib/app-urls";
import { CodeBlock, InlineCode } from "@/components/code-block";
import { useOrganization } from "@/hooks/use-organizations";
import { pageHead } from "@/lib/route-head";

const INSTALL_COMMAND = "npx skills add elmohq/elmo";
const SKILL_URL = "https://github.com/elmohq/elmo/tree/main/skills/aeo";
const LAUNCH_POST_URL = "https://www.elmohq.com/blog/aeo-skill";

const EXAMPLE_ASKS = [
	"本周我们的品牌在 AI 搜索里表现如何？",
	"上个月我们在 Google AI 概览里的可见度为什么下降了？",
	"检查我们站点对 AI 爬虫的开放情况，并修掉正在阻挡它们的配置。",
	"当我们没被提及时，引擎引用的是哪些页面？如何让它们也引用我们？",
];

export const Route = createFileRoute("/_authed/app/org/$org/settings/skill")({
	staticData: { crumb: "技能" },
	beforeLoad: ({ context }) => {
		if (context.clientConfig?.mode === "whitelabel") {
			throw notFound();
		}
	},
	head: pageHead({ description: "为 Claude Code、Cursor、Codex 等代理安装 aeo 技能。" }),
	component: SkillPage,
});

function SkillPage() {
	const linkParams = orgLinkParams(useOrganization());

	return (
		<div className="max-w-4xl space-y-8">
			<header className="space-y-1">
				<h1 className="text-3xl font-bold">技能</h1>
				<p className="max-w-2xl text-muted-foreground">
					<InlineCode>aeo</InlineCode> 技能会教 Claude Code、Cursor、Codex 等编码代理一套以证据为基础的答案引擎优化流程：测量、诊断、修复，再测量。
				</p>
			</header>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">安装</h2>
				<CodeBlock code={INSTALL_COMMAND} />
				<p className="text-sm text-muted-foreground">
					skills CLI 会找到你机器上的代理，并分别为它们安装该技能。若要手动安装，把{" "}
					<a href={SKILL_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
						skills/aeo
					</a>{" "}
					复制到你所用代理的技能目录。
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">连接你的数据</h2>
				<p className="text-sm text-muted-foreground">
					通过{" "}
					<Link to="/app/org/$org/settings/mcp" params={linkParams} className="underline underline-offset-4">
						MCP
					</Link>{" "}
					把本部署接入后，代理会直接读取你追踪的可见度、引用来源与查询扩展数据，而不是靠猜。未接入时，技能只能退回到手工采样回答。
				</p>
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">试试这样问</h2>
				<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
					{EXAMPLE_ASKS.map((ask) => (
						<li key={ask}>{ask}</li>
					))}
				</ul>
			</section>

			<p className="text-sm text-muted-foreground">
				该技能采用 MIT 许可证。{" "}
				<a href={LAUNCH_POST_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
					查看它与其他 AEO 技能的对比
				</a>
				。
			</p>
		</div>
	);
}
