import type { Metadata } from "next";
import { PageHeader, PhaseBadge } from "@/components/ui/page-header";
import { Scaffold } from "@/components/ui/scaffold";
import { routeByHref } from "@/lib/routes";

const route = routeByHref("/ask")!;

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
          "Natural-language question to SQL, translated against a published semantic layer",
          "Query execution in your browser via DuckDB-WASM — the data never leaves your machine",
          "The generated SQL, the metric definitions used, row count, and execution time, shown with every answer",
          "Deliberate refusals when the layer genuinely cannot answer the question",
        ]}
      />
    </>
  );
}
