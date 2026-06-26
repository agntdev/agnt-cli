import { Args, Command, Flags } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSON } from "../../lib/output.js";
import { client, authHeaders } from "../../lib/client.js";

// v0.18.0: project chat (agnt-api builder_chat.go).
//
//   `agnt project chat start <idea>`                        POST /chat
//   `agnt project chat <slug>`                              GET  /projects/:id/chat/messages
//   `agnt project chat <slug> <message>`                    POST /projects/:id/chat/messages
//
// Why three sub-actions in one command: the chat is a single
// (project, message-thread) pair, so the CLI surfaces them under
// one verb. Drafts (no project yet) get `start`; once the project
// exists, polling and sending are just `chat <slug>`.
//
// Note (whole_bot): post-draft the chat carries BUILD LOGS, not
// ideas. To change a finished bot, use `agnt project feedback`
// (the "Ship an update" composer in the mini-app, agnt-api #239 +
// agnt-gm.ai #76/#78). The CLI's chat send reflects that — see
// PostBuilderChatMessage (whole_bot branch).
//
// Note on multi-word input: oclif splits argv tokens on space by
// default, so the `<idea>` / `<message>` positional arg takes ONE
// token at a time. In the shell, wrap multi-word input in quotes
// and the shell joins: `chat start "a bot that does X"` works.

type ChatStartedResponse = {
  project_id?: string;
  status?: string;
  poll_url?: string;
};

type ChatMessage = {
  id?: number;
  role?: string;
  content?: string;
  created_at?: string;
};

type ChatMessagesResponse = {
  messages?: ChatMessage[];
  ai_thinking?: boolean;
};

export default class ProjectChat extends Command {
  static description =
    "Talk to a whole_bot project: start a new one with an idea, or send/poll messages on an existing project";

  static examples = [
    '<%= config.bin %> project chat start "a bot that turns receipts into expense reports"',
    "<%= config.bin %> project chat my-project-slug",
    '<%= config.bin %> project chat my-project-slug "Add a /refund command"',
    "<%= config.bin %> project chat my-project-slug --json",
  ];

  static args = {
    projectId: Args.string({
      description:
        "Project ID or slug. Use `start <idea>` to draft a new project. The trailing positional arg is the message to send.",
      required: false,
    }),
    message: Args.string({
      description: "Optional message (for `chat <slug> <message>`).",
      required: false,
    }),
  };

  static flags = {
    ...outputFlags,
    after: Flags.integer({
      description: "Poll messages with id > this (default 0 = from the start).",
      default: 0,
    }),
    limit: Flags.integer({
      description: "Max messages to return (default 50, cap 200).",
      default: 50,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectChat);

    if (args.projectId === "start") {
      if (!args.message) {
        this.error(
          '`start` needs an idea: agnt project chat start "<idea>"',
          { exit: 2 },
        );
      }
      return this.runStart(args.message, flags);
    }

    if (!args.projectId) {
      this.error(
        'need a project (or `start "<idea>"` to draft a new one).',
        { exit: 2 },
      );
    }

    if (args.message) {
      return this.runSend(args.projectId, args.message, flags);
    }
    return this.runPoll(args.projectId, flags);
  }

  private async runStart(
    message: string,
    flags: { json: boolean; quiet: boolean },
  ): Promise<void> {
    const res = await client.POST("/builder/chat" as never, {
      headers: authHeaders(),
      body: { message },
    } as never);
    const status = res.response?.status;
    const data = res.data as ChatStartedResponse | undefined;
    const errBody = res.error as { error?: string } | undefined;

    if (status === 429) {
      this.error("Rate limited — slow down.", { exit: 9 });
    }
    if (res.error) {
      this.error(`Chat start failed: ${errBody?.error ?? "Unknown"}`, { exit: 1 });
    }

    const r = data ?? {};
    if (flags.json) {
      outputJSON(r, true, Boolean(flags.quiet));
      return;
    }
    if (flags.quiet) {
      process.stdout.write(`${r.project_id ?? ""}\n`);
      return;
    }
    process.stdout.write(
      chalk.green("✓ Chat started") +
        chalk.dim(` — project=${r.project_id ?? "?"}, status=${r.status ?? "draft"}`) +
        `\nPoll with: agnt project chat ${r.project_id ?? "<id>"}\n`,
    );
  }

  private async runSend(
    projectId: string,
    message: string,
    flags: { json: boolean; quiet: boolean },
  ): Promise<void> {
    const res = await client.POST(
      "/builder/projects/{id}/chat/messages" as never,
      {
        params: { path: { id: projectId } },
        headers: authHeaders(),
        body: { message },
      } as never,
    );
    const status = res.response?.status;
    const data = res.data as ChatMessagesResponse | undefined;
    const errBody = res.error as { error?: string } | undefined;

    if (status === 404) {
      this.error(`Project not found: ${projectId}`, { exit: 4 });
    }
    if (status === 429) {
      this.error("Rate limited — slow down.", { exit: 9 });
    }
    if (res.error) {
      this.error(`Send failed: ${errBody?.error ?? "Unknown"}`, { exit: 1 });
    }

    const r = data ?? {};
    if (flags.json) {
      outputJSON(r, true, Boolean(flags.quiet));
      return;
    }
    if (flags.quiet) {
      process.stdout.write("sent\n");
      return;
    }
    if (r.ai_thinking) {
      process.stdout.write(chalk.dim("Sent — assistant is composing a turn.\n"));
    } else {
      process.stdout.write(
        chalk.dim(
          "Sent (whole_bot chat is log-only post-draft — use `agnt project feedback` for change requests).",
        ) + "\n",
      );
    }
  }

  private async runPoll(
    projectId: string,
    flags: {
      json: boolean;
      quiet: boolean;
      after: number;
      limit: number;
    },
  ): Promise<void> {
    const res = await client.GET(
      "/builder/projects/{id}/chat/messages" as never,
      {
        params: {
          path: { id: projectId },
          query: { after: flags.after, limit: flags.limit },
        },
        headers: authHeaders(),
      } as never,
    );
    const status = res.response?.status;
    const data = res.data as ChatMessagesResponse | undefined;
    const errBody = res.error as { error?: string } | undefined;

    if (status === 404) {
      this.error(`Project not found: ${projectId}`, { exit: 4 });
    }
    if (res.error) {
      this.error(`Poll failed: ${errBody?.error ?? "Unknown"}`, { exit: 1 });
    }

    const r = data ?? {};
    const messages = r.messages ?? [];

    if (flags.json) {
      outputJSON(r, true, Boolean(flags.quiet));
      return;
    }
    if (flags.quiet) {
      for (const m of messages) {
        process.stdout.write(`${m.id ?? "?"}\t${m.role ?? "?"}\t${m.content ?? ""}\n`);
      }
      return;
    }

    if (messages.length === 0) {
      process.stdout.write(chalk.dim(`(no messages in ${projectId} yet)\n`));
    } else {
      for (const m of messages) {
        const role = m.role ?? "?";
        const content = m.content ?? "";
        const prefix =
          role === "user" || role === "owner"
            ? chalk.cyan("you  > ")
            : role === "assistant"
              ? chalk.green("ai   > ")
              : chalk.dim("sys  > ");
        process.stdout.write(`${prefix}${content}\n`);
      }
    }
    if (r.ai_thinking) {
      process.stdout.write(chalk.dim("…assistant is thinking — re-poll in a few seconds\n"));
    }
  }
}