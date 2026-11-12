// Reviewer + verifier: turns raw tester notes into a short, ranked, checked list.
//
//   node e2e/review.mjs           read e2e/out/*/report.json, review, verify, write recommendations.md
//   node e2e/review.mjs --dry     same flow with canned answers (free)
//
// Three ideas worth knowing:
//  1. Separate roles. Testers observe; the reviewer judges; the verifier double-checks. Mixing
//     them biases what gets noticed.
//  2. Structured output. The reviewer must answer by calling a tool with a strict schema
//     (tool_choice forces it), so every finding has the same fields and code can rank them.
//  3. Verification. A fresh agent tries to reproduce each top finding. Unconfirmed findings are
//     kept but marked, which removes most false alarms.

import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { DRY, MODEL, OUT, runSession } from './loop.mjs';

const VERIFY_TOP = Number(process.env.VERIFY_TOP ?? 3);
const review = { cost: 0 };
const reviewCost = (u) => { review.cost = ((u?.input_tokens ?? 0) * 3 + (u?.output_tokens ?? 0) * 15) / 1e6; };

// ---- 1. Gather every tester report ----
for (const d of fs.readdirSync(OUT)) if (d.startsWith('verify-')) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
const reports = fs.readdirSync(OUT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('verify-') && fs.existsSync(path.join(OUT, d.name, 'report.json')))
  .map((d) => JSON.parse(fs.readFileSync(path.join(OUT, d.name, 'report.json'), 'utf8')));
if (!reports.length) { console.log('No tester reports in e2e/out. Run node e2e/agent.mjs first.'); process.exit(0); }
const tasks = Object.fromEntries(JSON.parse(fs.readFileSync('e2e/tasks.json', 'utf8')).map((t) => [t.id, t]));

const evidence = reports.map((r) => ({
  run: r.run, task: r.task, goal: r.goal, success: r.success, summary: r.summary, actions: r.steps,
  notes: r.notes.map((n) => ({ kind: n.kind, severity: n.severity, step: n.step, screenshot: n.screenshot, text: n.text })),
  appErrors: r.consoleErrors,
}));

// ---- 2. The reviewer: one call, forced to answer through a strict schema ----
const SUBMIT = {
  name: 'submit_findings',
  description: 'Submit the merged, scored list of findings.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short, specific problem statement (not a solution).' },
            kind: { type: 'string', enum: ['bug', 'friction', 'praise'] },
            severity: { type: 'integer', minimum: 1, maximum: 3, description: '1 minor, 2 noticeable, 3 blocks a goal' },
            runs: { type: 'array', items: { type: 'string' }, description: 'Run ids where this was observed.' },
            evidence: { type: 'string', description: 'What testers saw, quoting their notes, with run, step and screenshot file names.' },
            impact: { type: 'string', description: 'Why this matters for a lifter using the app between sets or tracking progress.' },
            effort: { type: 'string', enum: ['S', 'M', 'L'], description: 'S under an hour, M a few hours, L a day or more.' },
            recommendation: { type: 'string', description: 'One concrete change to make.' },
            check: { type: 'string', description: 'A pass/fail check that proves the fix works, written as steps a tester could follow.' },
            reproduce: { type: 'string', description: 'Exact steps to reproduce the problem from app launch, for the verifier.' },
            seed: { type: 'string', enum: ['empty', 'three-weeks'], description: 'Which fake data set reproduces it.' },
          },
          required: ['title', 'kind', 'severity', 'runs', 'evidence', 'impact', 'effort', 'recommendation', 'check', 'reproduce', 'seed'],
        },
      },
    },
    required: ['findings'],
  },
};

const REVIEW_PROMPT = `You are the lead UX researcher reviewing usability test notes for a personal gym-tracking iPhone app.
Several AI testers used the app as different personas; you get every run's notes.
Your job:
- Merge notes that describe the same underlying problem, even if worded differently. List every run that saw it.
- Drop notes that are vague, out of scope for the goal, or contradicted by other runs.
- Keep praise only if it's specific; it tells us what not to break.
- Score severity on the user's experience, not on how dramatic the note sounds.
- Recommendations must be one concrete, buildable change. Checks must be pass/fail.
- Don't invent problems the notes don't support.
Answer only by calling submit_findings.`;

