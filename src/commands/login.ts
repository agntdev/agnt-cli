import { Command, Flags } from "@oclif/core";

import { outputFlags } from "../lib/flags.js";
import { saveCredentials } from "../lib/auth.js";

// Headless login: the only path agents use. The browser device flow
// was cut in v0.13.0 — agents don't run a browser, and the TMA's
// `agnt connect <code>` covers the bootstrap case (no prior auth
// needed, mint a fresh delegate key against a one-time code).
//
// This command is for: CI, scripts, or re-auth after a key rotation.
// Owners running interactively should use `agnt connect` instead.

export default class Login extends Command {
  static description =
    "Sign in to agnt with a connect token (amk_xxx). For headless use.";

  static examples = [
    "<%= config.bin %> login --token amk_xxxx",
  ];

  static flags = {
    ...outputFlags,
    token: Flags.string({
      char: "t",
      required: true,
      description: "API token (amk_...)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Login);

    const token = flags.token;
    if (!token.startsWith("amk_")) {
      this.error("Invalid token format. Expected amk_...", { exit: 2 });
    }

    saveCredentials({ token });
    if (flags.json) {
      const { outputJSON } = await import("../lib/output.js");
      outputJSON({ authenticated: true }, true, Boolean(flags.quiet));
      return;
    }
    this.log("\n  Authenticated!\n");
  }
}
