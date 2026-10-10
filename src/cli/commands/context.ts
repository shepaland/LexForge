import type { Command } from "commander";
import type { CliContext } from "../run.js";
import { findWorkspaceRoot } from "../../core/workspace/find-root.js";
import {
  context as taskContext,
  continuation,
} from "../../core/execution/context.js";
import { reconcile, reconcileReview } from "../../core/execution/reconciliation.js";
import { applyMigration } from "../../core/execution/migration-apply.js";
import { migrationPreview } from "../../core/execution/migration-analysis-output.js";
import { refuse } from "../../core/execution/files.js";
import {
  startCycle,
  runCycle,
  reviewCycle,
  closeCycle,
} from "../../core/execution/cycles.js";
import { reviewWave } from "../../core/execution/wave-review.js";
import { withExecutionLock } from "../../core/execution/lock.js";
import { refuseWithoutSubcommand } from "../subcommand-group.js";
export function registerContext(program: Command, ctx: CliContext): void {
  const root = () => findWorkspaceRoot(ctx.cwd);
  const locked = (
    o: {
      change: string;
    },
    fn: () => void | Promise<void>,
  ) => withExecutionLock(root(), o.change, fn);
  const output = (data: unknown, json: boolean, exitCode = 0) => {
    ctx.stdout.write(JSON.stringify(data, null, json ? undefined : 2) + "\n");
    ctx.finish({
      data,
      lines: [],
      nextStep: "",
      exitCode: exitCode === 0 ? 0 : 1,
    });
  };
  const common = (cmd: Command) =>
    cmd
      .allowExcessArguments(false)
      .requiredOption("--change <name>", "change name")
      .option("--json", "print one JSON document");
  common(
    program
      .command("context")
      .description("Build complete compact context for one task and its cycle"),
  )
    .requiredOption("--task <id>", "original task ID")
    .option(
      "--max-bytes <number>",
      "refuse oversized context without truncation",
    )
    .action((o) =>
      output(
        taskContext(
          root(),
          o.change,
          o.task,
          o.maxBytes === undefined ? undefined : Number(o.maxBytes),
        ),
        o.json,
      ),
    );
  common(
    program
      .command("resume")
      .description("Recompute continuation from primary evidence"),
  ).action((o) => output(continuation(root(), o.change), o.json));
  const flow = program
    .command("workflow")
    .description("Explicit workflow migration");
  refuseWithoutSubcommand(flow);
  common(flow.command("migrate"))
    .requiredOption("--to <version>", "target workflow version")
    .option("--dry-run", "analyze migration without changing files")
    .option("--task <id>", "show one task decision")
    .option("--class <classification>", "show decisions in one class")
    .action(async (o) => {
      if (o.to !== "2") refuse("Only explicit migration to workflow 2 is supported");
      if (o.dryRun) {
        const preview = migrationPreview(root(), o.change, {
          task: o.task,
          classification: o.class,
        });
        const blocked =
          ("blockers" in preview && Array.isArray(preview.blockers) && preview.blockers.length > 0) ||
          ("findings" in preview && preview.findings.length > 0) ||
          ("task" in preview && preview.task?.classification === "conflict") ||
          ("tasks" in preview && preview.tasks.some(task => task.classification === "conflict"));
        output(preview, o.json, blocked ? 1 : 0);
        return;
      }
      if (o.task || o.class) refuse("--task and --class require --dry-run");
      return output(await applyMigration(root(), o.change), o.json);
    });
  common(flow.command("reconcile"))
    .requiredOption("--cycle <id>", "cycle containing checked existing work")
    .requiredOption("--executor <identity>", "check executor identity")
    .action(o => locked(o, async () => {
      const result = await reconcile(root(), o.change, o.cycle, o.executor);
      output(result, o.json, result.accepted ? 0 : 1);
    }));
  common(flow.command("reconcile-review"))
    .requiredOption("--cycle <id>", "reconciled cycle")
    .requiredOption("--file <path>", "independent reconciliation review JSON")
    .action(o => locked(o, () => output(reconcileReview(root(), o.change, o.cycle, o.file), o.json)));
  const group = program
    .command("cycle")
    .description("Execute and review one behavioural cycle");
  refuseWithoutSubcommand(group);
  const cycle = (name: string) =>
    common(group.command(name)).requiredOption(
      "--cycle <id>",
      "cycle ID from execution-plan.json",
    );
  cycle("start")
    .requiredOption(
      "--executor <identity>",
      "executor identity for independent review",
    )
    .action((o) =>
      locked(o, () =>
        output(startCycle(root(), o.change, o.cycle, o.executor), o.json),
      ),
    );
  cycle("restart")
    .requiredOption("--executor <identity>", "executor of new attempt")
    .action((o) =>
      locked(o, () =>
        output(startCycle(root(), o.change, o.cycle, o.executor, true), o.json),
      ),
    );
  cycle("run")
    .requiredOption("--phase <red|green>", "run the plan command")
    .action((o) =>
      locked(o, async () => {
        const r = await runCycle(root(), o.change, o.cycle, o.phase);
        output(r, o.json, r.exitCode);
      }),
    );
  common(group.command("review"))
    .option("--cycle <id>", "cycle ID from execution-plan.json")
    .option("--wave <section>", "section number of tasks.md reviewed as one wave")
    .requiredOption(
      "--file <path>",
      "independent review JSON, relative to workspace",
    )
    .action((o) =>
      locked(o, () => {
        if ((o.cycle === undefined) === (o.wave === undefined))
          refuse("Give exactly one of --cycle and --wave");
        output(
          o.wave === undefined
            ? reviewCycle(root(), o.change, o.cycle, o.file)
            : reviewWave(root(), o.change, o.wave, o.file),
          o.json,
        );
      }),
    );
  cycle("close").action((o) =>
    locked(o, () => {
      closeCycle(root(), o.change, o.cycle);
      output(continuation(root(), o.change, true), o.json);
    }),
  );
}
