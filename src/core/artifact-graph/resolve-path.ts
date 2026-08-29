import path from "node:path";

import {
  parseOutputTarget,
  type OutputKind,
  type OutputTarget,
} from "../schemas/output-target.js";

export interface ResolvedOutput {
  /** Absolute path for a single file, absolute glob for a set of files. */
  resolvedOutputPath: string;
  outputKind: OutputKind;
  target: OutputTarget;
}

export function resolveOutputPath(changeDir: string, generates: string): ResolvedOutput {
  const target = parseOutputTarget(generates);

  return {
    resolvedOutputPath: path.join(path.resolve(changeDir), generates),
    outputKind: target.kind,
    target,
  };
}
