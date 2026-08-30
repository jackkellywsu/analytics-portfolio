import { brl, days, int, pct, usd } from "./format";

/**
 * Named formatters.
 *
 * Charts are client components and the pages that use them are server
 * components, so a formatter cannot be passed across as a function — React
 * refuses to serialise one. Passing a name and resolving it on the client keeps
 * the pages server-rendered and keeps the payload to a string.
 */
export type FormatName =
  | "int"
  | "deals"
  | "pct"
  | "pct0"
  | "usd"
  | "usdCompact"
  | "brl"
  | "brlCompact"
  | "days";

export const FORMATTERS: Record<FormatName, (value: number) => string> = {
  int,
  deals: (v) => `${int(v)} deals`,
  pct: (v) => pct(v),
  pct0: (v) => pct(v, 0),
  usd: (v) => usd(v),
  usdCompact: (v) => usd(v, true),
  brl: (v) => brl(v),
  brlCompact: (v) => brl(v, true),
  days,
};
