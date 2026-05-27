import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { saveCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("project", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  describe("list", () => {
    it("returns projects", async () => {
      nock(API)
        .get("/api/builder/projects?limit=20")
        .reply(200, {
          projects: [
            { id: "proj_1", name: "DeFi Aggregator", status: "live" },
            { id: "proj_2", name: "CLI Tool", status: "draft" },
          ],
          total: 2,
        });

      const { stdout, error } = await runCommand(["project", "list", "--json"]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.projects).toHaveLength(2);
      expect(out.projects[0].id).toBe("proj_1");
    });

    it("filters by status", async () => {
      const scope = nock(API)
        .get("/api/builder/projects?limit=20&status=live")
        .reply(200, { projects: [], total: 0 });

      await runCommand(["project", "list", "--status", "live", "--json"]);
      expect(scope.isDone()).toBe(true);
    });

    it("exits 2 for --limit 0", async () => {
      const { error } = await runCommand(["project", "list", "--limit", "0"]);
      expect(error?.oclif?.exit).toBe(2);
    });

    it("exits 1 on API error", async () => {
      nock(API)
        .get("/api/builder/projects?limit=20")
        .reply(500, { error: "down" });
      const { error } = await runCommand(["project", "list"]);
      expect(error?.oclif?.exit).toBe(1);
    });
  });

  describe("show", () => {
    it("returns project by id", async () => {
      nock(API).get("/api/builder/projects/proj_abc").reply(200, {
        id: "proj_abc",
        name: "My Project",
        status: "live",
      });

      const { stdout, error } = await runCommand([
        "project",
        "show",
        "proj_abc",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.id).toBe("proj_abc");
    });

    it("exits 4 when not found", async () => {
      nock(API)
        .get("/api/builder/projects/nope")
        .reply(404, { error: "not_found" });
      const { error } = await runCommand(["project", "show", "nope"]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("requires project id", async () => {
      const { error } = await runCommand(["project", "show"]);
      expect(error?.oclif?.exit).toBe(2);
    });
  });

  describe("create", () => {
    beforeEach(() => {
      saveCredentials({ token: "amk_test", agent_id: "agent-1" });
    });

    it("creates a project with explicit wallet", async () => {
      const scope = nock(API)
        .post(
          "/api/builder/projects",
          (body) => body.owner_wallet_address === "0:abc",
        )
        .matchHeader("authorization", /^Bearer amk_/)
        .reply(200, {
          project: { id: "proj_new", name: "MyProj", status: "draft" },
          task_count: 3,
          next_step: "Review tasks",
        });

      const { stdout, error } = await runCommand([
        "project",
        "create",
        "BuildX",
        "--name",
        "MyProj",
        "--owner_wallet_address",
        "0:abc",
        "--json",
      ]);

      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.project.id).toBe("proj_new");
      expect(out.task_count).toBe(3);
      expect(scope.isDone()).toBe(true);
    });

    it("auto-resolves wallet from whoami", async () => {
      nock(API)
        .get("/api/builder/agents/me")
        .reply(200, {
          agent: { id: "agent-1", ton_wallet_address: "0:def456" },
        });

      const scope = nock(API)
        .post(
          "/api/builder/projects",
          (body) => body.owner_wallet_address === "0:def456",
        )
        .reply(200, {
          project: { id: "proj_auto", name: "Auto", status: "draft" },
          task_count: 5,
          next_step: "Review",
        });

      const { stdout, error } = await runCommand([
        "project",
        "create",
        "AutoIdea",
        "--name",
        "Auto",
        "--json",
      ]);

      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.project.id).toBe("proj_auto");
      expect(scope.isDone()).toBe(true);
    });

    it("errors when no wallet found", async () => {
      nock(API)
        .get("/api/builder/agents/me")
        .reply(200, {
          agent: { id: "agent-1" },
        });

      const { error } = await runCommand([
        "project",
        "create",
        "NoWalletIdea",
        "--name",
        "NoWallet",
      ]);

      expect(error?.oclif?.exit).toBe(2);
    });
  });

  describe("fund", () => {
    beforeEach(() => {
      saveCredentials({ token: "amk_test", agent_id: "agent-1" });
    });

    it("exits 3 when not authenticated", async () => {
      // clear credentials set in beforeEach
      const { clearCredentials } = await import("../../src/lib/auth.js");
      clearCredentials();

      const { error } = await runCommand(["project", "fund", "proj_1"]);
      expect(error?.oclif?.exit).toBe(3);
    });

    it("exits 4 when project not found", async () => {
      nock(API)
        .get("/api/builder/projects/nope")
        .reply(404, { error: "not_found" });

      const { error } = await runCommand(["project", "fund", "nope"]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("exits 2 when project has no TON reward pool", async () => {
      nock(API)
        .get("/api/builder/projects/proj_1")
        .reply(200, {
          project: {
            id: "proj_1",
            name: "Token Only",
            ton_reward_pool_nano: 0,
          },
        });

      const { error } = await runCommand(["project", "fund", "proj_1"]);
      expect(error?.oclif?.exit).toBe(2);
    });

    it("returns already_funded when pool already funded", async () => {
      nock(API)
        .get("/api/builder/projects/proj_1")
        .reply(200, {
          project: {
            id: "proj_1",
            name: "Funded Project",
            ton_reward_pool_nano: 500000000,
            ton_pool_funded_at: "2026-01-15T00:00:00Z",
            funding_address: "0:funded_addr",
          },
        });

      const { stdout, error } = await runCommand([
        "project",
        "fund",
        "proj_1",
        "--json",
      ]);

      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.status).toBe("already_funded");
      expect(out.project_id).toBe("proj_1");
    });

    it("exits 1 on API error", async () => {
      nock(API)
        .get("/api/builder/projects/proj_1")
        .reply(500, { error: "down" });

      const { error } = await runCommand(["project", "fund", "proj_1"]);
      expect(error?.oclif?.exit).toBe(1);
    });

    it("shows manual instructions when no wallet connected", async () => {
      nock(API)
        .get("/api/builder/projects/proj_1")
        .reply(200, {
          project: {
            id: "proj_1",
            name: "Unfunded",
            ton_reward_pool_nano: 500000000,
            funding_address: "0:fundme_addr",
            funding_amount_nano: 500000000,
          },
        });

      // No wallet → falls through to manual instructions, exits 0
      const { stdout, error } = await runCommand([
        "project",
        "fund",
        "proj_1",
        "--json",
      ]);

      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.funding_address).toBe("0:fundme_addr");
      expect(out.amount_nano).toBe(500000000);
    });

    it("shows manual instructions with --manual flag", async () => {
      nock(API)
        .get("/api/builder/projects/proj_1")
        .reply(200, {
          project: {
            id: "proj_1",
            name: "Unfunded",
            ton_reward_pool_nano: 1000000000,
            funding_address: "0:fundme_addr",
            funding_amount_nano: 1000000000,
          },
        });

      const { stdout, error } = await runCommand([
        "project",
        "fund",
        "proj_1",
        "--manual",
        "--json",
      ]);

      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.funding_address).toBe("0:fundme_addr");
      expect(out.amount_ton).toBe("1.000000000");
      expect(out.next_step).toContain("project confirm-fund");
    });
  });

  describe("confirm-fund", () => {
    beforeEach(() => {
      saveCredentials({ token: "amk_test", agent_id: "agent-1" });
    });

    it("exits 3 when not authenticated", async () => {
      const { clearCredentials } = await import("../../src/lib/auth.js");
      clearCredentials();

      const { error } = await runCommand([
        "project",
        "confirm-fund",
        "proj_1",
        "--tx-hash",
        "abc123",
      ]);
      expect(error?.oclif?.exit).toBe(3);
    });

    it("exits 4 when project not found", async () => {
      nock(API)
        .get("/api/builder/projects/nope")
        .reply(404, { error: "not_found" });

      const { error } = await runCommand([
        "project",
        "confirm-fund",
        "nope",
        "--tx-hash",
        "abc123",
      ]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("returns already_funded when pool already funded", async () => {
      nock(API)
        .get("/api/builder/projects/proj_1")
        .reply(200, {
          project: {
            id: "proj_1",
            name: "Already Funded",
            ton_pool_funded_at: "2026-01-15T00:00:00Z",
          },
        });

      const { stdout, error } = await runCommand([
        "project",
        "confirm-fund",
        "proj_1",
        "--tx-hash",
        "abc123",
        "--json",
      ]);

      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.status).toBe("already_funded");
      expect(out.project_id).toBe("proj_1");
    });

    it("confirms deposit successfully", async () => {
      nock(API)
        .get("/api/builder/projects/proj_1")
        .reply(200, {
          project: {
            id: "proj_1",
            name: "Unfunded",
            ton_reward_pool_nano: 500000000,
          },
        });

      const scope = nock(API)
        .post(
          "/api/builder/admin/projects/proj_1/confirm-ton-deposit",
          (body) => body.tx_hash === "abc123",
        )
        .reply(200, { ok: true });

      const { stdout, error } = await runCommand([
        "project",
        "confirm-fund",
        "proj_1",
        "--tx-hash",
        "abc123",
        "--json",
      ]);

      expect(error).toBeUndefined();
      const out = JSON.parse(stdout);
      expect(out.status).toBe("funded");
      expect(out.tx_hash).toBe("abc123");
      expect(scope.isDone()).toBe(true);
    });

    it("exits 4 when deposit tx not found by API", async () => {
      nock(API)
        .get("/api/builder/projects/proj_1")
        .reply(200, {
          project: {
            id: "proj_1",
            name: "Unfunded",
            ton_reward_pool_nano: 500000000,
          },
        });

      nock(API)
        .post("/api/builder/admin/projects/proj_1/confirm-ton-deposit")
        .reply(404, { error: "not_found" });

      const { error } = await runCommand([
        "project",
        "confirm-fund",
        "proj_1",
        "--tx-hash",
        "badhash",
      ]);

      expect(error?.oclif?.exit).toBe(4);
    });

    it("exits 1 on API error during confirmation", async () => {
      nock(API)
        .get("/api/builder/projects/proj_1")
        .reply(200, {
          project: {
            id: "proj_1",
            name: "Unfunded",
            ton_reward_pool_nano: 500000000,
          },
        });

      nock(API)
        .post("/api/builder/admin/projects/proj_1/confirm-ton-deposit")
        .reply(500, { error: "internal" });

      const { error } = await runCommand([
        "project",
        "confirm-fund",
        "proj_1",
        "--tx-hash",
        "abc123",
      ]);

      expect(error?.oclif?.exit).toBe(1);
    });
  });
});
