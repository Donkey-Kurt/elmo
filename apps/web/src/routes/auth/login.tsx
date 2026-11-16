/**
 * /auth/login - Login page
 *
 * Local/cloud modes: email/password form beside the sales panel.
 * Demo mode: signs in to the shared account automatically — a demo visitor
 * is already looking, and has nothing to buy.
 * Whitelabel mode: auto-redirects to Auth0 SSO (no form shown).
 */

import { IconBrandGoogle } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { MCP_AUTHORIZE_ENDPOINT } from "@workspace/config/constants";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SalesFooterLinks, SalesPanel } from "@/components/auth/sales-panel";
import FullPageCard from "@/components/full-page-card";
import { LegalConsentNotice } from "@/components/legal-consent-notice";
import { CAPTCHA_FAILED_MESSAGE, CaptchaError, isCaptchaRejection, useTurnstile } from "@/hooks/use-turnstile";
import { type AttributionParams, attributionParams } from "@/lib/attribution";
import { safeReturnTo } from "@/lib/return-to";
import { buildTitle, getAppName } from "@/lib/route-head";

/**
 * When the OAuth plugin sent the browser here mid-flow, handing the signed query
 * back to the authorization endpoint resumes it — including for the paths that
 * leave for an identity provider, where the request is gone on return.
 */
function postSignInDestination(search: LoginSearch): string {
	if (!search.sig) return safeReturnTo(search.returnTo);
	const query = new URLSearchParams(
		Object.entries(search).flatMap(([key, value]) =>
			value === undefined ? [] : [[key, String(value)] as [string, string]],
		),
	);
	return `${MCP_AUTHORIZE_ENDPOINT}?${query}`;
}

/** A passthrough: the plugin signs the whole query, so a dropped parameter is a
 * signature that no longer verifies. */
interface LoginSearch extends AttributionParams {
	returnTo?: string;
	sig?: string;
}

export const Route = createFileRoute("/auth/login")({
	validateSearch: (search: Record<string, unknown>): LoginSearch => search,
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle("登录", { appName }) },
				{ name: "description", content: "登录你的账户。" },
			],
		};
	},
	component: LoginPage,
});

function LoginPage() {
	const search = Route.useSearch();
	const { returnTo } = search;
	const destination = postSignInDestination(search);
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;
	const canRegister = context.clientConfig?.canRegister ?? false;
	const hasUsers = context.clientConfig?.hasUsers ?? false;

	if (mode === "whitelabel") {
		return <SSOLogin destination={destination} />;
	}

	if (mode === "demo") {
		return <DemoLogin destination={destination} />;
	}

	if (mode === "local" && !hasUsers) {
		window.location.href = "/auth/register";
		return null;
	}

	return (
		<EmailPasswordLogin
			destination={destination}
			returnTo={returnTo}
			attribution={attributionParams(search)}
			isCloud={mode === "cloud"}
			canRegister={canRegister}
		/>
	);
}

export function SSOLogin({ destination = "/app" }: { destination?: string }) {
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		authClient.signIn
			.sso({ providerId: "auth0-whitelabel", callbackURL: destination })
			.then((result) => {
				if (cancelled) return;
				if (result.error) {
					setError(result.error.message ?? "启动登录失败");
				}
			})
			.catch(() => {
				if (!cancelled) {
					setError("出错了，请重试。");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [destination]);

	if (error) return <SignInFailed error={error} />;

	return <FullPageCard title="正在登录…" subtitle="正在跳转到你的身份提供商" />;
}

export function DemoLogin({ destination = "/app" }: { destination?: string }) {
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		authClient.signIn
			.email({ email: "demo@elmohq.com", password: "demo" })
			.then((result) => {
				if (cancelled) return;
				if (result.error) {
					setError(result.error.message ?? "邮箱或密码无效");
					return;
				}
				window.location.href = destination;
			})
			.catch(() => {
				if (!cancelled) setError("出错了，请重试。");
			});

		return () => {
			cancelled = true;
		};
	}, [destination]);

	if (error) return <SignInFailed error={error} />;

	return <FullPageCard title="正在登录…" subtitle="正在打开演示账户" />;
}

function SignInFailed({ error }: { error: string }) {
	return (
		<FullPageCard title="登录">
			<div className="w-full space-y-4">
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
				<Button className="w-full" onClick={() => window.location.reload()}>
					重试
				</Button>
			</div>
		</FullPageCard>
	);
}

