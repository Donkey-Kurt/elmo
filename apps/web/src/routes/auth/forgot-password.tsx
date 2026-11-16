/**
 * /auth/forgot-password - Request a password reset email
 *
 * Cloud only: it is the only mode that wires a sendResetPassword mailer, so
 * anywhere else the confirmation below would promise an email that never
 * arrives. Demo and whitelabel have no password to reset either way.
 *
 * Always renders the same neutral confirmation whether or not the account
 * exists, to avoid account enumeration.
 */

import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import { AuthSplitLayout } from "@/components/auth/auth-split-layout";
import { SalesFooterLinks, SalesPanel } from "@/components/auth/sales-panel";
import { CAPTCHA_FAILED_MESSAGE, CaptchaError, isCaptchaRejection, useTurnstile } from "@/hooks/use-turnstile";
import { buildTitle, getAppName } from "@/lib/route-head";

export const Route = createFileRoute("/auth/forgot-password")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle("重置密码", { appName }) },
				{ name: "description", content: "请求密码重置链接。" },
			],
		};
	},
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };

	if (context.clientConfig?.mode !== "cloud") {
		window.location.href = "/auth/login";
		return null;
	}

	return <ForgotPasswordForm isCloud />;
}

export function ForgotPasswordForm({ isCloud, submitted: initiallySubmitted = false }: ForgotPasswordFormProps) {
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [submitted, setSubmitted] = useState(initiallySubmitted);
	const [error, setError] = useState<string | null>(null);
	const turnstile = useTurnstile();
	const source = isCloud ? "cloud-signin" : "self-hosted-signin";

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError(null);
		try {
			const result = await authClient.requestPasswordReset({
				email,
				redirectTo: "/auth/reset-password",
				fetchOptions: { headers: await turnstile.getCaptchaHeaders() },
			});
			if (isCaptchaRejection(result.error)) {
				setError(CAPTCHA_FAILED_MESSAGE);
				setLoading(false);
				return;
			}
		} catch (err) {
			if (err instanceof CaptchaError) {
				setError(err.message);
				setLoading(false);
				return;
			}
			// Same neutral confirmation on failure — no account enumeration.
		}
		setSubmitted(true);
		setLoading(false);
	}

	const panel = <SalesPanel variant={isCloud ? "cloud" : "self-hosted"} source={source} />;

	if (submitted) {
		return (
			<AuthSplitLayout
				title="查收邮箱"
				subtitle={
					email ? `如果 ${email} 对应的账户存在，重置链接正在发送中。` : "重置链接正在发送中。"
				}
				pitch={panel}
				footer={<SalesFooterLinks source={source} />}
			>
				<BackToSignIn />
			</AuthSplitLayout>
		);
	}

	return (
		<AuthSplitLayout
			title="重置你的密码"
			subtitle="输入你的邮箱，我们会发送重置链接。"
			pitch={panel}
			footer={<SalesFooterLinks source={source} />}
		>
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
				{turnstile.widget}
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? "发送中…" : "发送重置链接"}
				</Button>
			</form>
			<div className="pt-4">
				<BackToSignIn />
			</div>
		</AuthSplitLayout>
	);
}

interface ForgotPasswordFormProps {
	isCloud?: boolean;
	/** Starts on the confirmation screen. For stories; the page always starts on the form. */
	submitted?: boolean;
}

export function BackToSignIn() {
	return (
		<p className="text-sm text-muted-foreground">
			<Link to="/auth/login" className="text-primary hover:underline font-medium">
				返回登录
			</Link>
		</p>
	);
}
