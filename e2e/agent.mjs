// E2E tester agent: Claude drives the Gym Tracker app in a phone-sized browser
// as a persona, tries to reach a goal, and records what was hard.
//
//   node e2e/agent.mjs                 run every task in e2e/tasks.json
//   node e2e/agent.mjs is-bench-stalling   run one task
//   node e2e/agent.mjs --dry           check the browser plumbing without calling Claude (free)
//
// Needs ANTHROPIC_API_KEY in the environment (a GitHub secret when run in Actions)
// and the test build served at APP_URL (default http://localhost:4173/).

import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { SEEDS } from './seed.mjs';
import { TOOL_DEFS, look, run } from './tools.mjs';

const APP_URL = process.env.APP_URL ?? 'http://localhost:4173/';
const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-5-5';
const MAX_STEPS = Number(process.env.MAX_STEPS ?? 35);
const OUT = path.resolve('e2e/out');
const DRY = process.argv.includes('--dry');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// ---- 1. The instructions. This is where "act like a real user" lives. ----
function systemPrompt(task) {
  return `You are a usability tester. You play this persona: ${task.persona}

Your goal: ${task.goal}

You are using a gym-tracking app on an iPhone. You only know what is on the screen. You have never seen the code.

How to behave:
- Act like the persona would, not like a QA engineer. If they'd guess, guess. If they'd give up, give up.
- After every action, call look to see what changed.
- The moment something confuses you, slows you down, surprises you, or works really well, call note with exactly what you tried, what you expected and what happened. Notes are the most valuable thing you produce. Unclear labels, extra taps, hidden buttons and wrong results all count.
- If you fail at the same step 3 times, note it as severity 3 and move on or finish.
- Don't note things outside your goal unless they get in your way.
- When the goal is done (or you've given up), call finish.
Success looks like: ${task.success}`;
}

// ---- 2. The loop: Claude picks a tool, we run it, we send back the result. ----
async function runTask(task, client, browser) {
  const dir = path.join(OUT, task.id);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const seed = JSON.stringify(SEEDS[task.seed] ?? SEEDS.empty);
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('gym-tracker:v1', s); sessionStorage.setItem('seeded', '1'); } }, seed);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e.message)));
  await page.goto(APP_URL);
  await page.waitForTimeout(800);

  const notes = [];
  const transcript = [];
  let shots = 0;
  let result = null;
  const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  const started = Date.now();
  const messages = [{ role: 'user', content: [{ type: 'text', text: `Here is the screen you start on:\n\n${await look(page)}` }] }];

  const snap = async (label) => {
    const file = `${String(++shots).padStart(2, '0')}-${label}.png`;
    await page.screenshot({ path: path.join(dir, file) });
    return file;
  };
  await snap('start');

  for (let step = 1; step <= MAX_STEPS && !result; step++) {
    // Prompt caching: everything up to the newest message was already sent last step, so mark it
    // cacheable. Cached input costs ~10% of normal; without this a 35-step run re-pays for the
    // whole conversation every step.
    for (const m of messages) for (const c of m.content) if (typeof c === 'object') delete c.cache_control;
    const last = messages[messages.length - 1].content;
    last[last.length - 1].cache_control = { type: 'ephemeral' };
    const res = DRY ? dryModel(step) : await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: systemPrompt(task), cache_control: { type: 'ephemeral' } }],
      tools: TOOL_DEFS,
      messages,
    });
    if (res.stop_reason === 'max_tokens') console.log(`  step ${step}: reply was cut off at max_tokens`);
    if (res.usage) {
      usage.input += res.usage.input_tokens ?? 0;
      usage.output += res.usage.output_tokens ?? 0;
      usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
      usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    }
    messages.push({ role: 'assistant', content: res.content });
    const toolResults = [];
    for (const block of res.content) {
      if (block.type === 'text' && block.text.trim()) transcript.push({ step, thought: block.text.trim() });
      if (block.type !== 'tool_use') continue;
      const { name, input } = block;
      transcript.push({ step, tool: name, input });
      let content;
      try {
        if (name === 'look') content = await look(page);
        else if (name === 'screenshot') {
          const file = await snap(`step${step}`);
          content = [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: fs.readFileSync(path.join(dir, file)).toString('base64') } }];
        } else if (name === 'note') {
          const file = await snap(`${input.kind}`);
          notes.push({ ...input, step, screenshot: file });
          console.log(`  note (${input.kind}, ${input.severity}): ${String(input.text).slice(0, 160)}`);
          content = 'Noted.';
        } else if (name === 'finish') {
          // Validate what the model sent instead of trusting it matches the schema.
          console.log(`  finish: ${JSON.stringify(input).slice(0, 300)}`);
          const lastThought = [...transcript].reverse().find((t) => t.thought)?.thought;
          result = {
            success: input.success === true || input.success === 'true',
            summary: (typeof input.summary === 'string' && input.summary.trim()) || lastThought || '(The agent finished without a summary.)',
          };
          await snap('end');
          content = 'Session ended.';
        } else content = await run(page, name, input);
      } catch (e) {
        content = `That didn't work: ${String(e.message).split('\n')[0]}. Call look to see the current screen.`;
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content });
    }
    if (!toolResults.length) {
      // Claude answered without using a tool: nudge it back into the loop.
      messages.push({ role: 'user', content: [{ type: 'text', text: 'Keep going: use a tool, or call finish if you are done.' }] });
    } else messages.push({ role: 'user', content: toolResults });
  }
  await ctx.close();

  const report = {
    task: task.id,
    persona: task.persona,
    goal: task.goal,
    success: result?.success ?? false,
    summary: result?.summary ?? `Did not finish within ${MAX_STEPS} steps.`,
    steps: transcript.filter((t) => t.tool).length,
    seconds: Math.round((Date.now() - started) / 1000),
    notes,
    consoleErrors,
    usage,
    // Estimate at $3 / $15 per million input / output tokens; cache writes 1.25x, reads 0.1x.
    // Check current prices for your model at anthropic.com/pricing and adjust.
    costUSD: Math.round(((usage.input * 3 + usage.cacheWrite * 3.75 + usage.cacheRead * 0.3 + usage.output * 15) / 1e6) * 1000) / 1000,
  };
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify(transcript, null, 2));
  return report;
}

