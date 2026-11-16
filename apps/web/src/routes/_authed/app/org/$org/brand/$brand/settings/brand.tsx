import { IconInfoCircle } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { brandSegment, brandSlugPrefix, normalizeSlug } from "@workspace/lib/app-urls";
import { cleanAndValidateDomain, validateAdditionalDomain } from "@workspace/lib/citations/domain-categories";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { TagsInput } from "@workspace/ui/components/tags-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useCallback, useState } from "react";
import { SlugField } from "@/components/slug-field";
import { WriteErrorMessage } from "@/components/write-error-message";
import { useBrand } from "@/hooks/use-brands";
import { citationKeys } from "@/hooks/use-citations";
import { dashboardKeys } from "@/hooks/use-dashboard-summary";
import { useOrganization, useOrganizationsChanged } from "@/hooks/use-organizations";
import { useBrandParams } from "@/hooks/use-route-params";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { updateBrandFn } from "@/server/brands";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/brand")({
	staticData: { crumb: "品牌" },
	head: pageHead({ title: "品牌设置", description: "管理品牌名称与网站。" }),
	component: BrandSettingsPage,
});

function BrandSettingsPage() {
	const { data: brand, isLoading, refetch: refetchBrand } = useBrand();
	const queryClient = useQueryClient();
	const organization = useOrganization();
	const organizationsChanged = useOrganizationsChanged();
	const brandParams = useBrandParams();
	const navigate = useNavigate();
	const writeError = useWriteErrorMessage();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [additionalDomains, setAdditionalDomains] = useState<string[]>([]);
	const [aliases, setAliases] = useState<string[]>([]);
	const [slug, setSlug] = useState("");

	// Reseed the fields when the brand changes server-side, without discarding
	// whatever is being typed in between.
	const [seededFrom, setSeededFrom] = useState<Date | null>(null);
	if (brand && brand.updatedAt !== seededFrom) {
		setSeededFrom(brand.updatedAt);
		setAdditionalDomains(brand.additionalDomains || []);
		setAliases(brand.aliases || []);
		setSlug(brandSegment(brand));
	}

	const validateDomain = useCallback(
		(val: string, current: string[]) => validateAdditionalDomain(val, [brand?.website, ...current]),
		[brand?.website],
	);
	const handleAliasesChange = useCallback((values: string[]) => setAliases(values), []);

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">品牌</h1>
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	if (!brand) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold">品牌</h1>
					<p className="text-destructive">未找到品牌</p>
				</div>
			</div>
		);
	}

	const currentSlug = brandSegment(brand);

	const handleSubmit = async (formData: FormData) => {
		setIsSubmitting(true);
		setError("");
		setSuccess("");

		try {
			const name = formData.get("name") as string;
			const website = formData.get("website") as string;

			const nextSlug = normalizeSlug(slug);
			const slugMoved = nextSlug !== currentSlug;
			await updateBrandFn({
				data: {
					brandId: brand.id,
					name,
					website,
					...(slugMoved && { slug: nextSlug }),
					additionalDomains,
					aliases,
				},
			});

			// Domain/alias changes affect citation categorization and mention detection
			queryClient.invalidateQueries({ queryKey: citationKeys.all });
			queryClient.invalidateQueries({ queryKey: dashboardKeys.all });

			setSuccess("Brand details updated successfully!");
			await refetchBrand();
			await organizationsChanged(
				slugMoved
					? () =>
							navigate({
								to: "/app/org/$org/brand/$brand/settings/brand",
								params: { ...brandParams, brand: nextSlug },
								replace: true,
							})
					: undefined,
			);
		} catch (err) {
			setError(writeError(err, "保存品牌失败。"));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="space-y-6 max-w-2xl">
			<div>
				<h1 className="text-3xl font-bold">品牌</h1>
				<p className="text-muted-foreground">管理品牌名称与网站</p>
			</div>

			<form action={handleSubmit} className="space-y-6">
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">品牌名称</Label>
						<Input
							id="name"
							name="name"
							type="text"
							placeholder="品牌名称"
							defaultValue={brand.name}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">输入你的品牌名称</p>
					</div>

					<SlugField
						id="brand-slug"
						label="品牌标识"
						prefix={brandSlugPrefix(organization)}
						value={slug}
						onChange={setSlug}
						disabled={isSubmitting}
					/>

					<div className="space-y-2">
						<Label htmlFor="website">网站</Label>
						<Input
							id="website"
							name="website"
							type="text"
							placeholder="example.com"
							defaultValue={brand.website}
							required
							disabled={isSubmitting}
						/>
						<p className="text-xs text-muted-foreground">你的品牌主网站</p>
					</div>

					<div className="space-y-2">
						<Label className="flex items-center gap-1.5">
							附加域名
							<Tooltip>
								<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
								<TooltipContent className="max-w-xs text-xs font-normal">
									你的品牌还拥有的其他域名，例如 example.co.uk。子域名会自动涵盖。修改同样会应用到已有的引用记录。
								</TooltipContent>
							</Tooltip>
						</Label>
						<TagsInput
							value={additionalDomains}
							onValueChange={setAdditionalDomains}
							placeholder="添加域名..."
							pasteSplitter={/[\n,\t]+/}
							searchPlaceholder="添加域名..."
							maxItems={10}
							normalizeValue={(raw) => cleanAndValidateDomain(raw) ?? raw.trim()}
							onValidate={validateDomain}
						/>
					</div>

					<div className="space-y-2">
						<Label className="flex items-center gap-1.5">
							品牌别名
							<Tooltip>
								<TooltipTrigger render={<IconInfoCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
								<TooltipContent className="max-w-xs text-xs font-normal">
									品牌的替代名称（子品牌、产品线、缩写）。仅用于<strong>今后</strong>的提示词采样做提及识别 &mdash; 不会回溯应用到历史结果。
								</TooltipContent>
							</Tooltip>
						</Label>
						<TagsInput
							value={aliases}
							onValueChange={handleAliasesChange}
							placeholder="添加别名..."
							searchPlaceholder="添加别名..."
							maxItems={10}
						/>
					</div>
				</div>

				{error && (
					<div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
						<WriteErrorMessage message={error} />
					</div>
				)}
				{success && <div className="text-sm text-green-600 bg-green-50 p-3 rounded-md">{success}</div>}

				<div className="flex gap-2">
					<Button type="submit" disabled={isSubmitting} className="cursor-pointer">
						{isSubmitting ? "保存中..." : "保存更改"}
					</Button>
				</div>
			</form>
		</div>
	);
}
