import {runCommand} from "@oclif/test";
import {describe, it, expect, beforeEach, afterEach} from "vitest";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import nock from "nock";

const API = "https://api.agnt-gm.ai";

describe("bot logs", () => {
  let tmpDir: string;

  beforeEach(() => {
    nock.cleanAll();
    tmpDir = mkdtempSync(join(tmpdir(), "agnt-bot-logs-"));
  });

  afterEach(() => {
    rmSync(tmpDir, {recursive: true, force: true});
  });

  it("saves the build log to the default path", async () => {
    const logBody = [
      "===== build d_1 | sha=abc | OK | 2026-06-17T00:00:00Z =====",
      "npm install",
      "tsc -b",
      "===== build d_2 | sha=def | FAILED | 2026-06-17T00:01:00Z =====",
      "error TS2304: cannot find name 'foo'",
    ].join("\n");

    nock(API)
      .get("/api/builder/projects/habitdash/logs")
      .reply(200, logBody, {"Content-Type": "text/plain"});

    const out = await runCommand([
      "bot:logs",
      "habitdash",
      "--output",
      join(tmpDir, "out.log"),
    ]);

    expect(out.error).toBeUndefined();
    const saved = readFileSync(join(tmpDir, "out.log"), "utf8");
    expect(saved).toContain("TS2304");
    expect(saved).toContain("build d_2");
  });

  it("returns exit 2 with a helpful message on 404 (no logs yet)", async () => {
    nock(API)
      .get("/api/builder/projects/habitdash/logs")
      .reply(404, "no logs");

    const out = await runCommand([
      "bot:logs",
      "habitdash",
      "--output",
      join(tmpDir, "out.log"),
    ]);

    expect(out.error).toBeDefined();
    expect(String(out.error?.message)).toMatch(/No logs available/);
    expect(out.error?.oclif?.exit).toBe(2);
  });

  it("truncates to --tail N when set", async () => {
    const logBody = Array.from({length: 50}, (_, i) => `line ${i + 1}`).join(
      "\n",
    );
    nock(API)
      .get("/api/builder/projects/habitdash/logs")
      .reply(200, logBody, {"Content-Type": "text/plain"});

    await runCommand([
      "bot:logs",
      "habitdash",
      "--tail",
      "5",
      "--output",
      join(tmpDir, "out.log"),
    ]);

    const saved = readFileSync(join(tmpDir, "out.log"), "utf8").trim();
    expect(saved.split("\n")).toHaveLength(5);
    expect(saved).toBe("line 46\nline 47\nline 48\nline 49\nline 50");
  });
});
