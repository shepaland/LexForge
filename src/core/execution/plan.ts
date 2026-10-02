import { fencedLines } from "../markdown-fences.js";
import { readProjectConfig } from "../workspace/project-config.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readChangeConfig } from "../workspace/change-config.js";
import { readChangeState } from "../status/change-status.js";
import { readPlanSource } from "../gates/plan-source.js";
import { digest, json, local, refuse, save } from "./files.js";
const nonempty = z.string().trim().min(1);
const ref = z.object({ path: nonempty, heading: nonempty }).strict();
const cycleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    tasks: z.array(nonempty).min(1),
    mode: z.enum(["behavior", "move"]).default("behavior"),
    dependsOn: z.array(nonempty).default([]),
    files: z
      .array(
        z
          .object({ path: nonempty, symbols: z.array(nonempty).default([]) })
          .strict(),
      )
      .min(1),
    testFiles: z.array(nonempty).min(1),
    inputs: z.array(nonempty).default([]),
    environment: z.array(nonempty).default([]),
    command: nonempty,
    expectedFailure: nonempty,
    design: z.array(ref).default([]),
    acceptance: z
      .array(
        z
          .object({ id: nonempty, task: nonempty, description: nonempty })
          .strict(),
      )
      .min(1),
    controls: z
      .array(
        z.enum([
          "authorization",
          "cryptography",
          "tenant-isolation",
          "migrations",
        ]),
      )
      .default([]),
  })
  .strict();
const planSchema = z
  .object({ version: z.literal(1), cycles: z.array(cycleSchema).min(1) })
  .strict();
