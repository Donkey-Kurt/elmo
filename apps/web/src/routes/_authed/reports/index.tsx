/**
 * /reports - Reports list page
 *
 * Requires admin OR report generator access.
 * Replicates: apps/web/src/app/reports/page.tsx + reports-content.tsx
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Spinner } from "@workspace/ui/components/spinner";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Textarea } from "@workspace/ui/components/textarea";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { trackEvent } from "@/lib/posthog";
import { pageHead } from "@/lib/route-head";
import { createReportFn, getReportsFn } from "@/server/reports";

export const Route = createFileRoute("/_authed/reports/")({
	staticData: { crumb: "报告", shell: "admin" },
	head: pageHead({ description: "生成并查看一次性品牌报告。" }),
	beforeLoad: ({ context }) => {
		if (!context.isAdmin && !context.hasReportAccess) throw notFound();
	},
	component: ReportsPage,
});

function ReportsPage() {
	const queryClient = useQueryClient();

	const {
		data: reports = [],
		error,
		isLoading,
	} = useQuery({
		queryKey: ["reports"],
		queryFn: () => getReportsFn(),
		refetchInterval: 5000,
		staleTime: 2000,
	});

	const [formData, setFormData] = useState({
		brandName: "",
		brandAliases: [] as string[],
		brandWebsite: "",
		manualPrompts: "",
	});
	const [submitError, setSubmitError] = useState("");
	const [success, setSuccess] = useState("");

	const createMutation = useMutation({
		mutationFn: (data: typeof formData) => createReportFn({ data }),
		onSuccess: (_data, variables) => {
			trackEvent("report_created", {
				has_manual_prompts: Boolean(variables.manualPrompts),
				brand_alias_count: variables.brandAliases.length,
			});
			setSuccess("报告请求已提交！");
			setFormData({ brandName: "", brandAliases: [], brandWebsite: "", manualPrompts: "" });
			queryClient.invalidateQueries({ queryKey: ["reports"] });
		},
		onError: (err: Error) => {
			setSubmitError(err.message || "发生错误");
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitError("");
		setSuccess("");
		createMutation.mutate(formData);
	};

	const getStatusBadgeVariant = (status: string) => {
		switch (status) {
			case "completed":
				return "default" as const;
			case "processing":
				return "secondary" as const;
			case "failed":
				return "destructive" as const;
			default:
				return "outline" as const;
		}
	};

	const extractDomain = (url: string) => {
		try {
			return new URL(url).hostname.replace("www.", "");
		} catch {
			return url;
		}
	};

	return (
		<div className="space-y-8">
			<div className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">报告</h1>
				<p className="text-muted-foreground">生成一次性品牌报告。</p>
			</div>
			<div className="space-y-6 max-w-4xl">
				<div className="space-y-4">
					<h2 className="text-2xl font-semibold">新建报告</h2>

					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="brandName">品牌名称</Label>
								<Input
									id="brandName"
									type="text"
									placeholder="输入品牌名称"
									value={formData.brandName}
									onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
									required
									disabled={createMutation.isPending}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="brandWebsite">品牌网站</Label>
								<Input
									id="brandWebsite"
									type="url"
									placeholder="https://example.com"
									value={formData.brandWebsite}
									onChange={(e) => setFormData({ ...formData, brandWebsite: e.target.value })}
									required
									disabled={createMutation.isPending}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label>
								其他品牌名称 <span className="text-muted-foreground font-normal">（可选）</span>
							</Label>
							<TagsInput
								value={formData.brandAliases}
								onValueChange={(brandAliases) => setFormData({ ...formData, brandAliases })}
								placeholder="添加名称变体..."
								searchPlaceholder="添加名称变体..."
								maxItems={10}
								disabled={createMutation.isPending}
							/>
							<p className="text-xs text-muted-foreground">
								品牌的其他拼写、缩写或产品名称。提及其中任意一项都计为一次 品牌提及。
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="manualPrompts">
								手动提示词 <span className="text-muted-foreground font-normal">（可选）</span>
							</Label>
							<Textarea
								id="manualPrompts"
								placeholder="每行一个提示词，最多 50 条"
								value={formData.manualPrompts}
								onChange={(e) => setFormData({ ...formData, manualPrompts: e.target.value })}
								disabled={createMutation.isPending}
								rows={6}
								className="font-mono text-sm"
							/>
							<p className="text-xs text-muted-foreground">
								{formData.manualPrompts.trim() ? (
									<>
										<strong>注意：</strong>提示词不会自动生成，将使用你填写的{" "}
										{
											formData.manualPrompts
												.trim()
												.split("\n")
												.filter((line) => line.trim()).length
										}{" "}
										条手动提示词
										{formData.manualPrompts
											.trim()
											.split("\n")
											.filter((line) => line.trim()).length !== 1
											? "。"
											: "。"}
									</>
								) : (
									"留空则根据网站分析、竞争对手与关键词自动生成提示词。"
								)}
							</p>
						</div>

						{submitError && <p className="text-sm text-destructive">{submitError}</p>}
						{success && <p className="text-sm text-green-600">{success}</p>}

						<Button type="submit" disabled={createMutation.isPending} className="cursor-pointer">
							{createMutation.isPending ? "创建中..." : "创建报告"}
						</Button>
					</form>
				</div>

				<div className="space-y-4">
					<h2 className="text-2xl font-semibold">报告历史</h2>

					{error && (
						<Card>
							<CardContent className="py-8 text-center">
								<p className="text-destructive">{error instanceof Error ? error.message : "加载报告失败"}</p>
							</CardContent>
						</Card>
					)}

					{isLoading ? (
						<div className="flex items-center justify-center py-8">
							<div className="flex items-center space-x-2">
								<Spinner className="size-6 text-primary" />
								<span>正在加载报告...</span>
							</div>
						</div>
					) : !error && reports.length === 0 ? (
						<Card>
							<CardContent className="py-8 text-center">
								<p className="text-muted-foreground">暂无报告。</p>
							</CardContent>
						</Card>
					) : (
						!error && (
							<div className="space-y-3">
								{reports.map((report: any) => (
									<div key={report.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
										<div className="flex items-center justify-between">
											<div className="flex-1 min-w-0">
												<h3 className="font-semibold text-lg">
													{report.brandName}{" "}
													<span className="text-gray-600 font-normal">({extractDomain(report.brandWebsite)})</span>
												</h3>
											</div>
											<div className="ml-4">
												{report.status === "completed" ? (
													<Link
														to="/reports/render/$reportId"
														params={{
															reportId: report.id,
														}}
														target="_blank"
													>
														<Button variant="default" size="sm" className="cursor-pointer h-6 px-2 text-xs">
															<ExternalLink className="size-3 mr-0.5" />
															查看报告
														</Button>
													</Link>
												) : (
													<Badge variant={getStatusBadgeVariant(report.status)} className="text-xs">
														{report.status.charAt(0).toUpperCase() + report.status.slice(1)}
														{report.status === "processing" && ` · ${report.progress}%`}
													</Badge>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						)
					)}
				</div>
			</div>
		</div>
	);
}
