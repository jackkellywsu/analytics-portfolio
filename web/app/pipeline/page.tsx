import type { Metadata } from "next";
import { PageHeader, PhaseBadge } from "@/components/ui/page-header";
import { Scaffold } from "@/components/ui/scaffold";
import { routeByHref } from "@/lib/routes";

const route = routeByHref("/pipeline")!;

export const metadata: Metadata = {
  title: route.title,
  description: route.blurb,
};

export default function Page() {
  return (
    <>
      <PageHeader
        eyebrow={route.group ?? undefined}
        title={route.title}
        blurb={route.blurb}
        status={<PhaseBadge phase={route.phase} />}
      />
      <Scaffold
        phase={route.phase}
        building={[
          "Win rate by client segment and deal size, with confidence intervals rather than bare percentages",
          "Sales-cycle distribution — where deals stall, not just how long they take on average",
          "Quota attainment by manager and rep, normalised for territory",
          "Stage-to-stage conversion funnel with cohort filtering, cross-filtered client-side",
        ]}
      />
    </>
  );
}
