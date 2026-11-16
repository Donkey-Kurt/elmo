/**
 * Only `POST /api/auth/oauth2/consent` turns the signed request into a code, and
 * only a click sends it — so loading this URL on someone's behalf reaches the
 * consent screen, which is where they say no.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { buildTitle, getAppName } from "@/lib/route-head";
import { getMcpClientFn } from "@/server/mcp-clients";
import { getViewerFn } from "@/server/viewer";

/** A passthrough: the plugin signs the whole query, so dropping a parameter this
 * page never heard of would invalidate the signature. */
interface AuthorizeSearch {
	client_id?: string;
}

export const Route = createFileRoute("/auth/authorize")({
	validateSearch: (search: Record<string, unknown>): AuthorizeSearch => search,
	// The plugin sends a signed-out browser to the sign-in page, so arriving here
	// without a session means it lapsed and the request is stale.
	beforeLoad: async () => ({ viewer: await getViewerFn() }),
	loaderDeps: ({ search }) => ({ clientId: search.client_id }),
	loader: async ({ context, deps }) => {
		if (!context.viewer || !deps.clientId) return { client: null };
		return { client: await getMcpClientFn({ data: { clientId: deps.clientId } }) };
	},
	head: ({ match }) => ({ meta: [{ title: buildTitle("授权", { appName: getAppName(match) }) }] }),
	component: AuthorizePage,
});

function AuthorizePage() {
	const search = Route.useSearch();
	const { viewer } = Route.useRouteContext();
	const { client } = Route.useLoaderData();
	const [connecting, setConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const label = client?.name?.trim() || "一个 MCP 客户端";

	async function respond(accept: boolean) {
		setConnecting(true);
		setError(null);
		const { data, error: failure } = await authClient.oauth2.consent({ accept });
		if (!data?.redirect || !data.url) {
			setError(failure?.message || "授权服务器拒绝了该请求。");
			setConnecting(false);
			return;
		}
		window.location.href = data.url;
	}

	if (!viewer) {
		return (
			<FullPageCard title="你已退出登录" subtitle="请从你的 MCP 客户端重新发起连接。">
				<Alert variant="destructive">
					<AlertDescription>
						该请求针对的会话已经结束，重新登录也无法恢复它。
					</AlertDescription>
				</Alert>
			</FullPageCard>
		);
	}

	if (!search.client_id) {
		return (
			<FullPageCard title="没有可授权的请求" subtitle="请从你的 MCP 客户端发起连接。">
				<Alert variant="destructive">
					<AlertDescription>该链接缺少它要授权的客户端。</AlertDescription>
				</Alert>
			</FullPageCard>
		);
	}

	if (!client) {
		return (
			<FullPageCard title="连接到 Elmo" subtitle="该客户端未在此实例注册。">
				<Alert variant="destructive">
					<AlertDescription>
						继续也不会成功——请从你的 MCP 客户端重新发起连接。
					</AlertDescription>
				</Alert>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="连接到 Elmo" subtitle={`${label} 请求读取并管理你的 Elmo 数据。`}>
			<div className="w-full space-y-4">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<dl className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
					<div className="flex flex-wrap items-baseline gap-x-2">
						<dt className="text-muted-foreground">客户端</dt>
						<dd className="font-medium break-all">{label}</dd>
					</div>
					<div className="flex flex-wrap items-baseline gap-x-2">
						<dt className="text-muted-foreground">身份</dt>
						{client.publisherHost ? (
							<dd className="font-mono text-xs break-all">{client.publisherHost}</dd>
						) : (
							<dd>未验证——该名称由它自行声明</dd>
						)}
					</div>
					{client.redirectHosts.length ? (
						<div className="flex flex-wrap items-baseline gap-x-2">
							<dt className="text-muted-foreground">跳转回</dt>
							<dd className="font-mono text-xs break-all">{client.redirectHosts.join(", ")}</dd>
						</div>
					) : null}
				</dl>
				{client.loopbackOnly && (
					<Alert>
						<AlertDescription>
							这个客户端运行在你自己的电脑上，所以 Elmo 无法判断是哪个程序在发起请求。只有在你刚刚从信任的客户端发起此连接时才继续。
						</AlertDescription>
					</Alert>
				)}
				<p className="text-sm text-muted-foreground">
					{client.publisherHost
						? `它的名称和回调地址来自它发布在 ${client.publisherHost} 的文档。`
						: null}
					它将以你的身份行事，范围是你所属的工作区。要撤销授权，请退出该客户端的登录，或从你的账户中移除它的访问权限。
				</p>
				<div className="flex gap-2">
					<Button className="flex-1" onClick={() => respond(true)} disabled={connecting}>
						{connecting ? "连接中…" : `允许 ${label}`}
					</Button>
					<Button className="flex-1" variant="outline" onClick={() => respond(false)} disabled={connecting}>
						拒绝
					</Button>
				</div>
			</div>
		</FullPageCard>
	);
}
