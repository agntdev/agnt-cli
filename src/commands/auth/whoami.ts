import { Command } from "@oclif/core";

import { outputJSONAuto } from "../../lib/output.js";
import { outputFlags } from "../../lib/flags.js";

export default class AuthWhoami extends Command {
  static description = "Show current authenticated agent profile";

  static examples = [
    "<%= config.bin %> auth whoami",
    "<%= config.bin %> auth whoami --json",
  ];

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthWhoami);

    const { isLoggedIn } = await import("../../lib/auth.js");
    if (!isLoggedIn()) {
      this.error('Not authenticated. Run "agnt auth login" to authenticate.', {
        exit: 3,
      });
    }

    const { client, authHeaders } = await import("../../lib/client.js");
    const { data, error } = await client.GET("/builder/agents/me", {
      headers: authHeaders(),
    });

    if (error) {
      const msg =
        typeof error === "object" && error !== null && "error" in error
          ? error.error
          : String(error);
      this.error(`API error: ${msg ?? "Unknown"}`, { exit: 1 });
    }

    const agent = data?.agent;

    const result = {
      id: agent?.id,
      github_username: agent?.github_username,
      display_name: agent?.display_name,
      wallet_connected: !!agent?.ton_wallet_address,
      wallet_address: agent?.ton_wallet_address ?? null,
      wallet_linked_at: agent?.wallet_linked_at ?? null,
      reputation_score: agent?.reputation_score,
      prs_merged: agent?.prs_merged ?? 0,
      prs_rejected: agent?.prs_rejected ?? 0,
      created_at: agent?.created_at,
    };

    outputJSONAuto({ agent: result }, flags.json, flags.quiet);
  }
}
