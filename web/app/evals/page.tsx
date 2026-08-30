import type { Metadata } from "next";
import { PageHeader, PhaseBadge } from "@/components/ui/page-header";
import { Scaffold } from "@/components/ui/scaffold";
import { routeByHref } from "@/lib/routes";

const route = routeByHref("/evals")!;

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
          "Around 200 hand-authored text-to-SQL cases with gold queries, tiered by difficulty",
          "Three models across three prompt conditions, scored on execution accuracy with Wilson confidence intervals",
          "Paired bootstrap and McNemar tests for model and prompt comparisons",
          "Error taxonomy heatmap: error type against difficulty tier",
          "Extraction consistency on labelled complaint narratives — macro-F1, Krippendorff alpha, calibration and Brier score",
          "Case-level drilldown: the question, the gold SQL, the model SQL, both result sets, and the error label",
        ]}
      />
    </>
  );
}
