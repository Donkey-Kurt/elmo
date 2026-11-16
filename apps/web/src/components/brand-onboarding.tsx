import { useNavigate } from "@tanstack/react-router";
import { brandSegment } from "@workspace/lib/app-urls";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";
import FullPageCard from "@/components/full-page-card";
import { PlatformSelectionStep } from "@/components/platform-selection-step";
import { WriteErrorMessage } from "@/components/write-error-message";
import { useOrganizationsChanged } from "@/hooks/use-organizations";
import { validateWebsiteUrl } from "@/lib/brand-website";
import { trackEvent } from "@/lib/posthog";
import { useWriteErrorMessage } from "@/lib/write-errors";
import { createBrandFn } from "@/server/brands";
import type { OnboardingPlatformState } from "@/server/platform-picks";

interface BrandOnboardingProps {
	organizationSlug: string;
	brandId: string;
	brandName: string;
	platformState: OnboardingPlatformState;
}

export default function BrandOnboarding({ organizationSlug, brandId, brandName, platformState }: BrandOnboardingProps) {
	const [step, setStep] = useState<"website" | "platforms">("website");
	const [website, setWebsite] = useState("");
	const [selected, setSelected] = useState<Set<string>>(
		platformState ? new Set(platformState.defaultSelected) : new Set(),
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const writeError = useWriteErrorMessage();
	const organizationsChanged = useOrganizationsChanged();
	const navigate = useNavigate();

	const createBrand = async (enabledModels: string[] | null) => {
		setIsLoading(true);
		setError("");

		try {
			const { brand } = await createBrandFn({
				data: {
					brandId,
					brandName,
					website,
					...(enabledModels && enabledModels.length > 0 && { enabledModels }),
				},
			});
			trackEvent("brand_created", { has_website: Boolean(website) });

			await organizationsChanged(() =>
				navigate({
					to: "/app/org/$org/brand/$brand",
					params: { org: organizationSlug, brand: brandSegment(brand) },
				}),
			);
		} catch (err) {
			setError(writeError(err, "无法创建品牌。"));
		} finally {
			setIsLoading(false);
		}
	};

	const handleWebsiteSubmit = async () => {
		setError("");

		const validation = validateWebsiteUrl(website);
		if (!validation.isValid) {
			setError(validation.error);
			return;
		}

		if (platformState) {
			setStep("platforms");
			return;
		}
		await createBrand(null);
	};

	if (step === "platforms" && platformState) {
		return (
			<FullPageCard title={`设置 ${brandName}`} subtitle="选择要追踪的 AI 平台">
				<PlatformSelectionStep
					state={platformState}
					selected={selected}
					onSelectedChange={setSelected}
					disabled={isLoading}
					error={error}
					onBack={() => setStep("website")}
					onSubmit={() => createBrand([...selected])}
					submitLabel={isLoading ? "设置中…" : "完成设置"}
				/>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title={`设置 ${brandName}`} subtitle="配置你的品牌，开始使用" showBackButton={true}>
			<form action={handleWebsiteSubmit} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="website">网站</Label>
					<Input
						id="website"
						name="website"
						type="text"
						placeholder="example.com"
						required
						disabled={isLoading}
						value={website}
						onChange={(e) => setWebsite(e.target.value)}
					/>
					<p className="text-xs text-muted-foreground">输入你品牌的网站</p>
				</div>

				{error && (
					<p className="text-sm text-destructive">
						<WriteErrorMessage message={error} />
					</p>
				)}

				<Button type="submit" className="w-full" disabled={isLoading}>
					{isLoading ? "设置中…" : platformState ? "继续" : "完成设置"}
				</Button>
			</form>
		</FullPageCard>
	);
}
