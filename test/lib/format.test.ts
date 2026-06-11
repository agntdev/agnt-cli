import { describe, it, expect } from "vitest";
import {
  formatRelative,
  formatTimerWithAbsolute,
  formatAbsolute,
} from "../../src/lib/format.js";

describe("formatRelative", () => {
  it("returns 'in 47m' for a 47-minute future delta", () => {
    const now = Date.parse("2026-06-10T14:00:00Z");
    const exp = now + 47 * 60_000;
    expect(formatRelative(exp, now)).toBe("in 47m");
  });

  it("returns 'in 1h 5m' for a 65-minute future delta", () => {
    const now = Date.parse("2026-06-10T14:00:00Z");
    const exp = now + 65 * 60_000;
    expect(formatRelative(exp, now)).toBe("in 1h 5m");
  });

  it("returns 'in 1h 47m' for a 107-minute future delta", () => {
    const now = Date.parse("2026-06-10T14:00:00Z");
    const exp = now + 107 * 60_000;
    expect(formatRelative(exp, now)).toBe("in 1h 47m");
  });

  it("returns 'in 45s' for a 45-second future delta", () => {
    const now = Date.parse("2026-06-10T14:00:00Z");
    const exp = now + 45_000;
    expect(formatRelative(exp, now)).toBe("in 45s");
  });

  it("returns 'expired 3m ago' for a 3-minute past delta", () => {
    const now = Date.parse("2026-06-10T14:00:00Z");
    const exp = now - 3 * 60_000;
    expect(formatRelative(exp, now)).toBe("expired 3m ago");
  });

  it("returns 'expired 2h 5m ago' for a 125-minute past delta", () => {
    const now = Date.parse("2026-06-10T14:00:00Z");
    const exp = now - 125 * 60_000;
    expect(formatRelative(exp, now)).toBe("expired 2h 5m ago");
  });

  it("returns 'unknown' for NaN", () => {
    expect(formatRelative(NaN, Date.now())).toBe("unknown");
  });

  it("returns 'unknown' for zero", () => {
    expect(formatRelative(0, Date.now())).toBe("unknown");
  });
});

describe("formatTimerWithAbsolute", () => {
  it("pairs the relative form with the absolute UTC", () => {
    const now = Date.parse("2026-06-10T14:00:00Z");
    const exp = now + 107 * 60_000; // 1h 47m
    const expIso = new Date(exp).toISOString();
    expect(formatTimerWithAbsolute(exp, now)).toBe(
      "in 1h 47m (2026-06-10 15:47 UTC)",
    );
    // Sanity: the absolute half matches what formatAbsolute produces.
    expect(formatTimerWithAbsolute(exp, now)).toContain(
      formatAbsolute(expIso),
    );
  });
});

describe("formatAbsolute", () => {
  it("renders ISO 8601 as 'YYYY-MM-DD HH:MM UTC'", () => {
    expect(formatAbsolute("2026-06-10T15:47:00Z")).toBe(
      "2026-06-10 15:47 UTC",
    );
  });

  it("returns 'unknown' on bad input", () => {
    expect(formatAbsolute("not-a-date")).toBe("unknown");
  });
});
