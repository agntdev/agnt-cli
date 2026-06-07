import { Args, Command } from "@oclif/core";

import { outputFlags } from "../../lib/flags.js";
import { outputJSON } from "../../lib/output.js";
import { client } from "../../lib/client.js";

export default class PhaseShow extends Command {
  static description = "Show the current memedev build phase of a project";

  static examples = [
    "<%= config.bin %> phase show proj_abc123",
    "<%= config.bin %> phase show my-project --json",
  ];

  static flags = {
    ...outputFlags,
  };

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(PhaseShow);

    const { data, error } = await client.GET("/builder/projects/{id}/phase", {
      params: {
        path: { id: args.projectId },
      },
    });

    if (error) {
      this.error(
        `API error: ${(error as { error?: string }).error ?? "Unknown"}`,
        { exit: 1 },
      );
    }

    outputJSON(data, flags.json, flags.quiet);
  }
}
