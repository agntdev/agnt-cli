import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

describe("stats", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it("returns platform stats", async () => {
    nock(API)
      .get("/api/builder/stats")
      .reply(200, {
        counts: { live_projects: 5, completed_projects: 10 },
        tokens_total: 5000,
        daily_activity: [],
        as_of_utc: "2026-01-01T00:00:00Z",
        window_days: 14,
      });

    const { stdout, error } = await runCommand(["stats", "--json"]);
    expect(error).toBeUndefined();

    const out = JSON.parse(stdout);
    expect(out.counts.live_projects).toBe(5);
    expect(out.tokens_total).toBe(5000);
  });

  it("exits 1 on API error", async () => {
    nock(API).get("/api/builder/stats").reply(500, { error: "down" });

    const { error } = await runCommand(["stats"]);
    expect(error?.oclif?.exit).toBe(1);
  });
});
