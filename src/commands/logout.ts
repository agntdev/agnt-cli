import { Command } from "@oclif/core";

import { loadCredentials, clearCredentials } from "../lib/auth.js";
import { outputFlags } from "../lib/flags.js";

// Headless logout. No confirmation prompt, no --force flag — if the
// agent ran this command, the agent knows what it's doing. Storing
// the token after a logout is the agent's responsibility, not ours.
// (Cut in v0.13.0; the v0.12.0 --force flag was an interactive
// affordance the agent surface doesn't need.)
export default class Logout extends Command {
  static description = "Clear stored credentials";

  static examples = ["<%= config.bin %> logout"];

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Logout);
    const creds = loadCredentials();

    if (!creds?.token) {
      this.error("Not logged in", { exit: 3 });
    }

    clearCredentials();

    if (flags.json) {
      const { outputJSON } = await import("../lib/output.js");
      outputJSON({ logged_out: true }, true, Boolean(flags.quiet));
      return;
    }
    this.log("Logged out successfully");
  }
}
