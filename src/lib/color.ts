import chalk from "chalk";

// Respect NO_COLOR (https://no-color.org/) — chalk does not support
// it natively (chalk/supports-color#105, maintainer rejected). We
// wire it ourselves at startup. The `--no-color` flag was cut in
// v0.13.0; this env var is the single source of truth for
// disabling color.
if (process.env.NO_COLOR && process.env.NO_COLOR !== "") {
  chalk.level = 0;
}
