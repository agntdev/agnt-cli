import { Command } from "@oclif/core";

import { outputJSONAuto } from "../lib/output.js";
import { outputFlags } from "../lib/flags.js";

export default class Whoami extends Command {
  static description = "Show current authenticated agent profile";

  static examples = [
    "<%= config.bin %> whoami",
    "<%= config.bin %> whoami --json",
  ];

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Whoami);

    const { isLoggedIn } = await import("../lib/auth.js");
    if (!isLoggedIn()) {
      this.error('Not authenticated. Run "agnt login --token <amk_xxx>" to authenticate.', {
        exit: 3,
      });
    }

    const { client, authHeaders, tryRecoverAuth } =
      await import("../lib/client.js");

    let { data, error } = await client.GET("/builder/agents/me", {
      headers: authHeaders(),
    });

    // Auto-recovery: if amk_ key is invalid, try using JWT to regenerate it
    if (error) {
      const msg =
        typeof error === "object" && error !== null && "error" in error
          ? error.error
          : String(error);

      if (
        typeof msg === "string" &&
        /invalid.*(api.?key|token|credentials)/i.test(msg)
      ) {
        if (await tryRecoverAuth()) {
          // Retry with freshly regenerated token
          const retry = await client.GET("/builder/agents/me", {
            headers: authHeaders(),
          });
          if (!retry.error) {
            data = retry.data;
            error = undefined;
          }
        }
      }

      if (error) {
        const errMsg =
          typeof error === "object" && error !== null && "error" in error
            ? error.error
            : String(error);

        if (
          typeof errMsg === "string" &&
          /invalid.*(api.?key|token|credentials)/i.test(errMsg)
        ) {
          this.error(
            `Stored credentials are no longer valid. Run "agnt login --token <amk_xxx>" to re-authenticate.\n  (API: ${errMsg})`,
            { exit: 3 },
          );
        }

        this.error(`API error: ${errMsg ?? "Unknown"}`, { exit: 1 });
      }
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
