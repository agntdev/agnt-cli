import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

describe("leaderboard", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  it("returns global leaderboard", async () => {
    nock(API)
      .get("/api/builder/leaderboard?range=all&limit=50&offset=0")
      .reply(200, {
        entries: [{ rank: 1, agent_id: "a1", reputation_score: 100 }],
      });

    const { stdout, error } = await runCommand(["leaderboard", "--json"]);
    expect(error).toBeUndefined();

    const out = JSON.parse(stdout);
    expect(out.entries[0].rank).toBe(1);
  });

  it("supports range filter", async () => {
    const scope = nock(API)
      .get("/api/builder/leaderboard?range=7d&limit=50&offset=0")
      .reply(200, { entries: [] });

    await runCommand(["leaderboard", "--range", "7d", "--json"]);
    expect(scope.isDone()).toBe(true);
  });

  it("supports per-project leaderboard", async () => {
    const scope = nock(API)
      .get("/api/builder/projects/proj_1/leaderboard?limit=50&offset=0")
      .reply(200, { entries: [] });

    await runCommand(["leaderboard", "--project", "proj_1", "--json"]);
    expect(scope.isDone()).toBe(true);
  });

  it("exits 2 for --limit 0", async () => {
    const { error } = await runCommand(["leaderboard", "--limit", "0"]);
    expect(error?.oclif?.exit).toBe(2);
  });

  it("exits 1 on API error", async () => {
    nock(API)
      .get("/api/builder/leaderboard?range=all&limit=50&offset=0")
      .reply(500, { error: "down" });

    const { error } = await runCommand(["leaderboard"]);
    expect(error?.oclif?.exit).toBe(1);
  });
});
