/** Formatting helpers shared by every figure on the site. */

export function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function int(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function usd(value: number, compact = false): string {
  if (compact) {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    });
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function brl(value: number, compact = false): string {
  const formatted = value.toLocaleString("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  });
  return `R$${formatted}`;
}

export function days(value: number): string {
  return `${Math.round(value)}d`;
}

/** Sentence-case a snake_case or lower_case source label for display. */
export function label(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function monthLabel(iso: string): string {
  const [year, month] = iso.split("-");
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${names[Number(month) - 1]} ${year.slice(2)}`;
}
