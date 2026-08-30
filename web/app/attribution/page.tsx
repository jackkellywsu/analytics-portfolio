import type { Metadata } from "next";
import { PageHeader, PhaseBadge } from "@/components/ui/page-header";
import { Scaffold } from "@/components/ui/scaffold";
import { routeByHref } from "@/lib/routes";

const route = routeByHref("/attribution")!;

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
          "Cost and volume by acquisition channel, joined to the revenue those clients actually generated afterwards",
          "Time-to-close distribution by lead source and segment",
          "A transparent prospect score with adjustable weights — every score decomposes into its components",
          "A written limitations section covering what the proxy signals can and cannot tell you",
        ]}
      />
    </>
  );
}
