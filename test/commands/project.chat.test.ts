import { runCommand } from "@oclif/test";
import { describe, it, expect, beforeEach } from "vitest";
import nock from "nock";
import { clearCredentials, saveCredentials } from "../../src/lib/auth.js";

const API = "https://api.agnt-gm.ai";

describe("project chat (v0.18.0: start / poll / send)", () => {
  beforeEach(() => {
    nock.cleanAll();
    clearCredentials();
    saveCredentials({ token: "amk_test", agent_id: "agent-1" });
  });

  describe("start", () => {
    it("POSTs /chat with the idea and returns the new project_id", async () => {
      nock(API)
        .post("/api/builder/chat", (body: Record<string, unknown>) =>
          typeof body.message === "string" && body.message.length > 0,
        )
        .reply(202, {
          project_id: "proj_new",
          status: "draft",
          poll_url: "/api/builder/projects/proj_new/chat/messages",
        });

      const { stdout, error } = await runCommand([
        "project",
        "chat",
        "start",
        "single_idea", // oclif takes one argv token; shell quoting handles multi-word in real use
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Chat started");
      expect(stdout).toContain("proj_new");
      expect(stdout).toContain("Poll with");
    });

    it("refuses when start has no idea", async () => {
      const { error } = await runCommand(["project", "chat", "start"]);
      expect(error?.message).toContain("start");
    });
  });

  describe("poll", () => {
    it("renders messages with role prefixes", async () => {
      nock(API)
        .get(
          (uri) =>
            uri.startsWith("/api/builder/projects/proj_wb/chat/messages") &&
            uri.includes("after=0"),
        )
        .reply(200, {
          messages: [
            { id: 1, role: "user", content: "Build me a bot" },
            { id: 2, role: "assistant", content: "Sure — what features?" },
          ],
          ai_thinking: false,
        });

      const { stdout, error } = await runCommand([
        "project",
        "chat",
        "proj_wb",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("Build me a bot");
      expect(stdout).toContain("Sure — what features?");
    });

    it("prints the dim typing hint when ai_thinking=true", async () => {
      nock(API)
        .get((uri) =>
          uri.startsWith("/api/builder/projects/proj_wb/chat/messages"),
        )
        .reply(200, { messages: [], ai_thinking: true });

      const { stdout, error } = await runCommand([
        "project",
        "chat",
        "proj_wb",
      ]);
      expect(error).toBeUndefined();
      expect(stdout).toContain("assistant is thinking");
    });
  });

  describe("send", () => {
    it("POSTs a message and surfaces the log-only hint on a whole_bot", async () => {
      nock(API)
        .post(
          (uri) => uri === "/api/builder/projects/proj_wb/chat/messages",
          (body: Record<string, unknown>) => body.message === "hi",
        )
        .reply(202, { messages: [], ai_thinking: false });

      const { stdout, error } = await runCommand([
        "project",
        "chat",
        "proj_wb",
        "hi",
      ]);
      expect(error).toBeUndefined();
      // Post-draft, chat is log-only for whole_bot — hint surfaces that.
      expect(stdout).toContain("log-only");
    });

    it("exits 4 on 404", async () => {
      nock(API)
        .post("/api/builder/projects/proj_nope/chat/messages")
        .reply(404, { error: "not_found" });

      const { error } = await runCommand([
        "project",
        "chat",
        "proj_nope",
        "hi",
      ]);
      expect(error?.message).toContain("Project not found");
    });
  });
});