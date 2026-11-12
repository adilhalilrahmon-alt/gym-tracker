// E2E tester agent: Claude drives the Gym Tracker app in a phone-sized browser
// as a persona, tries to reach a goal, and records what was hard.
//
//   node e2e/agent.mjs                      run every task in e2e/tasks.json
//   node e2e/agent.mjs is-bench-stalling    run one task
//   RUNS=2 node e2e/agent.mjs               run each task twice (agents vary run to run)
//   node e2e/agent.mjs --dry                check the plumbing without calling Claude (free)
//
// Then: node e2e/review.mjs  to merge, verify and rank the findings.

import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { DRY, OUT, runSession, testerPrompt } from './loop.mjs';

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const RUNS = Math.max(1, Number(process.env.RUNS ?? 1));
const tasks = JSON.parse(fs.readFileSync('e2e/tasks.json', 'utf8')).filter((t) => !only.length || only.includes(t.id));
const client = DRY ? null : new Anthropic();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
fs.rmSync(OUT, { recursive: true, force: true });
const reports = [];
for (const task of tasks) {
  for (let r = 1; r <= RUNS; r++) {
    const folder = RUNS > 1 ? `${task.id}-r${r}` : task.id;
    console.log(`▶ ${folder}`);
    const rep = await runSession({ task, system: testerPrompt(task), client, browser, folder });
    console.log(`  ${rep.success ? 'passed' : 'FAILED'} in ${rep.steps} actions, ${rep.notes.length} notes, ~$${rep.costUSD}`);
    reports.push(rep);
  }
}
await browser.close();

const sev = ['', 'minor', 'noticeable', 'blocking'];
const total = reports.reduce((a, r) => a + r.costUSD, 0);
const md = [`# Agent test run`, '', `| Run | Result | Actions | Notes | Cost |`, `| --- | --- | --- | --- | --- |`,
  ...reports.map((r) => `| ${r.run} | ${r.success ? 'passed' : 'failed'} | ${r.steps} | ${r.notes.length} | $${r.costUSD} |`),
  '', `Tester cost: about $${total.toFixed(3)}`, ''];
for (const r of reports) {
  md.push(`## ${r.run}`, '', `**Goal:** ${r.goal}`, '', `**How it went:** ${r.summary}`, '');
  for (const n of [...r.notes].sort((a, b) => b.severity - a.severity)) md.push(`- **${n.kind}, ${sev[n.severity]}** (step ${n.step}, ${n.screenshot}): ${n.text}`);
  if (r.consoleErrors.length) md.push('', `App errors: ${r.consoleErrors.join('; ')}`);
  md.push('');
}
fs.writeFileSync(path.join(OUT, 'summary.md'), md.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
console.log(`\nReport: ${path.join(OUT, 'summary.md')}`);
