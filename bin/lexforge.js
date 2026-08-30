#!/usr/bin/env node
// Two things can be wrong before the CLI exists: the runtime is too old to read
// the build, and the build is not there. Both are checked here, because the code
// that answers by the command contract lives inside the build.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { missingBuildFinding, nodeVersionFinding } from "./runtime-check.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "dist", "cli", "run.js");

// The required version has one home: the `engines` field of the package.
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

const finding =
  nodeVersionFinding(process.versions.node, manifest.engines.node) ?? missingBuildFinding(entry);

if (finding) {
  process.stderr.write(`${finding}\n`);
  process.exitCode = 2;
} else {
  const { run } = await import(pathToFileURL(entry).href);

  process.exitCode = await run(process.argv.slice(2), { cwd: process.cwd() });
}