// ---- 3. A free fake "model" so we can test the plumbing without spending credits. ----
function dryModel(step) {
  const t = (name, input = {}) => ({ type: 'tool_use', id: `t${step}`, name, input });
  const script = [t('look'), t('tap', { id: 1 }), t('look'), t('note', { kind: 'praise', text: 'Dry run note', severity: 1 }), t('finish', { success: true, summary: 'Dry run finished.' })];
  return { content: [script[Math.min(step - 1, script.length - 1)]] };
}

// ---- 4. Run the tasks and write one readable summary. ----
const tasks = JSON.parse(fs.readFileSync('e2e/tasks.json', 'utf8')).filter((t) => !only.length || only.includes(t.id));
const client = DRY ? null : new Anthropic();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const reports = [];
for (const task of tasks) {
  console.log(`▶ ${task.id}`);
  const r = await runTask(task, client, browser);
  console.log(`  ${r.success ? 'passed' : 'FAILED'} in ${r.steps} steps, ${r.notes.length} notes, ~$${r.costUSD}`);
  reports.push(r);
}
await browser.close();

const sev = ['', 'minor', 'noticeable', 'blocking'];
const md = [`# Agent test run`, '', `| Task | Result | Actions | Notes | Cost |`, `| --- | --- | --- | --- | --- |`,
  ...reports.map((r) => `| ${r.task} | ${r.success ? 'passed' : 'failed'} | ${r.steps} | ${r.notes.length} | $${r.costUSD} |`), ''];
for (const r of reports) {
  md.push(`## ${r.task}`, '', `**Goal:** ${r.goal}`, '', `**How it went:** ${r.summary}`, '');
  for (const n of [...r.notes].sort((a, b) => b.severity - a.severity)) md.push(`- **${n.kind}, ${sev[n.severity]}** (step ${n.step}, ${n.screenshot}): ${n.text}`);
  if (r.consoleErrors.length) md.push('', `App errors: ${r.consoleErrors.join('; ')}`);
  md.push('');
}
fs.writeFileSync(path.join(OUT, 'summary.md'), md.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n'));
console.log(`\nReport: ${path.join(OUT, 'summary.md')}`);
