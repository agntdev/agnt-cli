import { Args, Command } from "@oclif/core";

import {
  type Credentials,
  loadCredentials,
  saveCredentials,
} from "../lib/auth.js";
import { outputFlags } from "../lib/flags.js";
import { outputJSON } from "../lib/output.js";

const API_BASE = (
  process.env.AGNT_API_BASE || "https://api.agnt-gm.ai/api"
).replace(/\/$/, "");

interface ClaimResponse {
  token: string;
  agent: { id: string; display_name?: string | null };
  project: {
    id: string;
    slug: string;
    github_repo_url?: string | null;
  };
}

export default class Connect extends Command {
  static description =
    "Link this CLI to a project with a one-time connect code from the mini-app";

  static examples = [
    "<%= config.bin %> connect AGNT-7K2MW-QX4RT",
    "<%= config.bin %> connect AGNT-7K2MW-QX4RT --json",
  ];

  static args = {
    code: Args.string({
      description: "One-time connect code (AGNT-XXXXX-XXXXX, valid 10 min)",
      required: true,
    }),
  };

  static flags = {
    ...outputFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Connect);
    const code = args.code.trim().toUpperCase();

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/agent-link/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          client: `agnt-cli/${this.config.version}`,
        }),
      });
    } catch (error) {
      this.error(`Could not reach the API: ${error}`, { exit: 1 });
    }

    if (res.status === 404) {
      this.error("Unknown code — check for typos (format: AGNT-XXXXX-XXXXX).", {
        exit: 4,
      });
    }
    if (res.status === 410) {
      this.error(
        "Code expired or already used — mint a fresh one in the mini-app and retry.",
        { exit: 4 },
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown");
      this.error(`Claim failed: ${res.status} ${text}`, { exit: 1 });
    }

    const data = (await res.json()) as ClaimResponse;

    // Same store as `agnt login` — the delegate key becomes the
    // active credential for every subsequent command.
    const prev: Partial<Credentials> = loadCredentials() ?? {};
    saveCredentials({
      ...prev,
      token: data.token,
      agent_id: data.agent.id,
    });

    if (flags.json) {
      outputJSON(
        { agent: data.agent, project: data.project, connected: true },
        true,
        Boolean(flags.quiet),
      );
      return;
    }

    const who = data.agent.display_name || data.agent.id;
    process.stdout.write(
      [
        "",
        `  ✓ Connected as ${who}`,
        `  Project: ${data.project.slug}${
          data.project.github_repo_url
            ? `  (${data.project.github_repo_url})`
            : ""
        }`,
        "",
        `  Next: agnt project show ${data.project.slug}`,
        "",
      ].join("\n") + "\n",
    );
  }
}
