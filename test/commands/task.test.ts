import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import nock from "nock";
import { saveCredentials, clearCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("task", () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    clearCredentials();
  });

  describe("list", () => {
    it("returns tasks", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks")
        .reply(200, {
          tasks: [
            { slug: "T01", title: "Add login", status: "open" },
            { slug: "T02", title: "Add dashboard", status: "in_progress" },
          ],
        });

      const { stdout, error } = await runCommand([
        "task",
        "list",
        "proj_abc",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.tasks).toHaveLength(2);
      expect(out.tasks[0].slug).toBe("T01");
    });

    it("filters by status", async () => {
      const scope = nock(API)
        .get("/api/builder/projects/proj_abc/tasks?status=open")
        .reply(200, { tasks: [] });

      await runCommand([
        "task",
        "list",
        "proj_abc",
        "--status",
        "open",
        "--json",
      ]);
      expect(scope.isDone()).toBe(true);
    });

    it("requires project id", async () => {
      const { error } = await runCommand(["task", "list"]);
      expect(error?.oclif?.exit).toBe(2);
    });

    it("exits 1 on API error", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks")
        .reply(500, { error: "down" });
      const { error } = await runCommand(["task", "list", "proj_abc"]);
      expect(error?.oclif?.exit).toBe(1);
    });

    it("filters to claimable only via /dag when --claimable is set", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/dag")
        .reply(200, {
          project_id: "proj_abc",
          project_slug: "proj_abc",
          current_phase: "dev",
          phase_status: "active",
          tasks: [
            {
              slug: "T01",
              title: "Add login",
              task_kind: "foundation",
              phase: "dev",
              status: "open",
              depends_on: [],
              claimable: true,
            },
            {
              slug: "T02",
              title: "Add dashboard",
              task_kind: "feature",
              phase: "dev",
              status: "open",
              depends_on: ["T01"],
              claimable: false,
              claim_reason: "blocked by T01 (not merged)",
            },
            {
              slug: "T03",
              title: "Polish",
              task_kind: "feature",
              phase: "dev",
              status: "open",
              depends_on: ["T01"],
              claimable: true,
            },
          ],
        });

      const { stdout, error } = await runCommand([
        "task",
        "list",
        "proj_abc",
        "--claimable",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.filter).toBe("claimable");
      expect(out.current_phase).toBe("dev");
      expect(out.total).toBe(2);
      expect(out.tasks.map((t: { slug: string }) => t.slug)).toEqual([
        "T01",
        "T03",
      ]);
    });

    it("exits 4 when project not found with --claimable", async () => {
      nock(API)
        .get("/api/builder/projects/nope/dag")
        .reply(404, { error: "not_found" });
      const { error } = await runCommand([
        "task",
        "list",
        "nope",
        "--claimable",
      ]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("exits 1 on /dag API error with --claimable", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/dag")
        .reply(500, { error: "down" });
      const { error } = await runCommand([
        "task",
        "list",
        "proj_abc",
        "--claimable",
      ]);
      expect(error?.oclif?.exit).toBe(1);
    });

    it("filters to my claims via per-task /tasks/:slug when --mine is set", async () => {
      // --mine requires auth to know which claims are ours.
      saveCredentials({ token: "amk_test", agent_id: "agent-1" });

      // /dag returns the full task list
      const scope = nock(API)
        .get("/api/builder/projects/proj_abc/dag")
        .reply(200, {
          project_slug: "proj_abc",
          current_phase: "design",
          phase_status: "active",
          tasks: [
            { slug: "T01", title: "Add login", claimable: true },
            { slug: "T02", title: "Add dashboard", claimable: true },
          ],
        });

      // /builder/agents/me resolves the current user
      nock(API)
        .get("/api/builder/agents/me")
        .reply(200, { agent: { id: "agent-1", github_username: "alice" } });

      // T01 is claimed by alice (us) — included
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            status: "open",
            is_claimed: true,
            claimers: [
              { agent_id: "agent-1", username: "alice", claimed_at: "t1", expires_at: "t2" },
            ],
          },
        });

      // T02 is claimed by bob (not us) — excluded
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T02")
        .reply(200, {
          task: {
            slug: "T02",
            title: "Add dashboard",
            status: "open",
            is_claimed: true,
            claimers: [
              { agent_id: "agent-2", username: "bob", claimed_at: "t1", expires_at: "t2" },
            ],
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "list",
        "proj_abc",
        "--mine",
        "--json",
      ]);
      expect(error).toBeUndefined();
      // Sanity: confirm all nock scopes were consumed (i.e. the
      // follow-up /tasks/:slug calls actually hit the mocks, not
      // a real API).
      expect(scope.isDone()).toBe(true);

      const out = JSON.parse(stdout);
      expect(out.filter).toBe("mine");
      expect(out.total).toBe(1);
      expect(out.tasks).toHaveLength(1);
      expect(out.tasks[0].slug).toBe("T01");
    });
  });

  describe("claim", () => {
    beforeEach(() => {
      saveCredentials({ token: "amk_test", agent_id: "agent-1" });
    });

    it("claims a task and returns the response", async () => {
      const scope = nock(API)
        .post("/api/builder/projects/proj_abc/tasks/T01/claim")
        .matchHeader("authorization", /^Bearer amk_/)
        .reply(200, {
          ok: true,
          task_id: "task_1",
          slug: "T01",
          claimed_by_you: true,
          claim_expires_at: "2026-06-10T15:00:00Z",
          claimers_count: 1,
          claimers: [
            {
              agent_id: "agent-1",
              username: "alice",
              claimed_at: "2026-06-10T13:00:00Z",
              expires_at: "2026-06-10T15:00:00Z",
            },
          ],
          note: "Claimed for 2h (advisory — not a lock).",
        });

      const { stdout, error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T01",
        "--json",
      ]);
      expect(error).toBeUndefined();
      expect(scope.isDone()).toBe(true);

      const out = JSON.parse(stdout);
      expect(out.claimed_by_you).toBe(true);
      expect(out.claimers_count).toBe(1);
    });

    it("shows multi-claimer warning in human output", async () => {
      nock(API)
        .post("/api/builder/projects/proj_abc/tasks/T01/claim")
        .reply(200, {
          ok: true,
          slug: "T01",
          claimed_by_you: true,
          claim_expires_at: "2026-06-10T15:00:00Z",
          claimers_count: 3,
          claimers: [
            { agent_id: "a", username: "alice", claimed_at: "2026-06-10T13:00:00Z", expires_at: "2026-06-10T15:00:00Z" },
            { agent_id: "b", username: "bob", claimed_at: "2026-06-10T13:30:00Z", expires_at: "2026-06-10T15:30:00Z" },
            { agent_id: "c", username: "carol", claimed_at: "2026-06-10T14:00:00Z", expires_at: "2026-06-10T16:00:00Z" },
          ],
          note: "3 agents are working on this",
        });

      const { stdout, error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T01",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Claimed");
      expect(stdout).toContain("T01");
      expect(stdout).toContain("2 other agents");
    });

    it("exits 3 when not authenticated", async () => {
      const { clearCredentials } = await import("../../src/lib/auth.js");
      clearCredentials();

      const { error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T01",
      ]);
      expect(error?.oclif?.exit).toBe(3);
    });

    it("exits 4 when project or task not found", async () => {
      nock(API)
        .post("/api/builder/projects/proj_abc/tasks/T99/claim")
        .reply(404, { error: "project or task not found" });

      const { error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T99",
      ]);
      expect(error?.oclif?.exit).toBe(4);
    });

    it("exits 1 when task is not claimable (phase / dep / status gate)", async () => {
      nock(API)
        .post("/api/builder/projects/proj_abc/tasks/T01/claim")
        .reply(409, { error: "blocked by T00 (not merged)" });

      const { error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T01",
      ]);
      expect(error?.oclif?.exit).toBe(1);
    });

    it("requires project id and slug args", async () => {
      const { error } = await runCommand(["task", "claim"]);
      expect(error?.oclif?.exit).toBe(2);
    });

    it("prints the canonical branch + title + gh pr create command in human output", async () => {
      // Claim endpoint
      nock(API)
        .post("/api/builder/projects/hydrationhelper/tasks/T901/claim")
        .reply(200, {
          ok: true,
          task_id: "task_901",
          slug: "T901",
          project_slug: "hydrationhelper",
          task_title: "Author the design doc",
          claimed_by_you: true,
          claim_expires_at: "2026-06-10T16:00:00Z",
          claimers_count: 1,
          claimers: [
            {
              agent_id: "agent-1",
              username: "alice",
              claimed_at: "2026-06-10T14:00:00Z",
              expires_at: "2026-06-10T16:00:00Z",
            },
          ],
        });

      // /builder/agents/me lookup for the GitHub username
      nock(API)
        .get("/api/builder/agents/me")
        .matchHeader("authorization", /^Bearer amk_/)
        .reply(200, {
          agent: {
            id: "agent-1",
            github_username: "laontme",
          },
        });

      // /builder/projects/:id/tasks/:slug lookup for the real task title
      // (the claim response doesn't carry it — the CLI follows up).
      nock(API)
        .get("/api/builder/projects/hydrationhelper/tasks/T901")
        .reply(200, {
          project_id: "proj_901",
          project_slug: "hydrationhelper",
          token_symbol: "HH",
          task: {
            id: "task_901",
            slug: "T901",
            title: "Author the design doc",
            body_md: "...",
            reward_amount: 0,
            status: "open",
            created_at: "2026-06-10T14:00:00Z",
            is_claimed: true,
            claimers_count: 1,
            claimers: [],
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "claim",
        "hydrationhelper",
        "T901",
      ]);
      expect(error).toBeUndefined();

      // Branch and title use the canonical format. The leading `[T901]`
      // bracket is matched verbatim against project task slugs by the
      // platform's PR→task matcher (agnt-api 568c0d4), so we don't have
      // to rely on the T-number regex fallback.
      //
      // Head ref uses OWNER:BRANCH form (`laontme:agent/laontme/T901`)
      // so `gh pr create` works against a forked repo. The `Head:`
      // line documents the form for builders hitting "Head sha can't
      // be blank" errors. (Grug review 2026-06-11.)
      expect(stdout).toContain("Branch: agent/laontme/T901");
      expect(stdout).toContain("Title:  [T901] Author the design doc");
      expect(stdout).toContain("(project: hydrationhelper)");
      // gh pr create command is printed ready-to-paste.
      expect(stdout).toContain("gh pr create");
      expect(stdout).toContain("--head laontme:agent/laontme/T901");
      expect(stdout).toContain('--title "[T901] Author the design doc"');
      expect(stdout).toContain(
        '--body "Claimed via: agnt task claim hydrationhelper T901"',
      );
    });

    it("falls back to <you> placeholder when GitHub username can't be fetched", async () => {
      nock(API)
        .post("/api/builder/projects/proj_abc/tasks/T01/claim")
        .reply(200, {
          ok: true,
          slug: "T01",
          project_slug: "proj_abc",
          task_title: "Add login",
          claimed_by_you: true,
          claim_expires_at: "2026-06-10T15:00:00Z",
          claimers_count: 1,
          claimers: [
            {
              agent_id: "agent-1",
              username: "alice",
              claimed_at: "2026-06-10T13:00:00Z",
              expires_at: "2026-06-10T15:00:00Z",
            },
          ],
        });

      // /builder/agents/me returns an error
      nock(API)
        .get("/api/builder/agents/me")
        .reply(500, { error: "down" });

      const { stdout, error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T01",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Branch: agent/<you>/T01");
      expect(stdout).toContain("couldn't read your GitHub username");
    });

    it("prints a human-friendly timer (relative + absolute UTC) when claim succeeds", async () => {
      // expires_at is 2h in the future. The output should read
      // "in 1h 59m (YYYY-MM-DD HH:MM UTC)" — relative first, then the
      // absolute UTC in parens, so a builder can verify in a log.
      const future = new Date(Date.now() + 2 * 60 * 60 * 1000 - 60_000).toISOString();
      nock(API)
        .post("/api/builder/projects/proj_abc/tasks/T01/claim")
        .reply(200, {
          ok: true,
          slug: "T01",
          project_slug: "proj_abc",
          task_title: "Add login",
          claimed_by_you: true,
          claim_expires_at: future,
          claimers_count: 1,
          claimers: [
            {
              agent_id: "agent-1",
              username: "alice",
              claimed_at: new Date().toISOString(),
              expires_at: future,
            },
          ],
        });

      nock(API)
        .get("/api/builder/agents/me")
        .matchHeader("authorization", /^Bearer amk_/)
        .reply(200, { agent: { id: "agent-1", github_username: "alice" } });

      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            body_md: "...",
            status: "open",
            claimers: [],
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "claim",
        "proj_abc",
        "T01",
      ]);
      expect(error).toBeUndefined();
      // "Expires:" line carries the relative + absolute pair.
      // We don't pin the exact minute count (timing-sensitive); we
      // just check the format and that the absolute UTC suffix is
      // there.
      expect(stdout).toMatch(/Expires: in \d+h \d+m \(\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\)/);
    });
  });

  describe("claims", () => {
    beforeEach(() => {
      saveCredentials({ token: "amk_test", agent_id: "agent-1" });
    });

    it("lists my active claims with the O(1) /agents/me/claims endpoint", async () => {
      // Single request — no N+1 fan-out, no per-project DAG walk.
      // The server's MyClaimItem carries project_slug, task_slug,
      // task_title, task_status, claimed_at, expires_at, and
      // open_pr_url. The CLI normalises to its own shape and sorts
      // soonest-expiring first.
      const ninetyMinExp = new Date(Date.now() + 90 * 60 * 1000).toISOString();
      const tenMinExp = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      nock(API)
        .get("/api/builder/agents/me/claims")
        .matchHeader("authorization", /^Bearer amk_/)
        .reply(200, {
          count: 3,
          claims: [
            {
              project_id: "p-1",
              project_slug: "hydrationhelper",
              task_slug: "T901",
              task_title: "Author the design doc",
              task_status: "in_progress",
              claimed_at: thirtyMinAgo,
              expires_at: ninetyMinExp,
              expires_in_seconds: 90 * 60,
              open_pr_url: null,
            },
            {
              project_id: "p-2",
              project_slug: "barberbook",
              task_slug: "T11",
              task_title: "Set up CI",
              task_status: "in_progress",
              claimed_at: sixtyMinAgo,
              expires_at: tenMinExp,
              expires_in_seconds: 10 * 60,
              open_pr_url: null,
            },
            {
              project_id: "p-3",
              project_slug: "hydrationhelper",
              task_slug: "T902",
              task_title: "Add water log API",
              task_status: "in_review",
              claimed_at: thirtyMinAgo,
              expires_at: ninetyMinExp,
              expires_in_seconds: 90 * 60,
              open_pr_url: "https://github.com/agntdev/hydrationhelper/pull/142",
            },
          ],
        });

      const { stdout, error } = await runCommand([
        "task",
        "claims",
        "--json",
      ]);
      expect(error).toBeUndefined();

      const out = JSON.parse(stdout);
      expect(out.total).toBe(3);
      // Soonest-expiring first among un-shipped, shipped at the bottom.
      // T11 (10m, no PR) sorts before T901 (90m, no PR).
      // T902 (shipped, PR open) sorts last regardless of timer.
      expect(out.claims[0].taskSlug).toBe("T11");
      expect(out.claims[1].taskSlug).toBe("T901");
      expect(out.claims[2].taskSlug).toBe("T902");
      // Server's open_pr_url is preserved as openPrUrl (camelCase).
      expect(out.claims[0].openPrUrl).toBeNull();
      expect(out.claims[1].openPrUrl).toBeNull();
      expect(out.claims[2].openPrUrl).toBe(
        "https://github.com/agntdev/hydrationhelper/pull/142",
      );
      // Project slug comes through (no more projectName — backend
      // doesn't return it, the CLI normalises to slug-only).
      expect(out.claims[0].projectSlug).toBe("barberbook");
      expect(out.claims[1].projectSlug).toBe("hydrationhelper");
      // expiresAtMs is parsed from the ISO string.
      expect(out.claims[0].expiresAtMs).toBeGreaterThan(Date.now());
      expect(out.claims[0].expiresAtMs).toBeLessThanOrEqual(
        Date.now() + 11 * 60 * 1000,
      );
    });

    it("renders relative timer + absolute UTC for un-shipped claims", async () => {
      const futureExp = new Date(Date.now() + 47 * 60 * 1000).toISOString();
      const pastClaimed = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      nock(API)
        .get("/api/builder/agents/me/claims")
        .reply(200, {
          count: 1,
          claims: [
            {
              project_slug: "hydrationhelper",
              task_slug: "T901",
              task_title: "Author the design doc",
              task_status: "in_progress",
              claimed_at: pastClaimed,
              expires_at: futureExp,
              expires_in_seconds: 47 * 60,
              open_pr_url: null,
            },
          ],
        });

      const { stdout, error } = await runCommand(["task", "claims"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("T901");
      expect(stdout).toContain("Author the design doc");
      expect(stdout).toContain("hydrationhelper");
      // Relative timer (e.g. "in 46m") is paired with absolute UTC.
      expect(stdout).toMatch(
        /in 4[0-9]m \(\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\)/,
      );
    });

    it("shows '✓ shipped' + the PR URL when the agent already opened a PR", async () => {
      // Builder shipped a PR. The claim is decorative now — the timer
      // is hidden in favour of the green "✓ shipped" badge so the
      // builder knows nothing is at risk.
      const futureExp = new Date(Date.now() + 90 * 60 * 1000).toISOString();

      nock(API)
        .get("/api/builder/agents/me/claims")
        .reply(200, {
          count: 1,
          claims: [
            {
              project_slug: "hydrationhelper",
              task_slug: "T901",
              task_title: "Author the design doc",
              task_status: "in_review",
              claimed_at: new Date().toISOString(),
              expires_at: futureExp,
              expires_in_seconds: 90 * 60,
              open_pr_url:
                "https://github.com/agntdev/hydrationhelper/pull/142",
            },
          ],
        });

      const { stdout, error } = await runCommand(["task", "claims"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("T901");
      expect(stdout).toContain("✓ shipped");
      expect(stdout).toContain(
        "https://github.com/agntdev/hydrationhelper/pull/142",
      );
      // No colour-coded timer line on shipped claims.
      expect(stdout).not.toMatch(/expires: in \d+m/);
    });

    it("says 'No active claims' when there are none", async () => {
      nock(API)
        .get("/api/builder/agents/me/claims")
        .reply(200, { count: 0, claims: [] });

      const { stdout, error } = await runCommand(["task", "claims"]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("No active claims");
    });

    it("exits 3 when not authenticated", async () => {
      const { clearCredentials } = await import("../../src/lib/auth.js");
      clearCredentials();

      const { error } = await runCommand(["task", "claims"]);
      expect(error?.oclif?.exit).toBe(3);
    });

    it("exits 1 on API error", async () => {
      nock(API)
        .get("/api/builder/agents/me/claims")
        .reply(500, { error: "claims lookup failed" });
      const { error } = await runCommand(["task", "claims"]);
      expect(error?.oclif?.exit).toBe(1);
    });
  });

  describe("show", () => {
    it("returns task details", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            body_md: "# Login\nImplement OAuth",
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

    it("outputs only body_md with --body flag", async () => {
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            body_md: "# Markdown body",
            status: "open",
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "show",
        "proj_abc",
        "T01",
        "--body",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toBe("# Markdown body");
    });

    it("outputs only spec_body with --spec flag (issue #119 contract)", async () => {
      // spec_body is the actual contract text extracted from details.md
      // §-pointers — what the LLM reviewer validates the PR against.
      // Piping it raw to a file (`agnt task show p T --spec > spec.md`)
      // is the common case.
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            body_md: "Add login: /login OAuth (§3 in details.md)",
            spec_body:
              "## Spec\n\nImplement /login OAuth flow per details.md §3.\n\n" +
              "Acceptance: redirect URL, token refresh, /me endpoint.",
            status: "open",
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "show",
        "proj_abc",
        "T01",
        "--spec",
      ]);
      expect(error).toBeUndefined();
      // spec_body wins over body_md when --spec is passed.
      expect(stdout).toContain("## Spec");
      expect(stdout).toContain("Acceptance: redirect URL");
      // body_md is suppressed.
      expect(stdout).not.toContain("§3 in details.md");
    });

    it("--spec falls back to body_md on older servers (pre-#119)", async () => {
      // Server predates issue #119: no spec_body field. The CLI
      // should still produce something useful, not empty.
      nock(API)
        .get("/api/builder/projects/proj_abc/tasks/T01")
        .reply(200, {
          task: {
            slug: "T01",
            title: "Add login",
            body_md: "# Old server fallback",
            status: "open",
          },
        });

      const { stdout, error } = await runCommand([
        "task",
        "show",
        "proj_abc",
        "T01",
        "--spec",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toBe("# Old server fallback");
    });

    it("default human output shows spec_body as the headline, body_md as a stub", async () => {
      // The whole point of spec_body is that it's the real contract.
      // Default output should lead with it so the builder reads it
      // first, then show the body_md pointer below for context.
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
