// Human-friendly time formatters. Keep them here so all commands render
// the same way. Backend timestamps are ISO 8601 in UTC; we display
// absolute UTC for the record and relative time for the gut.

// "in 1h 47m" / "in 12m" / "in 45s" / "expired 3m ago". Bounded to
// minutes resolution; second-level precision isn't useful when the TTL
// is 2h and the timer is for human eyes.
export function formatRelative(
  expiresAtMs: number,
  nowMs: number = Date.now(),
): string {
  if (!expiresAtMs || isNaN(expiresAtMs)) return "unknown";
  const diffMs = expiresAtMs - nowMs;
  const absMin = Math.abs(Math.round(diffMs / 60_000));
  const absSec = Math.abs(Math.round(diffMs / 1000));
  const future = diffMs > 0;

  if (absSec < 60) {
    return future ? `in ${absSec}s` : `expired ${absSec}s ago`;
  }
  if (absMin < 60) {
    return future ? `in ${absMin}m` : `expired ${absMin}m ago`;
  }
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  return future ? `in ${h}h ${m}m` : `expired ${h}h ${m}m ago`;
}

// "in 1h 47m (2026-06-10 16:11 UTC)" — relative first, absolute in parens.
// Used wherever the CLI prints a future-tense timer. The relative form
// is what the builder needs at a glance; the absolute form is what
// they need to verify in a log.
export function formatTimerWithAbsolute(
  expiresAtMs: number,
  nowMs: number = Date.now(),
): string {
  if (!expiresAtMs || isNaN(expiresAtMs)) return "unknown";
  const abs = formatAbsolute(expiresAtMs);
  return `${formatRelative(expiresAtMs, nowMs)} (${abs})`;
}

// "2026-06-10 16:11 UTC" — same shape as before, just centralised. The
// backend returns full ISO 8601; this is the agreed display format.
export function formatAbsolute(iso: number | string): string {
  const d =
    typeof iso === "string" ? new Date(iso) : new Date(iso);
  if (isNaN(d.getTime())) return "unknown";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}
