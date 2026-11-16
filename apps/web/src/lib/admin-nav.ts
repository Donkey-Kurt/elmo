import { IconReport, IconTable, IconTimeline, IconTool, IconUsers } from "@tabler/icons-react";
import type { NavItem } from "@/components/nav-main";

export function adminNavItems({
	isAdmin,
	hasReportAccess,
	reportsEnabled,
}: {
	isAdmin: boolean;
	hasReportAccess: boolean;
	reportsEnabled: boolean;
}): NavItem[] {
	const reports: NavItem = { title: "报告", link: { to: "/reports" }, icon: IconReport };

	if (!isAdmin) return hasReportAccess && reportsEnabled ? [reports] : [];

	return [
		{ title: "品牌", link: { to: "/admin" }, icon: IconTable },
		...(reportsEnabled ? [reports] : []),
		{ title: "用户", link: { to: "/admin/users" }, icon: IconUsers },
		{ title: "工作流", link: { to: "/admin/workflows" }, icon: IconTimeline },
		{ title: "工具", link: { to: "/admin/tools" }, icon: IconTool },
	];
}
