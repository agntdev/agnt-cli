import {Args, Command, Flags} from "@oclif/core";
import {writeFileSync} from "node:fs";

import {outputFlags} from "../../lib/flags.js";
import {authHeaders} from "../../lib/client.js";
import {logAuthError} from "../../lib/output.js";

export default class BotLogs extends Command {
  static description =
    "Download the managed bot's persisted build logs (owner-only)";

  static examples = [
    "<%= config.bin %> bot logs my-project",
    "<%= config.bin %> bot logs my-project --output ./build.log",
    "<%= config.bin %> bot logs my-project --tail 100",
  ];

  static flags = {
    ...outputFlags,
    output: Flags.string({
      char: "o",
      description:
        "File path to write logs to (default: ./<slug>-bot-build.log)",
    }),
    tail: Flags.integer({
      description: "Only print/save the last N lines of the log",
    }),
    stdout: Flags.boolean({
      default: false,
      description: "Print the log to stdout instead of saving to a file",
    }),
  };

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BotLogs);

    const headers = authHeaders();
    const res = await fetch(
      `${
        process.env.AGNT_API_BASE || "https://api.agnt-gm.ai/api"
      }/builder/projects/${encodeURIComponent(args.projectId)}/logs`,
      {headers},
    );

    if (res.status === 401 || res.status === 403) {
      logAuthError(this);
      this.error("Not authorized to download logs for this project", {
        exit: 1,
      });
    }

    if (res.status === 404) {
      this.error(
        "No logs available (store disabled or nothing captured yet). " +
          "Logs persist once the platform builds a bot image; see " +
          "BOT_LOG_DIR in the server config.",
        {exit: 2},
      );
    }

    if (!res.ok) {
      const body = await res.text();
      this.error(
        `Failed to fetch logs: ${res.status} ${res.statusText}\n${body}`,
        {exit: 1},
      );
    }

    let log = await res.text();
    if (flags.tail && flags.tail > 0) {
      const lines = log.split("\n");
      log = lines.slice(-flags.tail).join("\n");
    }

    if (flags.stdout) {
      process.stdout.write(log);
      if (!log.endsWith("\n")) process.stdout.write("\n");
      return;
    }

    const path =
      flags.output ?? `./${args.projectId}-bot-build.log`;
    writeFileSync(path, log, "utf8");
    const lineCount = log.split("\n").length;
    this.log(`Wrote ${lineCount} lines to ${path}`);
  }
}
