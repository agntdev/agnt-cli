import { runCommand } from "@oclif/test";
import { describe, it, expect } from "vitest";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

describe("task show (v0.13.0: spec_body always)", () => {
  describe("default", () => {
    it("returns task details JSON with --json", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            body_md: "# Login\nImplement OAuth",
            spec_body: "## Spec\nImplement /login OAuth flow.",
            status: "open",
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "show",
        "proj_abc",
        "T01",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.task.slug).toBe("T01");
      expect(out.task.body_md).toContain("OAuth");
    });

    it("default human output shows spec_body as the headline, body_md as a stub", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            body_md: "Short: /login OAuth (§3)",
            spec_body: "## Full contract text\n\nLots of detail here.",
            status: "open",
            claimers: [],
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "show",
        "proj_abc",
        "T01",
      ]);
      expect(error).toBeUndefined();
      // Title is the heading.
      expect(stdout).toContain("# Add login");
      // spec_body is labelled and shown.
      expect(stdout).toContain("the actual contract");
      expect(stdout).toContain("## Full contract text");
      // body_md is shown as a dim stub below.
      expect(stdout).toContain("Short: /login OAuth (§3)");
      // JSON tail is included so scripts can parse structured fields.
      expect(stdout).toContain('"slug": "T01"');
    });

    it("falls back to body_md on older servers (pre-#119, no spec_body)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            body_md: "# Old server body_md",
            status: "open",
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "show",
        "proj_abc",
        "T01",
      ]);
      expect(error).toBeUndefined();
      // We render body_md as the contract with a fallback label.
      expect(stdout).toContain("older server");
      expect(stdout).toContain("# Old server body_md");
    });
  });

  describe("removed flags", () => {
    it("--body flag is gone (rejected as unknown flag)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: { slug: "T01", title: "x", body_md: "x", status: "open" },
        });

      const { error } = await runCommand([
        "task",
        "show",
        "proj_abc",
        "T01",
        "--body",
      ]);
      expect(error?.oclif?.exit).toBeGreaterThanOrEqual(1);
    });

    it("--spec flag is gone (rejected as unknown flag)", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: { slug: "T01", title: "x", body_md: "x", status: "open" },
        });

      const { error } = await runCommand([
        "task",
        "show",
        "proj_abc",
        "T01",
        "--spec",
      ]);
      expect(error?.oclif?.exit).toBeGreaterThanOrEqual(1);
    });
  });

  describe("error paths", () => {
    it("exits 4 when not found", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T99")
        .reply(404, { error: "not_found" });
      const { error } = await runCommand(["task", "show", "proj_abc", "T99"]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("requires args", async () => {
      const { error } = await runCommand(["task", "show"]);
      expect(error?.oclif?.exit).toBe(2);
    });
  });
});
