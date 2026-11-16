import type { MissingEnvVar } from "@workspace/config/env";
import type { DeploymentMode } from "@workspace/config/types";
import FullPageCard from "@/components/full-page-card";

interface MissingEnvPageProps {
	mode: DeploymentMode;
	missing: MissingEnvVar[];
}

export default function MissingEnvPage({ mode, missing }: MissingEnvPageProps) {
	const sortedMissing = [...missing].sort((a, b) => a.label.localeCompare(b.label));

	const localHint =
		mode === "local" ? "请通过 CLI 设置这些环境变量。" : "请在部署环境中设置这些环境变量，然后重新部署或重启。";

	return (
		<FullPageCard title="缺少环境配置" subtitle={`部署模式：${mode}`} className="max-w-2xl">
			<div className="space-y-4 text-sm">
				<p>{localHint}</p>
				<ul className="space-y-3 rounded-md border bg-background p-4">
					{sortedMissing.map((item) => (
						<li key={item.id} className="flex flex-col gap-1">
							<span className="font-mono text-xs text-foreground">{item.label}</span>
							{item.description ? <span className="text-muted-foreground">{item.description}</span> : null}
						</li>
					))}
				</ul>
			</div>
		</FullPageCard>
	);
}
