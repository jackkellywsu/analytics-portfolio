import manifestJson from "@/public/data/manifest.json";

/**
 * Shapes mirroring what `pipeline/build_manifest.py` emits. The manifest is
 * generated from the Parquet files themselves, so anything rendered from these
 * types is describing the data that actually shipped rather than a hand-written
 * claim about it.
 */

export type QualityRule = {
  rule: string;
  description: string;
  rows_affected: number;
  before: string | null;
  after: string | null;
  severity: "fixed" | "flagged" | "dropped";
};

export type QualityLog = {
  dataset: string;
  rows_in: number;
  rows_out: number;
  rules: QualityRule[];
};

export type Column = { name: string; type: string };

export type Table = {
  name: string;
  domain: "crm" | "funnel" | "commerce";
  source: string;
  grain: string;
  description: string;
  file: string;
  bytes: number;
  rows: number;
  columns: Column[];
  quality: QualityLog | null;
};

export type SourceFile = {
  name: string;
  bytes: number;
  sha256: string;
  rows: number;
  columns: string[];
};

export type Source = {
  key: string;
  source: string;
  url: string;
  slug: string;
  nature: "real" | "synthetic";
  pulled_at: string;
  cache_path: string;
  files: SourceFile[];
  notes: string;
  gaps: string[];
};

export type Manifest = {
  generated_at: string;
  total_bytes: number;
  tables: Table[];
  sources: Source[];
};

export const manifest = manifestJson as unknown as Manifest;

export const DOMAIN_LABELS: Record<Table["domain"], string> = {
  crm: "Sales pipeline",
  funnel: "Acquisition funnel",
  commerce: "Client activity",
};

export function tablesByDomain(): Array<[Table["domain"], Table[]]> {
  const order: Table["domain"][] = ["crm", "funnel", "commerce"];
  return order.map((domain) => [
    domain,
    manifest.tables.filter((t) => t.domain === domain),
  ]);
}

export function sourceByKey(key: string): Source | undefined {
  return manifest.sources.find((s) => s.key === key);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
