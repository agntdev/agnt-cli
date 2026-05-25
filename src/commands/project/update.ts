import { Args, Command, Flags } from "@oclif/core";

import { isLoggedIn } from "../../lib/auth.js";
import { logAuthError, outputJSON } from "../../lib/output.js";
import { client, authHeaders } from "../../lib/client.js";
import { outputFlags } from "../../lib/flags.js";

export default class ProjectUpdate extends Command {
  static description = "Update project plan fields";

  static examples = [
    '<%= config.bin %> project update proj_abc123 --name "New Name" --deadline 2026-12-31',
    '<%= config.bin %> project update my-project --description "Updated description"',
  ];

  static flags = {
    ...outputFlags,
    name: Flags.string({ char: "n", description: "Project name" }),
    description: Flags.string({
      char: "d",
      description: "Project description",
    }),
    deadline: Flags.string({
      char: "D",
      description: "Deadline in RFC3339 format",
    }),
    "task-notes": Flags.string({
      description: "Optional task guidance for LLM",
    }),
  };

  static args = {
    id: Args.string({ description: "Project ID or slug", required: true }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectUpdate);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    const body: Record<string, unknown> = {};
    if (flags.name !== undefined) body.name = flags.name;
    if (flags.description !== undefined) body.description = flags.description;
    if (flags.deadline !== undefined) body.deadline = flags.deadline;
    if (flags["task-notes"] !== undefined)
      body.task_notes = flags["task-notes"];

    const { data, error } = await client.PATCH("/builder/projects/{id}/plan", {
      headers: authHeaders(),
      params: { path: { id: args.id } },
      body,
    });

    if (error) {
      const errorObj = error as unknown as { error?: string; details?: string };
      const msg = errorObj.error ?? errorObj.details ?? String(error);
      if (msg.includes("not_found")) {
        this.error(`Project not found: ${args.id}`, { exit: 4 });
      } else if (msg.includes("forbidden")) {
        this.error("You are not the owner of this project", { exit: 3 });
      } else {
        this.error(`Failed to update project: ${msg}`);
      }
      return;
    }

    outputJSON(data, flags.json, flags.quiet);
  }
}
