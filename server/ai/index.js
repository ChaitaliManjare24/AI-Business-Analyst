'use strict';
/**
 * AI orchestration layer.
 *
 * Providers are resolved from server-side environment variables only — no key
 * ever reaches the browser. If no provider is configured (or the upstream call
 * fails) the Local Engine handles the request, so the product always works.
 *
 *   AI_PROVIDER=openai|anthropic|gemini|openrouter|local  (optional override)
 */
const local = require('./local');
const T = require('../lib/text');

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 45000);

const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    key: () => process.env.OPENAI_API_KEY,
    base: () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: () => process.env.OPENAI_MODEL || 'gpt-4o-mini',
    style: 'openai'
  },
  openrouter: {
    label: 'OpenRouter',
    key: () => process.env.OPENROUTER_API_KEY,
    base: () => (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    model: () => process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    style: 'openai'
  },
  anthropic: {
    label: 'Anthropic',
    key: () => process.env.ANTHROPIC_API_KEY,
    base: () => (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1').replace(/\/$/, ''),
    model: () => process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022',
    style: 'anthropic'
  },
  gemini: {
    label: 'Google Gemini',
    key: () => process.env.GEMINI_API_KEY,
    base: () => (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
    model: () => process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    style: 'gemini'
  }
};

function resolveProvider() {
  const forced = (process.env.AI_PROVIDER || '').toLowerCase().trim();
  if (forced === 'local' || forced === 'off' || forced === 'none') return null;
  if (forced && PROVIDERS[forced] && PROVIDERS[forced].key()) {
    return { name: forced, ...PROVIDERS[forced] };
  }
  for (const [name, cfg] of Object.entries(PROVIDERS)) {
    if (cfg.key()) return { name, ...cfg };
  }
  return null;
}

const active = resolveProvider();
let probeState = { checked: false, ok: false, error: null };

function status() {
  if (!activeProvider) {
    return {
      provider: 'local',
      label: 'Built-in Local Engine',
      model: 'deterministic-nlp-v1',
      hosted: false,
      note: probeState.error
        ? `Hosted model unavailable (${probeState.error.slice(0, 90)}) — using the built-in engine.`
        : 'Running on the offline engine — no API key configured on the server.'
    };
  }
  return {
    provider: activeProvider.name,
    label: activeProvider.label,
    model: activeProvider.model(),
    hosted: true,
    note: `Connected to ${activeProvider.label} (${activeProvider.model()}).`
  };
}

/**
 * Verify the configured provider once at boot. A rejected key (401/403) or a
 * failing endpoint demotes the app to the local engine instead of surfacing
 * broken output to the user.
 */
async function probe() {
  if (!active) return status();
  try {
    const reply = await complete({ system: 'Reply with the single word: ok', user: 'ping', maxTokens: 12, temperature: 0 });
    probeState = { checked: true, ok: Boolean(reply), error: null };
    if (!reply) throw new Error('empty response');
  } catch (err) {
    const message = String(err.message || 'unknown error').slice(0, 160);
    console.warn(`[ai] provider ${active.name} unavailable — falling back to local engine: ${message}`);
    probeState = { checked: true, ok: false, error: message };
    activeProvider = null;
  }
  return status();
}

let activeProvider = active;
function current() { return activeProvider; }

async function withTimeout(promise, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(raw) {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const opener = candidate[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Single text completion against whichever provider is configured. */
async function complete({ system, user, maxTokens = 1400, temperature = 0.5 }) {
  const provider = activeProvider;
  if (!provider) throw new Error('NO_PROVIDER');
  const model = provider.model();

  return withTimeout(async (signal) => {
    if (provider.style === 'anthropic') {
      const res = await fetch(`${provider.base()}/messages`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': provider.key(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [{ role: 'user', content: user }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return (data.content || []).map((c) => c.text || '').join('').trim();
    }

    if (provider.style === 'gemini') {
      const res = await fetch(`${provider.base()}/models/${model}:generateContent`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': provider.key() },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature }
        })
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      return parts.map((p) => p.text || '').join('').trim();
    }

    const res = await fetch(`${provider.base()}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${provider.key()}`
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    if (!res.ok) throw new Error(`OpenAI-compatible ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || '').trim();
  });
}

/**
 * Run a JSON-output task. `fallback` produces the local-engine result if the
 * model is unavailable, errors, or returns unusable JSON.
 */
async function jsonTask({ system, user, fallback, maxTokens = 1600, temperature = 0.4, shape }) {
  if (!activeProvider) {
    return { ...fallback(), engine: 'local' };
  }
  try {
    const raw = await complete({ system, user, maxTokens, temperature });
    const parsed = extractJson(raw);
    if (!parsed) throw new Error('MODEL_JSON_PARSE_FAILED');
    const merged = { ...fallback(), ...shape(parsed), engine: `${activeProvider.name}:${activeProvider.model()}` };
    return merged;
  } catch (err) {
    console.warn('[ai] falling back to local engine:', err.message);
    return { ...fallback(), engine: 'local', degraded: true, warning: err.message };
  }
}

// ------------------------------------------------------------------- tasks

const SYSTEM_BASE = `You are the AI engine inside a business productivity suite used by students, entrepreneurs and small business owners.
Write in clear, plain British English. Never invent facts, figures or dates that are not in the input.
Always return a single valid JSON object with exactly the requested keys and nothing else.`;

const toneGuide = {
  formal: 'Formal: courteous, no contractions, no exclamation marks, suitable for senior external stakeholders.',
  professional: 'Professional: clear, confident and warm-neutral, suitable for most business correspondence.',
  friendly: 'Friendly: warm and human but still business-appropriate; at most one exclamation mark.'
};

async function emailTask(input) {
  const { mode, tone, recipient, senderName, subject, brief, points, length } = input;
  const fallback = () => local.draftEmail(input);
  const user = `Task: draft an email.
Mode: ${mode === 'followup' ? 'follow-up to an earlier message' : mode === 'reply' ? 'reply to a received message' : 'new email'}
Tone: ${toneGuide[tone] || toneGuide.professional}
Recipient name: ${recipient || '(unknown — use a neutral greeting)'}
Sender name: ${senderName || '(omit or use a neutral sign-off)'}
Subject hint: ${subject || '(none)'}
Length: ${length || 'medium'}
Content brief:
"""
${brief || ''}
"""
${points && points.length ? `Key points to include:\n${points.map((p) => `- ${p}`).join('\n')}` : ''}

Return JSON: {"subject": string (max 90 chars, no quotes), "body": string (full email with greeting and sign-off, newlines allowed), "tips": string[] (2-3 short improvement tips)}.`;

  const result = await jsonTask({
    system: SYSTEM_BASE,
    user,
    fallback,
    shape: (p) => ({
      subject: typeof p.subject === 'string' ? p.subject.slice(0, 140) : undefined,
      body: typeof p.body === 'string' ? p.body : undefined,
      tips: Array.isArray(p.tips) ? p.tips.slice(0, 4).map(String) : undefined
    })
  });
  return scrubUndefined(result, ['subject', 'body', 'tips']);
}

async function rewriteTask(input) {
  const { text, tone } = input;
  const fallback = () => local.rewriteEmail(input);
  const user = `Task: rewrite the informal message below so it is ready to send in a business context.
Target tone: ${toneGuide[tone] || toneGuide.professional}
Keep every fact, name, number and request. Do not add new information. Fix grammar, structure and politeness.

Original message:
"""
${text}
"""

Return JSON: {"subject": string (max 90 chars, fitting the message), "body": string (greeting, body, sign-off), "tips": string[] (2-3 short notes on what was changed)}.`;

  const result = await jsonTask({
    system: SYSTEM_BASE,
    user,
    fallback,
    shape: (p) => ({
      subject: typeof p.subject === 'string' ? p.subject.slice(0, 140) : undefined,
      body: typeof p.body === 'string' ? p.body : undefined,
      tips: Array.isArray(p.tips) ? p.tips.slice(0, 4).map(String) : undefined
    })
  });
  return scrubUndefined(result, ['subject', 'body', 'tips']);
}

async function documentTask(input) {
  const { text, title } = input;
  const excerpt = text.slice(0, 14000);
  const fallback = () => local.analyseDocument(text, { title });
  const user = `Task: analyse the business document below for a busy manager.
1. Summary: 3-5 sentences, factual, no preamble.
2. key_points: 4-6 short bullets of the most decision-relevant information.
3. dates: every explicit date or deadline, with "raw" exactly as written and "iso" as YYYY-MM-DD when determinable, else null.
4. figures: money amounts, percentages and quantities with a short "context" phrase from the document.
5. actions: concrete action items, each {"title","owner","due","priority"} — owner/due null when not stated; priority one of "high","medium","low".
6. keywords: up to 8 salient single words.
Document title: ${title || '(untitled)'}
Document:
"""
${excerpt}
"""

Return JSON: {"summary": string, "key_points": string[], "dates": [{"raw": string, "iso": string|null}], "figures": [{"value": string, "label": string, "context": string}], "actions": [{"title": string, "owner": string|null, "due": string|null, "priority": string}], "keywords": [{"word": string, "count": number}]}.`;

  const result = await jsonTask({
    system: SYSTEM_BASE,
    user,
    fallback,
    maxTokens: 2200,
    shape: (p) => ({
      summary: typeof p.summary === 'string' ? p.summary : undefined,
      key_points: Array.isArray(p.key_points) ? p.key_points.slice(0, 8).map(String) : undefined,
      dates: Array.isArray(p.dates) ? p.dates.slice(0, 24) : undefined,
      figures: Array.isArray(p.figures) ? p.figures.slice(0, 20) : undefined,
      actions: Array.isArray(p.actions) ? p.actions.slice(0, 10) : undefined,
      keywords: Array.isArray(p.keywords) ? p.keywords.slice(0, 10) : undefined
    })
  });
  return { ...result, word_count: T.words(text).length, reading_minutes: T.readingMinutes(text) };
}

async function meetingTask(input) {
  const { text, title } = input;
  const excerpt = text.slice(0, 14000);
  const fallback = () => local.analyseMeeting(text, { title });
  const user = `Task: turn the meeting notes below into a management-ready record.
1. summary: 2-4 sentences on what was discussed and the outcome.
2. decisions: explicit decisions only. If none, return an empty array.
3. actions: concrete tasks, each {"title","owner","due","priority"} — owner/due null when not stated, priority "high"|"medium"|"low".
4. attendees: names explicitly present in the notes.
Meeting title: ${title || '(untitled)'}
Notes:
"""
${excerpt}
"""

Return JSON: {"summary": string, "decisions": string[], "actions": [{"title": string, "owner": string|null, "due": string|null, "priority": string}], "attendees": string[]}.`;

  const result = await jsonTask({
    system: SYSTEM_BASE,
    user,
    fallback,
    maxTokens: 1800,
    shape: (p) => ({
      summary: typeof p.summary === 'string' ? p.summary : undefined,
      decisions: Array.isArray(p.decisions) ? p.decisions.slice(0, 10).map(String) : undefined,
      actions: Array.isArray(p.actions) ? p.actions.slice(0, 12) : undefined,
      attendees: Array.isArray(p.attendees) ? p.attendees.slice(0, 12).map(String) : undefined
    })
  });
  return result;
}

async function reportTask(input) {
  const fallback = () => {
    const r = local.buildReport(input);
    return { ...r, content_md: r.markdown };
  };
  const metricLines = (input.metrics || [])
    .filter((m) => m && m.name)
    .map((m) => `- ${m.name}: current ${m.current}${m.previous !== '' && m.previous !== null && m.previous !== undefined ? `, previous ${m.previous}` : ''}`)
    .join('\n');

  const user = `Task: write a business performance report in Markdown.
Business: ${input.businessName}
Period: ${input.period || 'not specified'}
Currency: ${input.currency || 'USD'}
Audience: ${input.audience || 'internal management'}
Metrics:
${metricLines || '(none supplied)'}
Context notes:
"""
${(input.notes || '').slice(0, 4000)}
"""

Requirements: use these sections — # Title, ## Executive summary, ## Performance overview (a Markdown table of metrics with a change column), ## Key observations (numbered), ## Recommendations (numbered, each with a concrete action), ## Risks and watch list, ## Next steps. Compute percentage changes yourself only from the numbers supplied. Do not invent figures.
Return JSON: {"title": string, "content_md": string, "observations": string[], "recommendations": string[]}.`;

  const result = await jsonTask({
    system: SYSTEM_BASE,
    user,
    fallback,
    maxTokens: 2400,
    temperature: 0.45,
    shape: (p) => ({
      title: typeof p.title === 'string' ? p.title : undefined,
      content_md: typeof p.content_md === 'string' ? p.content_md : undefined,
      observations: Array.isArray(p.observations) ? p.observations.slice(0, 10).map(String) : undefined,
      recommendations: Array.isArray(p.recommendations) ? p.recommendations.slice(0, 8).map(String) : undefined
    })
  });
  return result;
}

function scrubUndefined(result, keys) {
  const out = { ...result };
  for (const k of keys) if (out[k] === undefined) delete out[k];
  return out;
}

module.exports = { status, probe, complete, complete, emailTask, rewriteTask, documentTask, meetingTask, reportTask, extractJson };
