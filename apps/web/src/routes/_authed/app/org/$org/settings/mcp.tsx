/**
 * Everything here is a fact about *this* deployment — the endpoint, the tools
 * actually registered, whether writes are served at all — so a whitelabel or
 * air-gapped instance never has to send anybody to elmohq.com to connect.
 */
import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_APP_NAME, MCP_PATH } from "@workspace/config/constants";
import { Badge } from "@workspace/ui/components/badge";
import { Card } from "@workspace/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import type { ReactNode } from "react";
import { CodeBlock, InlineCode } from "@/components/code-block";
import { CopyField } from "@/components/copy-button";
import { DemoModeAlert } from "@/components/demo-mode-alert";
import { useAppOrigin } from "@/hooks/use-app-origin";
import { useBranding } from "@/hooks/use-deployment-features";
import { pageHead } from "@/lib/route-head";
import { listMcpToolsFn, type McpPageData } from "@/server/mcp";

export const Route = createFileRoute("/_authed/app/org/$org/settings/mcp")({
	loader: (): Promise<McpPageData> => listMcpToolsFn(),
	staticData: { crumb: "MCP" },
	head: pageHead({ description: "通过 MCP 把 AI 客户端接入本部署。" }),
	component: McpSettingsPage,
});

const KEY_PLACEHOLDER = "YOUR_API_KEY";

/** A client id has to survive a config file, so it is not the display name. */
function clientId(appName: string): string {
	const slug = appName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return slug || "mcp";
}

function json(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

interface ClientSnippet {
	note?: ReactNode;
	code: string;
}

interface ClientDocs {
	value: string;
	label: string;
	signIn: ClientSnippet;
	apiKey: ClientSnippet;
}

function clientDocs(id: string, endpoint: string): ClientDocs[] {
	const bearer = { Authorization: `Bearer ${KEY_PLACEHOLDER}` };
	const keyEnvVar = `${id.toUpperCase().replace(/-/g, "_")}_API_KEY`;

	return [
		{
			value: "claude-code",
			label: "Claude Code",
			signIn: { code: `claude mcp add --transport http ${id} ${endpoint}` },
			apiKey: {
				code: `claude mcp add --transport http ${id} ${endpoint} \\\n  --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`,
			},
		},
		{
			value: "codex",
			label: "Codex",
			signIn: { code: `codex mcp add ${id} --url ${endpoint}\ncodex mcp login ${id}` },
			apiKey: {
				note: "Codex 从环境变量读取密钥，而不是从配置文件读取。",
				code: `codex mcp add ${id} --url ${endpoint} \\\n  --bearer-token-env-var ${keyEnvVar}`,
			},
		},
		{
			value: "cursor",
			label: "Cursor",
			signIn: {
				note: (
					<>
						写在 <InlineCode>~/.cursor/mcp.json</InlineCode> 中。Cursor 会把这个服务显示为需要登录；在那里登录即可。较旧的
						Cursor 版本会发出本部署无法接受的回调，如果登录失败请改用密钥。
					</>
				),
				code: json({ mcpServers: { [id]: { url: endpoint } } }),
			},
			apiKey: { code: json({ mcpServers: { [id]: { url: endpoint, headers: bearer } } }) },
		},
		{
			value: "vs-code",
			label: "VS Code",
			signIn: {
				note: (
					<>
						也可以放在 <InlineCode>mcp.json</InlineCode> 的 <InlineCode>servers</InlineCode> 下。VS Code 会在首次启动该服务时要求你登录。
					</>
				),
				code: `code --add-mcp '${JSON.stringify({ name: id, type: "http", url: endpoint })}'`,
			},
			apiKey: {
				note: (
					<>
						写在 <InlineCode>mcp.json</InlineCode> 中。
					</>
				),
				code: json({ servers: { [id]: { type: "http", url: endpoint, headers: bearer } } }),
			},
		},
		{
			value: "opencode",
			label: "OpenCode",
			signIn: {
				note: (
					<>
						写在 <InlineCode>opencode.json</InlineCode> 中，然后执行 <InlineCode>opencode mcp auth {id}</InlineCode>。
					</>
				),
				code: json({
					$schema: "https://opencode.ai/config.json",
					mcp: { [id]: { type: "remote", url: endpoint, enabled: true } },
				}),
			},
			apiKey: {
				note: (
					<>
						写在 <InlineCode>opencode.json</InlineCode> 中。
					</>
				),
				code: json({
					$schema: "https://opencode.ai/config.json",
					mcp: { [id]: { type: "remote", url: endpoint, enabled: true, headers: bearer } },
				}),
			},
		},
	];
}

function Snippet({ heading, snippet }: { heading: string; snippet: ClientSnippet }) {
	return (
		<div className="space-y-1.5">
			<h3 className="text-sm font-medium">{heading}</h3>
			{snippet.note && <p className="text-sm text-muted-foreground">{snippet.note}</p>}
			<CodeBlock code={snippet.code} />
		</div>
	);
}

function McpSettingsPage() {
	const { tools, readOnlyDeployment } = Route.useLoaderData();
	const branding = useBranding();
	const origin = useAppOrigin();

	const appName = branding?.name || DEFAULT_APP_NAME;
	const endpoint = `${origin}${MCP_PATH}`;
	const id = clientId(appName);
	const clients = clientDocs(id, endpoint);

	return (
		<div className="max-w-4xl space-y-8">
			<header className="space-y-1">
				<h1 className="text-3xl font-bold">MCP</h1>
				<p className="max-w-2xl text-muted-foreground">把任意聊天机器人接入 {appName}。</p>
			</header>

			<DemoModeAlert>演示模式下已禁用 MCP 访问。</DemoModeAlert>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">接入地址</h2>
				<CopyField value={endpoint} label="接入地址" className="max-w-xl" />
			</section>

			<section className="space-y-3">
				<h2 className="text-lg font-semibold">接入方式</h2>
				<Tabs defaultValue={clients[0].value}>
					<TabsList>
						{clients.map((client) => (
							<TabsTrigger key={client.value} value={client.value}>
								{client.label}
							</TabsTrigger>
						))}
					</TabsList>
					{clients.map((client) => (
						<TabsContent key={client.value} value={client.value} className="space-y-6 pt-4">
							<Snippet heading="使用 OAuth 登录" snippet={client.signIn} />
							<Snippet heading="使用 API 密钥登录" snippet={client.apiKey} />
						</TabsContent>
					))}
				</Tabs>
			</section>

			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">工具</h2>
					{readOnlyDeployment && (
						<p className="text-sm text-muted-foreground">
							本部署为只读模式，因此所有密钥都不会获得写入类工具。
						</p>
					)}
				</div>
				<Card className="gap-0 overflow-hidden py-0">
					<Table className="[&_td]:px-4 [&_th]:px-4">
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="w-[22%]">工具</TableHead>
								<TableHead>作用</TableHead>
								<TableHead className="w-[24%]">权限范围</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{tools.map((tool) => (
								<TableRow key={tool.name}>
									<TableCell className="font-mono text-xs text-foreground">{tool.name}</TableCell>
									<TableCell>{tool.title}</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{tool.scopes.map((scope) => (
												<Badge key={scope} variant="secondary" className="font-mono font-normal">
													{scope}
												</Badge>
											))}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Card>
			</section>
		</div>
	);
}
