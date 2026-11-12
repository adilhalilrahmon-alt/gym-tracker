// The agent's senses and hands. Each tool has:
//   - a definition Claude sees (name, description, input schema)
//   - code that runs it in the real browser and returns what happened
// Good tools are the biggest lever on agent quality: give it a clear view of the screen
// and a small set of human-like actions, and it behaves like a person would.

export const TOOL_DEFS = [
  {
    name: 'look',
    description: 'Read the current screen: visible text plus every tappable or typeable element, each with an [id] you can use with tap/type. Use this after every action.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'screenshot',
    description: 'See the screen as an image. Use when layout, colour, size or what stands out matters (for example: is a button easy to find? is text readable?). Costs more than look, so use it sparingly.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'tap',
    description: 'Tap an element by its [id] from the last look.',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  },
  {
    name: 'type',
    description: 'Replace the text in an input or text area by its [id]. Type the way your persona would (including their typos and shorthand).',
    input_schema: { type: 'object', properties: { id: { type: 'integer' }, text: { type: 'string' } }, required: ['id', 'text'] },
  },
  {
    name: 'scroll',
    description: 'Scroll the screen up or down.',
    input_schema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] } }, required: ['direction'] },
  },
  {
    name: 'note',
    description: 'Record an observation the moment it happens. kind: bug (something broken or wrong), friction (confusing, slow, too many taps, unclear wording), praise (something that worked especially well). Be specific: what you tried, what you expected, what happened.',
    input_schema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['bug', 'friction', 'praise'] }, text: { type: 'string' }, severity: { type: 'integer', minimum: 1, maximum: 3, description: '1 minor, 2 noticeable, 3 blocks the goal' } },
      required: ['kind', 'text', 'severity'],
    },
  },
  {
    name: 'finish',
    description: 'End the session. success: did you achieve the goal? summary: 2-3 sentences on how it went from the persona\'s point of view.',
    input_schema: { type: 'object', properties: { success: { type: 'boolean' }, summary: { type: 'string' } }, required: ['success', 'summary'] },
  },
];

// Label every visible interactive element with a number and describe the screen as text.
// Text is ~20x cheaper than a screenshot, so the agent "looks" with this most of the time.
export async function look(page) {
  return page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('[data-agent-id]').forEach((el) => el.removeAttribute('data-agent-id'));
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight;
    };
    const items = [];
    for (const el of document.querySelectorAll('button, a[href], input, textarea, select, summary, [role=button]')) {
      if (!visible(el) || el.disabled) continue;
      const id = ++n;
      el.setAttribute('data-agent-id', String(id));
      const label = (el.getAttribute('aria-label') || el.labels?.[0]?.innerText || el.innerText || el.placeholder || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      const kind = el.tagName === 'TEXTAREA' ? 'text area' : el.tagName === 'INPUT' ? `${el.type} input` : el.tagName === 'SELECT' ? 'dropdown' : 'button';
      const value = 'value' in el && el.tagName !== 'BUTTON' && el.value ? ` = "${String(el.value).slice(0, 80)}"` : '';
      items.push(`[${id}] ${kind}: ${label}${value}`);
    }
    const text = document.body.innerText.replace(/\n{2,}/g, '\n').trim().slice(0, 2500);
    return `SCREEN TEXT:\n${text}\n\nYOU CAN USE:\n${items.join('\n') || '(nothing interactive visible)'}`;
  });
}

export async function run(page, name, input) {
  const el = (id) => page.locator(`[data-agent-id="${id}"]`);
  switch (name) {
    case 'tap':
      await el(input.id).click({ timeout: 3000 });
      await page.waitForTimeout(400);
      return `Tapped [${input.id}].`;
    case 'type':
      await el(input.id).fill(input.text, { timeout: 3000 });
      await page.waitForTimeout(300);
      return `Typed into [${input.id}].`;
    case 'scroll':
      await page.mouse.wheel(0, input.direction === 'down' ? 500 : -500);
      await page.locator('main').first().evaluate((m, d) => m.scrollBy(0, d === 'down' ? 500 : -500), input.direction).catch(() => {});
      await page.waitForTimeout(300);
      return `Scrolled ${input.direction}.`;
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}
