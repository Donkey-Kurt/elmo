import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "@/components/full-page-card";
import { OrganizationDirectory } from "@/components/organization-directory";
import { invalidateOrganizations, organizationsQuery } from "@/lib/organizations/queries";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { pageHead } from "@/lib/route-head";
import { syncOrganizationMembershipsFn } from "@/server/organizations";

function OrganizationPickerSkeleton() {
	return (
		<FullPageCard title="" subtitle="">
			<div className="flex min-w-[200px] flex-col space-y-3">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		</FullPageCard>
	);
}

export const Route = createFileRoute("/_authed/app/")({
	pendingComponent: OrganizationPickerSkeleton,
	loader: async ({ context }): Promise<OrganizationSummary[]> => {
		// Only whitelabel keeps memberships anywhere else, and asking elsewhere is
		// a round trip that returns false in front of this page's only real read.
		if (context.clientConfig?.mode === "whitelabel" && (await syncOrganizationMembershipsFn())) {
			await invalidateOrganizations(context.queryClient);
		}
		return (await context.queryClient.ensureQueryData(organizationsQuery)).organizations;
	},
	head: pageHead({ title: "Organizations and Brands", description: "Modify organizations or navigate to brands." }),
	component: OrganizationPickerPage,
});

function OrganizationPickerPage() {
	const organizations = Route.useLoaderData();

	if (organizations.length === 0) {
		return (
			<FullPageCard title="没有组织" subtitle="你的账户还不属于任何组织。">
				<p className="text-center text-muted-foreground">请管理员邀请你，然后刷新本页。</p>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="组织与品牌" subtitle="管理组织或进入品牌。">
			<OrganizationDirectory organizations={organizations} />
		</FullPageCard>
	);
}
