/**
 * Build-time loaders for pipeline output.
 *
 * Every number on this site comes from a file the pipeline generated. Nothing is
 * typed in by hand, so a figure on a page cannot drift from the record that backs
 * it -- if the pipeline reruns and a count changes, the page changes with it.
 *
 * These run in Node at build time, never in the browser.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, parse } from 'node:path';

/**
 * Locate the repository root by walking up from the working directory looking for
 * SPEC.md. Deriving it from `import.meta.url` does not survive bundling, and a wrong
 * root fails in the worst possible way: every loader returns null, every page renders
 * its "no data yet" state, and the build succeeds. That is precisely the silent-wrong
 * failure this project exists to argue against, so a missing root throws.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'SPEC.md'))) return dir;
    const up = dirname(dir);
    if (up === dir || dir === parse(dir).root) {
      throw new Error(
        `Could not locate the repository root (no SPEC.md found walking up from ${process.cwd()}). ` +
          'Refusing to build with unresolvable data paths.'
      );
    }
    dir = up;
  }
}

const REPO_ROOT = findRepoRoot();

/**
 * Read a pipeline output file. A missing file returns null, which is a legitimate
 * state -- a source that has not been acquired yet has no record, and pages render an
 * honest empty state for it. Malformed JSON is not legitimate and throws.
 */
function readJson<T>(relativePath: string): T | null {
  const full = join(REPO_ROOT, relativePath);
  if (!existsSync(full)) return null;
  return JSON.parse(readFileSync(full, 'utf-8')) as T;
}

export interface TableRecord {
  table: string;
  archive: string | null;
  member: string;
  columns: string[];
  record_count: number | null;
  count_method: string;
  notes: string[];
}

export interface FileRecord {
  filename: string;
  size_bytes: number;
  sha256: string;
  tables: TableRecord[];
}

export interface Provenance {
  source_name: string;
  source_url: string;
  access_method: string;
  retrieved_at: string;
  release_version: string | null;
  files: FileRecord[];
  known_gaps: string[];
  notes: string[];
}

export interface SectorCode {
  code: string;
  official_title: string;
  match_prefix: string;
  level: 'subclass' | 'group';
  why: string;
}

export interface Sector {
  label: string;
  thesis: string;
  codes: SectorCode[];
  excluded_codes: { code: string; official_title: string; why: string }[];
}

export interface SectorMap {
  version: string;
  firm: string;
  cpc_edition: string;
  cpc_source: string;
  cpc_symbols_in_scheme: number;
  cpc_subclasses_in_scheme: number;
  subclasses_mapped: number;
  subclass_coverage_pct: number;
  cross_sector_prefix_collisions: Record<string, string[]>;
  decisions: { id: string; decision: string; rationale: string; consequence: string }[];
  sectors: Record<string, Sector>;
  known_limitations: string[];
}

/** The CPC sector mapping. Present once `pipeline.build_sector_map` has run. */
export const sectorMap = readJson<SectorMap>('pipeline/processed/sector_cpc_map.json');

/** Provenance for the CPC scheme used to validate that mapping. */
export const cpcProvenance = readJson<Provenance>('docs/provenance/cpc-title-list.json');

/**
 * Provenance for the USPTO patent tables. Null until the bulk files are downloaded
 * and inspected -- pages must render an honest "not yet acquired" state rather than
 * inventing numbers. See SPEC.md 1.1.
 */
export const patentProvenance = readJson<Provenance>('docs/provenance/uspto-pvgpatdis.json');

export function formatCount(n: number | null | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('en-US') : '—';
}

export function formatBytes(n: number): string {
  const mib = n / (1024 * 1024);
  return mib >= 1024 ? `${(mib / 1024).toFixed(2)} GiB` : `${mib.toFixed(1)} MiB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
