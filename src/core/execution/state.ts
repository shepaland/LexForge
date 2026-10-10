import { existsSync } from "node:fs";
import { z } from "zod";
import { json, local, refuse, save } from "./files.js";
import { changeDir } from "./plan.js";
const stringMap = z.record(z.string(), z.string());
const code = z
  .object({ head: z.string(), worktreeDigest: z.string() })
  .strict();
export const runSchema = z
  .object({
    phase: z.enum(["red", "green"]),
    command: z.string(),
    exitCode: z.number().int(),
    startedAt: z.string(),
    durationMs: z.number(),
    log: z.string(),
    logHash: z.string(),
    tail: z.string(),
    state: code,
    tests: stringMap,
    inputs: stringMap,
    environment: z.string(),
    contract: z.string(),
    accepted: z.boolean(),
    snapshot: z.string(),
    snapshotHashes: stringMap,
  })
  .strict();
const reviewSchema = z
  .object({
    reviewer: z.string().min(1),
    verdict: z.enum(["approved", "changes-requested"]),
    acceptance: z.array(z.string()),
    controls: z.array(z.string()),
    findings: z.array(
      z.object({
        id: z.string().min(1),
        level: z.enum(["critical", "important", "minor"]),
        message: z.string().min(1),
        resolved: z.boolean(),
        cycle: z.string().min(1).optional(),
      }),
    ),
    scope: z.enum(["wave", "fixes"]).optional(),
    previous: z.string().min(1).optional(),
  })
  .strict();
export const stateSchema = z
  .object({
    version: z.literal(1),
    cycle: z.string(),
    executor: z.string(),
    contract: z.string(),
    base: code,
    outsideDigest: z.string(),
    before: z.string(),
    beforeHashes: stringMap,
    runs: z.array(runSchema),
    review: z
      .object({
        report: reviewSchema,
        greenLogHash: z.string(),
        file: z.string(),
        fileHash: z.string(),
      })
      .optional(),
    reviewBase: z.string().optional(),
    reviewBaseHashes: stringMap.optional(),
    reviewFile: z.string().optional(),
    reviewFileHash: z.string().optional(),
    patch: z.string().optional(),
    patchHash: z.string().optional(),
    closedAt: z.string().optional(),
  })
  .strict();
export type CycleState = z.infer<typeof stateSchema>;
export type CycleRun = z.infer<typeof runSchema>;
export type Review = z.infer<typeof reviewSchema>;
export function statePath(root: string, change: string, id: string): string {
  return local(root, `${changeDir(change)}/execution/${id}/state.json`);
}
export function readState(
  root: string,
  change: string,
  id: string,
): CycleState | undefined {
  const file = statePath(root, change, id);
  if (!existsSync(file)) return;
  const parsed = stateSchema.safeParse(json(file));
  if (!parsed.success || parsed.data.cycle !== id)
    refuse(`Corrupt cycle state: ${id}`);
  return parsed.data;
}
export function writeState(
  root: string,
  change: string,
  state: CycleState,
): void {
  save(statePath(root, change, state.cycle), state);
}
export function parseReview(file: string): Review {
  const r = reviewSchema.safeParse(json(file));
  if (!r.success) refuse(`Invalid review report: ${r.error.message}`);
  return r.data;
}