const client = DRY ? null : new Anthropic();
let findings;
if (DRY) {
  findings = [{ title: 'Dry finding', kind: 'friction', severity: 2, runs: [reports[0].run], evidence: 'dry', impact: 'dry', effort: 'S', recommendation: 'dry', check: 'dry', reproduce: 'Open the app', seed: 'empty' }];
} else {
  // This model doesn't allow forcing a specific tool (tool_choice "tool"/"any"),
  // so we ask nicely with "auto" and nudge once if it answers in prose instead.
  const messages = [{ role: 'user', content: JSON.stringify({ tasks, runs: evidence }) }];
  let call;
  for (let attempt = 0; attempt < 2 && !call; attempt++) {
    const res = await client.messages.create({
      model: MODEL, max_tokens: 4000, system: REVIEW_PROMPT,
      tools: [SUBMIT], tool_choice: { type: 'auto' }, messages,
    });
    reviewCost(res.usage);
    call = res.content.find((b) => b.type === 'tool_use' && b.name === 'submit_findings');
    if (!call) {
      messages.push({ role: 'assistant', content: res.content });
      messages.push({ role: 'user', content: 'Please submit your answer by calling submit_findings.' });
    }
  }
  findings = Array.isArray(call?.input?.findings) ? call.input.findings : [];
  findings = findings.filter((f) => f && f.title && Array.isArray(f.runs));
}

// ---- 3. Rank: severity × how many runs saw it, divided by effort ----
const runsTotal = new Set(reports.map((r) => r.run)).size;
const effortCost = { S: 1, M: 2, L: 4 };
for (const f of findings) {
  f.seenIn = `${f.runs.length}/${runsTotal} runs`;
  f.score = f.kind === 'praise' ? 0 : Math.round(((f.severity * (1 + f.runs.length)) / (effortCost[f.effort] ?? 2)) * 10) / 10;
}
findings.sort((a, b) => b.score - a.score);

// ---- 4. The verifier: a fresh agent tries to reproduce each top problem ----
const toVerify = findings.filter((f) => f.kind !== 'praise').slice(0, VERIFY_TOP);
if (toVerify.length) {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  for (const [i, f] of toVerify.entries()) {
    const system = `You are a QA verifier. A tester reported this problem in a gym-tracking iPhone app:
"${f.title}"
Their evidence: ${f.evidence}
Steps to reproduce: ${f.reproduce}

Follow the steps as an ordinary user would and check whether the problem really happens.
Use look after every action. Take a screenshot if appearance matters.
Call finish with success=true if you REPRODUCED the problem, success=false if the app behaved fine,
and a summary of exactly what you saw. Don't note new issues; just verify this one.`;
    console.log(`▶ verifying: ${f.title}`);
    const rep = await runSession({ task: { id: `verify-${i + 1}`, seed: f.seed }, system, client, browser, maxSteps: 15, folder: `verify-${i + 1}` });
    f.verified = rep.success ? 'confirmed' : 'not reproduced';
    f.verifierSaw = rep.summary;
    f.verifyCost = rep.costUSD;
    console.log(`  ${f.verified} (~$${rep.costUSD})`);
  }
  await browser.close();
}

// ---- 5. Write the recommendations ----
const sev = ['', 'minor', 'noticeable', 'blocking'];
const problems = findings.filter((f) => f.kind !== 'praise');
const praise = findings.filter((f) => f.kind === 'praise');
const cost = (reports.reduce((a, r) => a + r.costUSD, 0) + review.cost + toVerify.reduce((a, f) => a + (f.verifyCost ?? 0), 0)).toFixed(3);
const md = ['# Recommendations', '', `${problems.length} problem${problems.length === 1 ? '' : 's'} from ${runsTotal} test runs, ranked by severity × how often it showed up ÷ effort. Total cost about $${cost}.`, '',
  '| # | Problem | Severity | Seen in | Effort | Verified |', '| --- | --- | --- | --- | --- | --- |',
  ...problems.map((f, i) => `| ${i + 1} | ${f.title} | ${sev[f.severity]} | ${f.seenIn} | ${f.effort} | ${f.verified ?? 'not checked'} |`), ''];
problems.forEach((f, i) => {
  md.push(`## ${i + 1}. ${f.title}`, '',
    `**Evidence:** ${f.evidence}`, '',
    `**Why it matters:** ${f.impact}`, '',
    `**Recommendation:** ${f.recommendation}`, '',
    `**Done when:** ${f.check}`, '');
  if (f.verified) md.push(`**Verifier (${f.verified}):** ${f.verifierSaw}`, '');
});
if (praise.length) md.push('## Keep doing', '', ...praise.map((f) => `- ${f.title}: ${f.evidence}`), '');
fs.writeFileSync(path.join(OUT, 'recommendations.md'), md.join('\n'));
fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n' + md.join('\n'));
console.log(`\nRecommendations: ${path.join(OUT, 'recommendations.md')}`);

