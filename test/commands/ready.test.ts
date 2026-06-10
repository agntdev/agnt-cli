import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("ready", () => {
  beforeEach(() => {
    nock.cleanAll();
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  afterAll(() => {
    clearCredentials();
  });

  it("returns top claimable tasks across live projects", async () => {
    const scope = nock(API)
      .get(
        "/api/builder/tasks?sort=ton_reward&limit=5",
      )
      .reply(200, {
        tasks: [
          {
            id: "t1",
            slug: "T01",
            title: "Build Telegram bot scaffolding",
            difficulty: "medium",
            ton_reward_human: "12.5",
            ton_reward_nano: 12_500_000_000,
            project_slug: "my-bot",
            project_name: "My Bot",
            token_symbol: "MBOT",
            is_claimed: false,
            claimers_count: 0,
            claimers: [],
          },
          {
            id: "t2",
            slug: "T02",
            title: "Wire payments",
            difficulty: "hard",
            ton_reward_human: "8.0",
            ton_reward_nano: 8_000_000_000,
            project_slug: "my-bot",
            project_name: "My Bot",
            token_symbol: "MBOT",
            is_claimed: true,
            claimers_count: 2,
            claimers: [],
          },
        ],
        total: 2,
        available_sorts: ["ton_reward", "difficulty", "title"],
      });

    const { stdout, error } = await runCommand(["ready", "--json"]);
    expect(error).toBeUndefined();
    expect(scope.isDone()).toBe(true);

    const out = JSON.parse(stdout);
    expect(out.total).toBe(2);
    expect(out.tasks).toHaveLength(2);
    expect(out.available_sorts).toContain("ton_reward");
  });

  it("passes through sort, limit, and difficulty filters", async () => {
    const scope = nock(API)
      .get("/api/builder/tasks?sort=difficulty&limit=3&difficulty=easy")
      .reply(200, { tasks: [], total: 0 });

    const { error } = await runCommand([
      "ready",
      "--sort",
      "difficulty",
      "--limit",
      "3",
      "--difficulty",
      "easy",
    ]);
    expect(error).toBeUndefined();
    expect(scope.isDone()).toBe(true);
  });

  it("renders human output with claimable + claiming badges", async () => {
    nock(API)
      .get("/api/builder/tasks?sort=ton_reward&limit=5")
      .reply(200, {
        tasks: [
          {
            slug: "T01",
            title: "Add login",
            difficulty: "easy",
            ton_reward_human: "5.5",
            project_slug: "demo",
            project_name: "Demo",
            is_claimed: false,
            claimers_count: 0,
            claimers: [],
          },
          {
            slug: "T02",
            title: "Add dashboard",
            difficulty: "medium",
            ton_reward_human: "3.0",
            project_slug: "demo",
            project_name: "Demo",
            is_claimed: true,
            claimers_count: 2,
            claimers: [],
          },
        ],
      });

    const { stdout, error } = await runCommand(["ready"]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("T01");
    expect(stdout).toContain("Add login");
    expect(stdout).toContain("[open]");
    expect(stdout).toContain("[2 claiming]");
    expect(stdout).toContain("agnt task claim demo T01");
  });

  it("prints a friendly message when no claimable tasks exist", async () => {
    nock(API)
      .get("/api/builder/tasks?sort=ton_reward&limit=5")
      .reply(200, { tasks: [], total: 0 });

    const { stdout, error } = await runCommand(["ready"]);
    expect(error).toBeUndefined();
    expect(stdout).toMatch(/no claimable tasks/i);
  });

  it("exits 3 when not authenticated", async () => {
    const { clearCredentials } = await import("../../src/lib/auth.js");
    clearCredentials();
    const { error } = await runCommand(["ready"]);
    expect(error?.oclif?.exit).toBe(3);
  });

  it("exits 2 for --limit 0", async () => {
    const { error } = await runCommand(["ready", "--limit", "0"]);
    expect(error?.oclif?.exit).toBe(2);
  });

  it("exits 1 on API error", async () => {
    nock(API)
      .get("/api/builder/tasks?sort=ton_reward&limit=5")
      .reply(500, { error: "down" });
    const { error } = await runCommand(["ready"]);
    expect(error?.oclif?.exit).toBe(1);
  });

  it("overrides sort to +reward when --include-zero-reward is set", async () => {
    const scope = nock(API)
      .get("/api/builder/tasks?sort=%2Breward&limit=5")
      .reply(200, {
        tasks: [
          {
            slug: "S03T01",
            title: "Geo-pinned building comments (persisted)",
            difficulty: "hard",
            ton_reward_human: "0",
            project_slug: "satellitesnap",
            project_name: "SatelliteSnap",
            is_claimed: false,
            claimers_count: 0,
            claimers: [],
          },
          {
            slug: "T12",
            title: "QA, testing, and polish",
            difficulty: "medium",
            ton_reward_human: "1.224",
            project_slug: "aistudio",
            project_name: "AIStudio",
            is_claimed: false,
            claimers_count: 0,
            claimers: [],
          },
        ],
      });

    const { stdout, error } = await runCommand([
      "ready",
      "--include-zero-reward",
      "--json",
    ]);
    expect(error).toBeUndefined();
    expect(scope.isDone()).toBe(true);

    const out = JSON.parse(stdout);
    expect(out.tasks[0].slug).toBe("S03T01");
    expect(out.tasks[0].ton_reward_human).toBe("0");
  });

  it("renders stepping-stone badge for 0-TON tasks in human output", async () => {
    nock(API)
      .get("/api/builder/tasks?sort=%2Breward&limit=5")
      .reply(200, {
        tasks: [
          {
            slug: "S03T01",
            title: "Geo-pinned building comments (persisted)",
            difficulty: "hard",
            ton_reward_human: "0",
            project_slug: "satellitesnap",
            project_name: "SatelliteSnap",
            is_claimed: false,
            claimers_count: 0,
            claimers: [],
          },
        ],
      });

    const { stdout, error } = await runCommand(["ready", "--include-zero-reward"]);
    expect(error).toBeUndefined();
    expect(stdout).toContain("stepping stone");
    expect(stdout).toContain("S03T01");
    expect(stdout).toContain("0 TON");
  });
});
