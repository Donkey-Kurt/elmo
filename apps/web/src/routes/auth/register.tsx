/**
 * /auth/register - Account registration page
 *
 * Available in local mode for the single bootstrap signup and in cloud mode
 * for public self-serve signup. Cloud requires email verification before
 * sign-in and also offers Google OAuth.
 */

import { IconBrandGoogle } from "@tabler/icons-react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { useState } from "react";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SalesFooterLinks, SalesPanel } from "@/components/auth/sales-panel";
import FullPageCard from "@/components/full-page-card";
import { LegalConsentNotice } from "@/components/legal-consent-notice";
import { CAPTCHA_FAILED_MESSAGE, CaptchaError, isCaptchaRejection, useTurnstile } from "@/hooks/use-turnstile";
import { type AttributionParams, attributionParams } from "@/lib/attribution";
import { safeReturnTo } from "@/lib/return-to";
import { buildTitle, getAppName } from "@/lib/route-head";

export const Route = createFileRoute("/auth/register")({
	validateSearch: (search: Record<string, unknown>): { returnTo?: string } & AttributionParams => ({
		...(typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {}),
		...attributionParams(search),
	}),
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [{ title: buildTitle("注册", { appName }) }, { name: "description", content: "创建账户。" }],
		};
	},
	component: RegisterPage,
});

function RegisterPage() {
	const search = Route.useSearch();
	const { returnTo } = search;
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const canRegister = context.clientConfig?.canRegister ?? false;

	if (!canRegister) {
		window.location.href = "/auth/login";
		return null;
	}

	return (
		<RegisterForm
			returnTo={returnTo}
			attribution={attributionParams(search)}
			isCloud={context.clientConfig?.mode === "cloud"}
			hasUsers={context.clientConfig?.hasUsers ?? false}
		/>
	);
}

export function RegisterForm({
	returnTo,
	attribution,
	isCloud,
	hasUsers,
}: {
	returnTo?: string;
	attribution?: AttributionParams;
	isCloud?: boolean;
	/** A local instance before its bootstrap signup has nowhere to send an existing account. */
	hasUsers?: boolean;
}) {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [pendingVerification, setPendingVerification] = useState(false);
	const turnstile = useTurnstile();
	const source = isCloud ? "cloud-signup" : "self-hosted-signup";

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const result = await authClient.signUp.email({
				email,
				password,
				name,
				...(isCloud && { callbackURL: safeReturnTo(returnTo) }),
				fetchOptions: { headers: await turnstile.getCaptchaHeaders() },
			});

			if (result.error) {
				setError(
					isCaptchaRejection(result.error) ? CAPTCHA_FAILED_MESSAGE : (result.error.message ?? "注册失败"),
				);
				setLoading(false);
				return;
			}

			if (isCloud) {
				setPendingVerification(true);
				setLoading(false);
				return;
			}

			navigate({ to: returnTo ?? "/app" });
		} catch (err) {
			setError(err instanceof CaptchaError ? err.message : "出错了，请重试。");
			setLoading(false);
		}
	}

	if (pendingVerification) {
		return <CheckYourEmail email={email} returnTo={returnTo} />;
	}

	return (
		<AuthSplitLayout
			title={isCloud ? "开始追踪你的 AI 可见度" : "创建你的管理员账户"}
			subtitle={
				isCloud
					? `套餐每月 $${CLOUD_ENTRY_PRICE_USD} 起，随时可取消。`
					: "这是你的自托管实例的所有者账户。"
			}
			pitch={<SalesPanel variant={isCloud ? "cloud" : "self-hosted"} source={source} />}
			footer={<SalesFooterLinks source={source} />}
		>
			{isCloud && (
				<div className="space-y-4 w-full pb-4">
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={() => authClient.signIn.social({ provider: "google", callbackURL: safeReturnTo(returnTo) })}
					>
						<IconBrandGoogle className="size-4" />
						使用 Google 继续
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
					<Label htmlFor="name">姓名</Label>
					<Input
						id="name"
						type="text"
						placeholder="你的姓名"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						autoComplete="name"
						autoFocus
					/>
				</div>
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
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="password">密码</Label>
					<Input
						id="password"
						type="password"
						placeholder="设置密码"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
						autoComplete="new-password"
						minLength={isCloud ? 8 : 6}
					/>
				</div>
				{turnstile.widget}
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? "正在创建账户…" : "创建账户"}
				</Button>
				<LegalConsentNotice action="creating an account" />
			</form>
			{hasUsers && (
				<p className="text-sm text-muted-foreground pt-4">
					已有账户？{" "}
					<Link
						to="/auth/login"
						search={{ ...(returnTo ? { returnTo } : {}), ...attribution }}
						className="text-primary hover:underline font-medium"
					>
						登录
					</Link>
				</p>
			)}
		</AuthSplitLayout>
	);
}

function CheckYourEmail({ email, returnTo }: { email: string; returnTo?: string }) {
	const [resending, setResending] = useState(false);
	const [resendError, setResendError] = useState<string | null>(null);
	const turnstile = useTurnstile();

	async function handleResend() {
		setResending(true);
		setResendError(null);
		try {
			const result = await authClient.sendVerificationEmail({
				email,
				callbackURL: safeReturnTo(returnTo),
				fetchOptions: { headers: await turnstile.getCaptchaHeaders() },
			});
			if (isCaptchaRejection(result.error)) setResendError(CAPTCHA_FAILED_MESSAGE);
			else if (result.error) setResendError(result.error.message ?? "重新发送邮件失败，请重试。");
		} catch (err) {
			setResendError(err instanceof CaptchaError ? err.message : "出错了，请重试。");
		} finally {
			setResending(false);
		}
	}

	return (
		<FullPageCard title="查收邮箱" subtitle={`我们已向 ${email} 发送了一条验证链接`}>
			<div className="space-y-4 w-full">
				<p className="text-sm text-muted-foreground text-center">
					点击邮件中的链接验证你的邮箱地址并开始使用。链接会过期，请尽快验证。
				</p>
				{resendError && (
					<Alert variant="destructive">
						<AlertDescription>{resendError}</AlertDescription>
					</Alert>
				)}
				{turnstile.widget}
				<Button type="button" variant="outline" className="w-full" onClick={handleResend} disabled={resending}>
					{resending ? "发送中…" : "重新发送验证邮件"}
				</Button>
			</div>
		</FullPageCard>
	);
}
