#!/usr/bin/env node
import { run } from "../dist/cli/run.js";

process.exitCode = await run(process.argv.slice(2), { cwd: process.cwd() });
