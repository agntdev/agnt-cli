import { Command } from "@oclif/core";

import { client } from "../lib/client.js";
import { logError, outputJSON } from "../lib/output.js";
import { outputFlags } from "../lib/flags.js";

export default class Stats extends Command {
  static description = "Show platform-wide stats";

  static examples = [
    "<%= config.bin %> stats",
    "<%= config.bin %> stats --json",
  ];

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Stats);

    const { data, error } = await client.GET("/builder/stats");

    if (error) {
      logError(this, "Failed to fetch stats");
    }

    outputJSON(
      {
        counts: data?.counts,
        tokens_total: data?.tokens_total,
        daily_activity: data?.daily_activity,
        as_of_utc: data?.as_of_utc,
        window_days: data?.window_days,
      },
      flags.json,
      flags.quiet,
    );
  }
}
