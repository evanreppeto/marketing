#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

import { runInitCommand } from "./cli-core.js";

const result = await runInitCommand(process.argv.slice(2), {
  writeFile,
  stdout: (line) => console.log(line),
});

if (!result.ok) {
  process.exitCode = 1;
}
