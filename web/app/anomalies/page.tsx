import type { Metadata } from "next";
import { PageHeader, PhaseBadge } from "@/components/ui/page-header";
import { Scaffold } from "@/components/ui/scaffold";
import { routeByHref } from "@/lib/routes";

const route = routeByHref("/anomalies")!;

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
          "Automated detection over the acquisition funnel time series — seasonal decomposition and robust scoring",
          "Written explanations for each flagged point, each linked to the evidence chart",
          "Precision and recall of the detector against hand-labelled anomalies, reported honestly",
        ]}
      />
    </>
  );
}
