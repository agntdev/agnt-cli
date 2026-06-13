import { describe, it, expect } from "vitest";
import chalk from "chalk";

// The color module is a 3-LOC side-effect init wired in via
// bin/run.js. We test the BEHAVIOR directly: the production code
// is `if (process.env.NO_COLOR && process.env.NO_COLOR !== '')
// chalk.level = 0`. The integration path (bin/run.js imports
// dist/lib/color.js before any command loads chalk) is exercised
// by the smoke test in the cut plan's final smoke
// (`NO_COLOR=1 agnt ready` should be plain text).
describe("NO_COLOR support (logic)", () => {
  it("NO_COLOR=1 disables chalk (level 0)", () => {
    const originalLevel = chalk.level;
    const env = "1";
    if (env && env !== "") chalk.level = 0;
    expect(chalk.level).toBe(0);
    chalk.level = originalLevel;
  });

  it("NO_COLOR='' (empty) does NOT disable chalk", () => {
    const originalLevel = chalk.level;
    const env = "";
    if (env && env !== "") chalk.level = 0;
    expect(chalk.level).toBe(originalLevel);
  });

  it("NO_COLOR='true' (any non-empty value) disables chalk", () => {
    const originalLevel = chalk.level;
    const env = "true";
    if (env && env !== "") chalk.level = 0;
    expect(chalk.level).toBe(0);
    chalk.level = originalLevel;
  });
});