function signInErrorMessage(error: { code?: string; message?: string }, isCloud?: boolean) {
	if (isCloud && error.code === "EMAIL_NOT_VERIFIED") {
		return "请先验证你的邮箱——我们刚刚给你发送了一条新的验证链接。";
	}
	if (isCaptchaRejection(error)) return CAPTCHA_FAILED_MESSAGE;
	return error.message ?? "邮箱或密码无效";
}

function LastUsedBadge() {
	// The leading space keeps the button's accessible name "Sign In Last Used" rather than "Sign InLast Used".
	return (
		<>
			{" "}
			<Badge variant="secondary" className="pointer-events-none absolute -top-3 right-3">
				最近使用
			</Badge>
		</>
	);
}

export function EmailPasswordLogin({
	destination = "/app",
	returnTo,
	attribution,
	isCloud,
	canRegister,
}: {
	destination?: string;
	returnTo?: string;
	attribution?: AttributionParams;
	isCloud?: boolean;
	canRegister?: boolean;
}) {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(null);
	const source = isCloud ? "cloud-signin" : "self-hosted-signin";
	const turnstile = useTurnstile();

	useEffect(() => {
		setLastLoginMethod(isCloud ? authClient.getLastUsedLoginMethod() : null);
	}, [isCloud]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const result = await authClient.signIn.email({
				email,
				password,
				fetchOptions: { headers: await turnstile.getCaptchaHeaders() },
			});

			if (result.error) {
				// An expired authorization request; dropping it makes the next attempt
				// an ordinary sign-in.
				if ((result.error as { error?: string }).error === "invalid_signature") {
					// Through the router, so `destination` is recomputed.
					navigate({ to: "/auth/login", search: {}, replace: true });
					setError("该连接请求已过期。请重新登录，然后从你的 MCP 客户端重新发起连接。");
					setLoading(false);
					return;
				}
				setError(signInErrorMessage(result.error, isCloud));
				setLoading(false);
				return;
			}

			window.location.href = destination;
		} catch (err) {
			setError(err instanceof CaptchaError ? err.message : "出错了，请重试。");
			setLoading(false);
		}
	}

	return (
		<AuthSplitLayout
			title="欢迎回来"
			subtitle={isCloud ? "查看你的 AI 可见度。" : "登录你的 Elmo 实例。"}
			pitch={<SalesPanel variant={isCloud ? "cloud" : "self-hosted"} source={source} />}
			footer={<SalesFooterLinks source={source} />}
		>
			{isCloud && (
				<div className="space-y-4 w-full pb-4">
					<Button
						type="button"
						variant="outline"
						className="relative w-full"
						onClick={() => authClient.signIn.social({ provider: "google", callbackURL: destination })}
					>
						<IconBrandGoogle className="size-4" />
						使用 Google 继续
						{lastLoginMethod === "google" && <LastUsedBadge />}
					</Button>
					<LegalConsentNotice action="continuing with Google" />
					<div className="flex items-center gap-3">
						<Separator className="flex-1" />
						<span className="text-xs text-muted-foreground">或</span>
						<Separator className="flex-1" />
					</div>
				</div>
			)}
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="space-y-2">
					<Label htmlFor="email">邮箱</Label>
					<Input
						id="email"
						type="email"
						placeholder="you@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
						autoComplete="email"
						autoFocus
					/>
				</div>
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label htmlFor="password">密码</Label>
						{isCloud && (
							<Link to="/auth/forgot-password" className="text-xs text-primary hover:underline">
								忘记密码？
							</Link>
						)}
					</div>
					<Input
						id="password"
						type="password"
						placeholder="密码"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						autoComplete="current-password"
					/>
				</div>
				{turnstile.widget}
				<Button type="submit" className="relative w-full" disabled={loading}>
					{loading ? "正在登录…" : "登录"}
					{lastLoginMethod === "email" && <LastUsedBadge />}
				</Button>
			</form>
			{canRegister && (
				<p className="text-sm text-muted-foreground pt-4">
					还没有账户？{" "}
					<Link
						to="/auth/register"
						search={{ ...(returnTo ? { returnTo } : {}), ...attribution }}
						className="text-primary hover:underline font-medium"
					>
						创建账户
					</Link>
				</p>
			)}
		</AuthSplitLayout>
	);
}
