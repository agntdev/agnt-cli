#!/usr/bin/env node

// Imported first so the NO_COLOR init runs before any command file
// pulls in chalk. See src/lib/color.ts for the rationale.
import "../dist/lib/color.js";

import { execute } from "@oclif/core";

await execute({ dir: import.meta.url });
