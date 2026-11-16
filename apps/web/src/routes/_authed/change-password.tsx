import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button, buttonVariants } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { buildTitle, getAppName } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/change-password")({
	head: ({ match }) => {
		const appName = getAppName(match);
		return {
			meta: [
				{ title: buildTitle("修改密码", { appName }) },
				{ name: "description", content: "修改你账户的密码。" },
			],
		};
	},
	component: ChangePasswordPage,
});

function ChangePasswordPage() {
	const { clientConfig } = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };

	if (clientConfig?.mode === "demo" || clientConfig?.mode === "whitelabel") {
		return (
			<FullPageCard
				title="修改密码"
				subtitle={
					clientConfig.mode === "demo"
						? "演示模式下无法修改密码。"
						: "请在你的身份提供商处修改密码。"
				}
				showBackButton
			/>
		);
	}

	return <PasswordAccountGate />;
}

function PasswordAccountGate() {
	const accounts = useQuery({
		queryKey: ["auth", "accounts"],
		queryFn: async () => {
			const result = await authClient.listAccounts();
			if (result.error) throw new Error(result.error.message);
			return result.data;
		},
	});

	if (accounts.isPending) return null;

	if (accounts.data && !accounts.data.some((account) => account.providerId === "credential")) {
		return (
			<FullPageCard title="修改密码" subtitle="你还没有设置密码。" showBackButton>
				<Link to="/auth/forgot-password" className={buttonVariants({ className: "w-full" })}>
					设置密码
				</Link>
			</FullPageCard>
		);
	}

	return <ChangePasswordForm />;
}

function ChangePasswordForm() {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [updated, setUpdated] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (newPassword !== confirmPassword) {
			setError("两次输入的密码不一致");
			return;
		}
		setLoading(true);

		try {
			const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
			if (result.error) {
				setError(result.error.message ?? "修改密码失败");
				setLoading(false);
				return;
			}
			setUpdated(true);
		} catch {
			setError("出错了，请重试。");
			setLoading(false);
		}
	}

	if (updated) {
		return (
			<FullPageCard title="密码已更新" subtitle="你的密码已修改。">
				<Link to="/app" className={buttonVariants({ className: "w-full" })}>
					继续
				</Link>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="修改密码" subtitle="输入当前密码并设置新密码。">
			<form onSubmit={handleSubmit} className="space-y-4 w-full">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<div className="space-y-2">
					<Label htmlFor="current-password">当前密码</Label>
					<Input
						id="current-password"
						type="password"
						placeholder="当前密码"
						value={currentPassword}
						onChange={(e) => setCurrentPassword(e.target.value)}
						required
						autoComplete="current-password"
						autoFocus
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="new-password">新密码</Label>
					<Input
						id="new-password"
						type="password"
						placeholder="新密码"
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
						required
						autoComplete="new-password"
						minLength={8}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="confirm-password">确认新密码</Label>
					<Input
						id="confirm-password"
						type="password"
						placeholder="确认新密码"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						required
						autoComplete="new-password"
						minLength={8}
					/>
				</div>
				<Button type="submit" className="w-full" disabled={loading}>
					{loading ? "正在修改…" : "修改密码"}
				</Button>
			</form>
		</FullPageCard>
	);
}
