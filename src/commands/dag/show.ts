import { Args, Command } from "@oclif/core";

import { outputFlags } from "../../lib/flags.js";
import { outputJSON } from "../../lib/output.js";
import { client } from "../../lib/client.js";

export default class DagShow extends Command {
  static description = "Show the task dependency graph (DAG) for a project";

  static examples = [
    "<%= config.bin %> dag show proj_abc123",
    "<%= config.bin %> dag show my-project --json",
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
    const { args, flags } = await this.parse(DagShow);

    const { data, error } = await client.GET("/builder/projects/{id}/dag", {
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