export type Cycle = z.infer<typeof cycleSchema>;
export function changeDir(change: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change)) refuse("Invalid change name");
  return `lexforge/changes/${change}`;
}
export function workflow(root: string, change: string) {
  const config = readChangeConfig(root, change);
  const file = local(root, `${changeDir(change)}/workflow.json`);
  if (!existsSync(file))
    return { version: 1, schema: config.schema, schemaVersion: 1 };
  const value = z
    .object({
      version: z.union([z.literal(1), z.literal(2)]),
      schema: z.string(),
      schemaVersion: z.literal(1),
    })
    .strict()
    .safeParse(json(file));
  if (!value.success || value.data.schema !== config.schema)
    refuse("Unsupported or mismatched workflow/schema version");
  return value.data;
}
export function taskSource(root: string, change: string) {
  const { state } = readChangeState(root, change);
  const artifact = state.artifacts.find((a) => a.id === "tasks");
  if (!artifact || artifact.status !== "done")
    refuse("Write the tasks artifact before requesting execution context");
  const artifactPath = path
    .relative(root, artifact.resolvedOutputPath)
    .split(path.sep)
    .join("/");
  local(root, artifactPath);
  const indexLines = readFileSync(artifact.resolvedOutputPath, "utf8").split(
    /\r?\n/,
  );
  const ignored = fencedLines(indexLines);
  indexLines.forEach((line, index) => {
    const target = /^`([^`\s]+)`$/.exec(line.trim())?.[1];
    if (target && !ignored.has(index))
      local(
        root,
        path
          .relative(
            root,
            path.resolve(path.dirname(artifact.resolvedOutputPath), target),
          )
          .split(path.sep)
          .join("/"),
      );
  });
  const source = readPlanSource(artifact.resolvedOutputPath);
  const ids = source.tasks.map((t) => t.number);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
    refuse("Task IDs must be present and unique");
  for (const task of source.tasks)
    local(root, path.relative(root, task.file).split(path.sep).join("/"));
  return source;
}
export function executionPlan(
  root: string,
  change: string,
  required = false,
): Cycle[] {
  const file = local(root, `${changeDir(change)}/execution-plan.json`);
  if (!existsSync(file)) {
    if (required)
      refuse(
        "Write execution-plan.json mapping existing task IDs to cycles; do not rewrite the agreed plan",
      );
    return [];
  }
  const parsed = planSchema.safeParse(json(file));
  if (!parsed.success)
    refuse(`Invalid execution-plan.json: ${parsed.error.message}`);
  const cycles = parsed.data.cycles;
  const original = taskSource(root, change);
  const tasks = original.tasks;
  const ids = new Set(tasks.map((t) => t.number));
  const assigned = new Set<string>();
  const cycleIds = new Set(cycles.map((c) => c.id));
  if (cycleIds.size !== cycles.length) refuse("Duplicate cycle IDs");
  for (const c of cycles) {
    if (
      c.mode === "move" &&
      c.tasks.some(
        (id) => !tasks.find((task) => task.number === id)?.declaresMove,
      )
    )
      refuse(
        `Move cycles require explicit (move) declarations on every task: ${c.id}`,
      );
    for (const id of c.tasks) {
      if (!ids.has(id) || assigned.has(id))
        refuse(`Unknown or duplicate cycle task: ${id}`);
      assigned.add(id);
    }
    if (
      new Set(c.acceptance.map((a) => a.id)).size !== c.acceptance.length ||
      c.acceptance.some((a) => !c.tasks.includes(a.task))
    )
      refuse(`Invalid acceptance mapping: ${c.id}`);
    if (
      c.tasks.some((id) => !c.acceptance.some((a) => a.task === id)) &&
      c.tasks.some(
        (id) =>
          tasks
            .find((t) => t.number === id)
            ?.files.some((f) => !f.startsWith("tests/")) &&
          !c.acceptance.some((a) => a.task === id),
      )
    )
      refuse(`Production tasks need acceptance criteria: ${c.id}`);
    const taskFiles = tasks
      .filter((t) => c.tasks.includes(t.number))
      .flatMap((t) => t.files)
      .filter((f) => !f.startsWith(changeDir(change) + "/"));
    if (taskFiles.some((f) => !c.files.some((x) => x.path === f)))
      refuse(`Cycle scope omits task files: ${c.id}`);
    if (c.files.some((f) => f.path.startsWith("lexforge/")))
      refuse("Execution artifacts cannot be cycle output files");
    for (const p of [
      ...c.files.map((f) => f.path),
      ...c.testFiles,
      ...c.inputs,
      ...c.design.map((d) => d.path),
    ])
      local(root, p);
    if (new Set(c.files.map((f) => f.path)).size !== c.files.length)
      refuse(`Duplicate file scope: ${c.id}`);
    if (c.testFiles.some((f) => !c.files.some((x) => x.path === f)))
      refuse(`Test files must be in cycle file scope: ${c.id}`);
    if (c.dependsOn.some((id) => !cycleIds.has(id) || id === c.id))
      refuse(`Invalid cycle dependencies: ${c.id}`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) refuse("Cycle dependency loop");
    if (visited.has(id)) return;
    visiting.add(id);
    cycles.find((c) => c.id === id)!.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  cycles.forEach((c) => visit(c.id));
  function reaches(c: Cycle, id: string): boolean {
    return (
      c.dependsOn.includes(id) ||
      c.dependsOn.some((d) => reaches(cycles.find((x) => x.id === d)!, id))
    );
  }
  for (const section of original.sections) {
    const owning = cycles.filter((c) =>
      c.tasks.some((id) => section.tasks.some((t) => t.number === id)),
    );
    for (const dep of section.dependsOn) {
      const required = original.sections.find((s) => s.number === dep);
      if (!required) refuse(`Unknown original section dependency: ${dep}`);
      for (const predecessor of cycles.filter((c) =>
        c.tasks.some((id) => required.tasks.some((t) => t.number === id)),
      ))
        for (const owner of owning)
          if (owner.id === predecessor.id || !reaches(owner, predecessor.id))
            refuse(
              `Cycle ${owner.id} omits original section dependency ${predecessor.id}`,
            );
    }
  }
  if (required && tasks.some((t) => !assigned.has(t.number)))
    refuse("Every task must map to one cycle");
  return cycles;
}
export function migrate(root: string, change: string, to: string) {
  if (to !== "2") refuse("Only explicit migration to workflow 2 is supported");
  const old = workflow(root, change);
  executionPlan(root, change, true);
  const next = { ...old, version: 2 };
  save(local(root, `${changeDir(change)}/workflow.json`), next);
  return next;
}
export interface Snippet {
  path: string;
  line: number;
  text: string;
}
/** A heading and its complete subtree. Exact title matching avoids ambiguous anchors. */
export function snippet(root: string, file: string, heading: string): Snippet {
  const lines = readFileSync(local(root, file), "utf8").split(/\r?\n/);
  const ignored = fencedLines(lines);
  const found = lines
    .map((s, i) => ({ s, i, m: /^(#{1,6})\s+(.+?)\s*$/.exec(s) }))
    .filter((x) => !ignored.has(x.i) && x.m?.[2] === heading);
  if (found.length !== 1)
    refuse(`Missing or ambiguous heading ${heading} in ${file}`);
  const start = found[0]!;
  let end = start.i + 1;
  while (end < lines.length) {
    const h = /^(#{1,6})\s/.exec(lines[end]!);
    if (!ignored.has(end) && h && h[1]!.length <= start.m![1]!.length) break;
    end++;
  }
  return {
    path: file,
    line: start.i + 1,
    text: lines.slice(start.i, end).join("\n").trimEnd(),
  };
}
export function taskBlock(
  root: string,
  task: ReturnType<typeof taskSource>["tasks"][number],
): Snippet {
  const lines = readFileSync(task.file, "utf8").split(/\r?\n/);
  let end = task.line;
  let fence = "";
  while (end < lines.length) {
    const s = lines[end]!;
    const mark = /^\s*(`{3,}|~{3,})/.exec(s)?.[1];
    if (mark) {
      if (!fence) fence = mark;
      else if (mark[0] === fence[0] && mark.length >= fence.length) fence = "";
    } else if (
      !fence &&
      (/^\s*-\s*\[[ xX]\]\s*\d/.test(s) || /^#{1,2}\s/.test(s))
    )
      break;
    end++;
  }
  return {
    path: path.relative(root, task.file).split(path.sep).join("/"),
    line: task.line,
    text: lines
      .slice(task.line - 1, end)
      .join("\n")
      .trimEnd(),
  };
}
export function sources(root: string, change: string, c: Cycle) {
  const tasks = taskSource(root, change).tasks.filter((t) =>
    c.tasks.includes(t.number),
  );
  const requirements = tasks
    .flatMap((t) => t.links)
    .filter(
      (l, i, a) =>
        a.findIndex(
          (x) =>
            x.capability === l.capability && x.requirement === l.requirement,
        ) === i,
    )
    .map((l) => {
      const delta = `${changeDir(change)}/specs/${l.capability}/spec.md`;
      const file = existsSync(local(root, delta))
        ? delta
        : `lexforge/specs/${l.capability}/spec.md`;
      return {
        id: `${l.capability}#${l.requirement}`,
        ...snippet(root, file, `Requirement: ${l.requirement}`),
      };
    });
  return {
    tasks: tasks.map((t) => ({ id: t.number, ...taskBlock(root, t) })),
    requirements,
    design: c.design.map((d) => snippet(root, d.path, d.heading)),
  };
}
export function contract(root: string, change: string, c: Cycle): string {
  const s = sources(root, change, c);
  return digest(
    JSON.stringify({
      projectRules: readProjectConfig(root).rules,
      projectContext: readProjectConfig(root).context,
      cycle: c,
      ...s,
      tasks: s.tasks.map((t) => ({
        ...t,
        text: t.text.replace(/^- \[[xX]\]/, "- [ ]"),
      })),
    }),
  );
}
