import { Args, Command } from "@oclif/core";
import chalk from "chalk";

import { outputFlags } from "../../lib/flags.js";
import { outputJSONAuto } from "../../lib/output.js";
import { client, authHeaders } from "../../lib/client.js";

// v0.18.0: GET /builder/projects/{id}/quality/blueprint — the
// structured blueprint for a whole_bot project.
//
// The API returns a structured object with archetype, title, summary,
// completeness_score, content (entry_points, flows, data_entities,
// integrations, edge_cases, etc.), missing_fields, and assumptions.
// The CLI renders a human-friendly summary; --json passes through
// the full response.

type EntryPoint = {
  type?: string;
  label?: string;
  command?: string;
  callback_data?: string;
  actor?: string;
  description?: string;
};

type Flow = {
  name?: string;
  trigger?: string;
  steps?: string[];
};

type DataEntity = {
  name?: string;
  description?: string;
  retention?: string;
};

type Integration = {
  name?: string;
  purpose?: string;
  required?: boolean;
};

type BlueprintContent = {
  entry_points?: EntryPoint[];
  flows?: Flow[];
  data_entities?: DataEntity[];
  integrations?: Integration[];
  edge_cases?: string[];
  required_tests?: string[];
  owner_controls?: string[];
  notifications?: string[];
  permissions_privacy?: string[];
  [k: string]: unknown;
};

type BlueprintResponse = {
  project_id?: string;
  version?: number;
  status?: string;
  schema_version?: string;
  archetype?: string;
  title?: string;
  summary?: string;
  voice?: string;
  completeness_score?: number;
  missing_fields?: string[];
  assumptions?: string[];
  content?: BlueprintContent;
  updated_at?: string;
  [k: string]: unknown;
};

export default class ProjectBlueprint extends Command {
  static description =
    "Show the whole_bot blueprint (structured build spec)";

  static examples = [
    "<%= config.bin %> project blueprint proj_abc123",
    "<%= config.bin %> project blueprint my-project --json",
  ];

  static args = {
    projectId: Args.string({
      description: "Project ID or slug",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectBlueprint);

    const res = await client.GET(
      "/builder/projects/{id}/quality/blueprint" as never,
      {
        params: { path: { id: args.projectId } },
        headers: authHeaders(),
      } as never,
    );
    const status = res.response?.status;
    const data = res.data as BlueprintResponse | undefined;
    const errBody = res.error as { error?: string } | undefined;

    if (status === 404 || errBody?.error === "not_found") {
      this.error(`Project not found: ${args.projectId}`, { exit: 4 });
    }
    if (res.error) {
      this.error(`API error: ${errBody?.error ?? "Unknown"}`, { exit: 1 });
    }

    const bp = data ?? {};

    if (flags.json) {
      outputJSONAuto(bp, true, Boolean(flags.quiet));
      return;
    }

    if (flags.quiet) {
      outputJSONAuto(
        {
          title: bp.title ?? null,
          completeness_score: bp.completeness_score ?? null,
        },
        false,
        true,
      );
      return;
    }

    // Human output
    const lines: string[] = [];

    // Header
    const title = bp.title ?? args.projectId;
    lines.push(chalk.bold(`Blueprint: ${title}`));
    if (bp.archetype) lines.push(`Archetype: ${bp.archetype}`);
    if (bp.summary) lines.push(`\n${bp.summary}`);
    if (bp.completeness_score != null) {
      const pct = Math.round(bp.completeness_score * 100);
      const color = pct >= 80 ? chalk.green : pct >= 50 ? chalk.yellow : chalk.red;
      lines.push(`Completeness: ${color(`${pct}%`)}`);
    }
    if (bp.updated_at) lines.push(chalk.dim(`Updated: ${bp.updated_at}`));

    const content = bp.content;

    // Entry points
    if (content?.entry_points?.length) {
      lines.push(`\n${chalk.bold("Entry points")} (${content.entry_points.length})`);
      for (const ep of content.entry_points) {
        const cmd = ep.command || ep.callback_data || ep.type || "";
        lines.push(`  • ${ep.label ?? "?"} ${cmd ? chalk.dim(`(${cmd})`) : ""} — ${ep.description ?? ""}`);
      }
    }

    // Flows
    if (content?.flows?.length) {
      lines.push(`\n${chalk.bold("Flows")} (${content.flows.length})`);
      for (const f of content.flows) {
        lines.push(`  • ${f.name ?? "?"} ${f.trigger ? chalk.dim(`[${f.trigger}]`) : ""}`);
        if (f.steps?.length) {
          for (const s of f.steps) lines.push(`    → ${s}`);
        }
      }
    }

    // Data entities
    if (content?.data_entities?.length) {
      lines.push(`\n${chalk.bold("Data")} (${content.data_entities.length})`);
      for (const d of content.data_entities) {
        const ret = d.retention ? chalk.dim(` [${d.retention}]`) : "";
        lines.push(`  • ${d.name ?? "?"}${ret} — ${d.description ?? ""}`);
      }
    }

    // Integrations
    if (content?.integrations?.length) {
      lines.push(`\n${chalk.bold("Integrations")}`);
      for (const i of content.integrations) {
        const req = i.required ? chalk.red(" (required)") : chalk.dim(" (optional)");
        lines.push(`  • ${i.name ?? "?"}${req} — ${i.purpose ?? ""}`);
      }
    }

    // Edge cases
    if (content?.edge_cases?.length) {
      lines.push(`\n${chalk.bold("Edge cases")}`);
      for (const e of content.edge_cases) lines.push(`  • ${e}`);
    }

    // Assumptions
    if (bp.assumptions?.length) {
      lines.push(`\n${chalk.bold("Assumptions")}`);
      for (const a of bp.assumptions) lines.push(`  • ${a}`);
    }

    // Missing fields
    if (bp.missing_fields?.length) {
      lines.push(`\n${chalk.yellow("Missing fields")}`);
      for (const m of bp.missing_fields) lines.push(`  • ${m}`);
    }

    lines.push("");
    process.stdout.write(lines.join("\n") + "\n");
  }
}
