#!/usr/bin/env node
import { Command } from "commander";
import { initRun } from "./commands/init-run.js";
import { validatePlan } from "./commands/validate-plan.js";
import { reviewPlan } from "./commands/review-plan.js";
import { requestChanges } from "./commands/request-changes.js";
import { approveRun } from "./commands/approve.js";
import { logRun } from "./commands/log.js";
import { closeRun, verifyRun, writeFinal } from "./commands/close.js";
import { runGate } from "./commands/gate.js";
import { listCommand, showRun, statusCommand, useRun } from "./commands/manage.js";
import { installAgent, parseAgents, uninstallAgent } from "./adapters/install.js";
import { resolveProjectRoot } from "./core/run-resolver.js";

const program = new Command();

program
  .name("plantrail")
  .description("Auditable agent workflow toolkit")
  .version("0.1.0");

program
  .command("init-run")
  .requiredOption("--goal <goal>", "Run goal / requirement")
  .action((opts) => {
    const root = resolveProjectRoot();
    const runId = initRun(root, opts.goal);
    console.log(runId);
  });

program
  .command("validate-plan")
  .argument("<run>", "Run id")
  .action((run) => {
    validatePlan(resolveProjectRoot(), run);
    console.log("Plan valid");
  });

program
  .command("review-plan")
  .argument("<run>", "Run id")
  .action((run) => {
    reviewPlan(resolveProjectRoot(), run);
    console.log("Review required");
  });

program
  .command("request-changes")
  .argument("<run>", "Run id")
  .requiredOption("--reason <reason>", "Reason for changes")
  .action((run, opts) => {
    requestChanges(resolveProjectRoot(), run, opts.reason);
    console.log("Changes requested");
  });

program
  .command("approve")
  .argument("<run>", "Run id")
  .requiredOption("--by <actor>", "Approver (must be user)")
  .action((run, opts) => {
    if (opts.by !== "user") {
      throw new Error("Only --by user can approve execution");
    }
    approveRun(resolveProjectRoot(), run, opts.by);
    console.log("Approved");
  });

program
  .command("gate")
  .argument("<run>", "Run id")
  .requiredOption("--event <event>", "Hook event name")
  .requiredOption("--tool <tool>", "Tool name")
  .option("--payload <json>", "JSON payload", "{}")
  .action((run, opts) => {
    const result = runGate(resolveProjectRoot(), {
      run_id: run,
      event: opts.event,
      tool: opts.tool,
      payload: JSON.parse(opts.payload),
      project_root: resolveProjectRoot(),
    });
    console.log(JSON.stringify(result));
    if (result.decision === "deny") process.exit(2);
  });

program
  .command("log")
  .argument("<run>", "Run id")
  .requiredOption("--kind <kind>", "doing|decision|evidence")
  .requiredOption("--message <message>", "Log message")
  .option("--step-id <stepId>", "Step id")
  .action((run, opts) => {
    logRun(resolveProjectRoot(), run, opts.kind, opts.message, opts.stepId);
    console.log("Logged");
  });

program
  .command("final")
  .argument("<run>", "Run id")
  .option("--summary <summary>", "Final summary text")
  .action((run, opts) => {
    writeFinal(resolveProjectRoot(), run, opts.summary);
    console.log("Final written");
  });

program
  .command("verify")
  .argument("<run>", "Run id")
  .action((run) => {
    verifyRun(resolveProjectRoot(), run);
    console.log("Verified");
  });

program
  .command("close")
  .argument("<run>", "Run id")
  .requiredOption("--status <status>", "done|blocked")
  .action((run, opts) => {
    closeRun(resolveProjectRoot(), run, opts.status);
    console.log(`Closed: ${opts.status}`);
  });

program.command("list").action(() => {
  const runs = listCommand(resolveProjectRoot());
  runs.forEach((r) => console.log(r));
});

program
  .command("show")
  .argument("<run>", "Run id")
  .action((run) => {
    console.log(JSON.stringify(showRun(resolveProjectRoot(), run), null, 2));
  });

program
  .command("use")
  .argument("<run>", "Run id")
  .action((run) => {
    useRun(resolveProjectRoot(), run);
    console.log(`Active run: ${run}`);
  });

program.command("status").action(() => {
  console.log(JSON.stringify(statusCommand(resolveProjectRoot()), null, 2));
});

program
  .command("install")
  .requiredOption("--agent <agents>", "cursor,codex,claude")
  .option("--scope <scope>", "project|global", "project")
  .action((opts) => {
    const root = resolveProjectRoot();
    for (const agent of parseAgents(opts.agent)) {
      installAgent({ agent, scope: opts.scope, projectRoot: root });
      console.log(`Installed ${agent} (${opts.scope})`);
    }
    if (parseAgents(opts.agent).includes("codex")) {
      console.warn("Codex: run `/hooks` in Codex CLI and trust plantrail hooks manually.");
    }
  });

program
  .command("uninstall")
  .requiredOption("--agent <agents>", "cursor,codex,claude")
  .option("--scope <scope>", "project|global", "project")
  .action((opts) => {
    const root = resolveProjectRoot();
    for (const agent of parseAgents(opts.agent)) {
      uninstallAgent({ agent, scope: opts.scope, projectRoot: root });
      console.log(`Uninstalled ${agent} (${opts.scope})`);
    }
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
