import { Args, Command, Flags } from "@oclif/core";

import { isLoggedIn } from "../../lib/auth.js";
import { logAuthError, outputJSON } from "../../lib/output.js";
import { client, authHeaders } from "../../lib/client.js";
import { outputFlags } from "../../lib/flags.js";

export default class TaskCreate extends Command {
  static description = "Add tasks to a project stage";

  static examples = [
    '<%= config.bin %> task create proj_abc123 --stage 1 --title "Fix bug" --body-md "..." --weight 0.5 --ton 1000000000',
    '<%= config.bin %> task create my-project --stage 2 --title "Add test" --body-md "..." --weight 0.25 --ton 500000000 --difficulty easy',
  ];

  static flags = {
    ...outputFlags,
    stage: Flags.integer({
      char: "s",
      description: "Stage number (1, 2, ...)",
      required: true,
    }),
    title: Flags.string({
      char: "t",
      description: "Task title",
      required: true,
    }),
    "body-md": Flags.string({
      char: "b",
      description: "Full task specification in markdown",
      required: true,
    }),
    slug: Flags.string({
      char: "S",
      description: "Task slug (e.g. T01, S1T01) — auto-generated if omitted",
    }),
    difficulty: Flags.string({
      char: "d",
      description: "Difficulty level",
      options: ["trivial", "easy", "medium", "hard"],
    }),
    weight: Flags.string({
      char: "w",
      description:
        "Weight of this task within the new tasks (0.0-1.0). All new task weights must sum to 1.0.",
      required: true,
    }),
    ton: Flags.integer({
      char: "T",
      description: "Additional TON to add to stage reward pool (nano units)",
      required: true,
    }),
    jetton: Flags.integer({
      char: "j",
      description:
        "Additional jetton tokens to add to stage reward pool (smallest units)",
    }),
  };

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TaskCreate);

    if (!isLoggedIn()) {
      logAuthError(this);
      return;
    }

    const weight = parseFloat(flags.weight);
    if (isNaN(weight) || weight <= 0 || weight > 1) {
      this.error("Weight must be a number between 0 and 1", { exit: 2 });
    }

    interface TaskInput {
      title: string;
      body_md: string;
      weight_within_new: number;
      slug?: string;
      difficulty?: string;
    }

    const task: TaskInput = {
      title: flags.title,
      body_md: flags["body-md"],
      weight_within_new: weight,
    };
    if (flags.slug) task.slug = flags.slug;
    if (flags.difficulty) task.difficulty = flags.difficulty;

    const body: {
      tasks: TaskInput[];
      delta_ton_nano: number;
      delta_jetton_units?: number;
    } = {
      tasks: [task],
      delta_ton_nano: flags["ton"],
    };
    if (flags["jetton"] !== undefined)
      body.delta_jetton_units = flags["jetton"];

    const { data, error } = await client.POST(
      "/builder/projects/{id}/stages/{n}/add-tasks",
      {
        headers: authHeaders(),
        params: { path: { id: args.projectId, n: flags.stage } },
        body,
      },
    );

    if (error) {
      // error is a Readable stream of ErrorResponse
      const errorObj = error as unknown as { error?: string; details?: string };
      const msg = errorObj.error ?? errorObj.details ?? String(error);
      if (msg.includes("not_found")) {
        this.error(
          `Project or stage not found: ${args.projectId}/stage${flags.stage}`,
          { exit: 4 },
        );
      } else if (msg.includes("forbidden")) {
        this.error("You are not the owner of this project", { exit: 3 });
      } else {
        this.error(`Failed to create task: ${msg}`);
      }
      return;
    }

    outputJSON(data, flags.json, flags.quiet);
  }
}
