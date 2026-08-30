import type { Metadata } from "next";
import { PageHeader, PhaseBadge } from "@/components/ui/page-header";
import { Scaffold } from "@/components/ui/scaffold";
import { routeByHref } from "@/lib/routes";

const route = routeByHref("/guardrails")!;

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
          "The full prompt framework, published rather than described",
          "Input screening: intent classification, prompt-injection detection, PII detection",
          "SQL validation: AST parsing, SELECT-only enforcement, table and column allowlists, forced limits",
          "A red-team panel of adversarial cases you can fire yourself and watch trip a specific layer",
        ]}
      />
    </>
  );
}
