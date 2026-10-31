'use strict';
/**
 * Deterministic text-analysis toolkit.
 *
 * Everything here is used by the offline engine so the product is fully
 * functional without an external AI key, and several helpers are reused to
 * pre-process input before it is sent to a hosted model.
 */

const STOPWORDS = new Set(`a about above after again against all am an and any are aren't as at be because been before being below between both but by can cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he her here hers herself him himself his how i i'm if in into is isn't it it's its itself just me more most my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she should shouldn't so some such than that the their theirs them themselves then there these they this those through to too under until up very was wasn't we were weren't what when where which while who whom why with won't would wouldn't you your yours yourself yourselves will would can've we've we're they're i've don't also may might must shall let's us ok okay yeah`.split(/\s+/));

const ACTION_CUES = [
  'will', 'need to', 'needs to', 'should', 'must', 'action item', 'action:', 'to do', 'to-do',
  'follow up', 'follow-up', 'send', 'prepare', 'schedule', 'draft', 'review', 'share', 'create',
  'update', 'confirm', 'finalise', 'finalize', 'deliver', 'email', 'call', 'book', 'arrange',
  "i'll", "we'll", "you'll", 'assign', 'chase', 'investigate', 'complete', 'set up'
];

const cueRegex = (cue) => new RegExp(`(^|[^a-z])${cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}([^a-z]|$)`, 'i');
const ACTION_CUE_RES = ACTION_CUES.map(cueRegex);
const STRONG_ACTION = /\b(will|needs? to|has to|should|must|to-?do|action item|assign(?:ed)?|follow[\s-]?up|please|i'?ll|we'?ll|you'?ll)\b/i;
const NAME_TO_VERB = /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+(?:to|will|should|needs to|must)\s+/;

const DECISION_CUES = [
  'decided', 'decision', 'agreed', 'agree to', 'approved', 'approve', 'signed off', 'concluded',
  'we will go with', 'going with', 'chose', 'chosen', 'resolved', 'confirmed', 'rejected', 'postponed',
  'moved to', 'selected'
];

const DECISION_CUE_RES = DECISION_CUES.map(cueRegex);

const PRIORITY_CUES = {
  high: ['urgent', 'asap', 'critical', 'immediately', 'high priority', 'blocker', 'today', 'overdue', 'escalate'],
  low: ['when possible', 'nice to have', 'low priority', 'optional', 'if time permits', 'eventually', 'someday']
};

// ---------------------------------------------------------------- primitives

function clean(text = '') {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const METADATA_LINE = /^(attendees|present|participants|apologies|date|time|location|venue|subject|minutes|agenda|action items?|actions|decisions?|next steps|notes|title|meeting)\b\s*[:\-]/i;

/** Sentence splitter that respects line breaks and re-joins wrapped lines. */
function sentences(text = '') {
  const rawLines = clean(text)
    .replace(/\n{2,}/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // Group physical lines back into logical ones: PDFs and pasted text wrap
  // mid-sentence, while bullets and "Attendees:" style headers stand alone.
  const groups = [];
  let buffer = '';
  for (const line of rawLines) {
    const isBullet = /^[-–—•*]\s|^\d+[.)]\s/.test(line);
    const previousComplete = /[.!?)\]"”’]$/.test(buffer);
    const bufferIsHeading = buffer.length > 0 && buffer.length < 45 && !/[.,;:]$/.test(buffer);
    if (buffer && (isBullet || METADATA_LINE.test(line) || previousComplete || bufferIsHeading)) {
      groups.push(buffer);
      buffer = line;
    } else if (!buffer) {
      buffer = line;
    } else {
      buffer = `${buffer} ${line}`;
    }
  }
  if (buffer) groups.push(buffer);

  const parts = [];
  for (const group of groups) {
    const found = group.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [];
    for (const piece of found) {
      const value = piece.trim().replace(/^[-–—•*]\s*/, '');
      if (value) parts.push(value);
    }
  }
  return parts.filter((s) => s.split(/\s+/).length > 2);
}

function words(text = '') {
  return (String(text).toLowerCase().match(/[a-z0-9][a-z0-9'’\-]*/g) || []);
}

function contentWords(text = '') {
  return words(text).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function wordFrequencies(text = '') {
  const freq = new Map();
  for (const w of contentWords(text)) freq.set(w, (freq.get(w) || 0) + 1);
  return freq;
}

function keywords(text = '', limit = 8) {
  const freq = wordFrequencies(text);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

/** Frequency + position weighted sentence ranking (a light TextRank-style score). */
function scoreSentences(text) {
  const freq = wordFrequencies(text);
  const max = Math.max(1, ...freq.values());
  return sentences(text)
    .filter((sentence) => !METADATA_LINE.test(sentence))
    .map((sentence, index, arr) => {
    const tokens = contentWords(sentence);
    if (!tokens.length) return { sentence, index, score: 0 };
    const density = tokens.reduce((sum, w) => sum + (freq.get(w) || 0) / max, 0) / tokens.length;
    const positionBoost = index === 0 ? 1.35 : index < 3 ? 1.12 : 1;
    const lengthPenalty = tokens.length < 4 ? 0.6 : tokens.length > 45 ? 0.85 : 1;
    const cueBoost = /(therefore|important|result|conclusion|key|recommend|overall|summary)/i.test(sentence) ? 1.12 : 1;
    // Action items belong in the action list, not the narrative summary.
    const actionPenalty = /^(?:[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+)(?:will|to|needs to|should|must)\b|^action item\b/i.test(sentence) ? 0.55 : 1;
    const score = density * positionBoost * lengthPenalty * cueBoost * actionPenalty;
    void arr;
    return { sentence, index, score };
  });
}

/**
 * Extractive summary of `text` in roughly `maxSentences` sentences,
 * returned in original document order.
 */
function summarise(text, maxSentences = 4) {
  const scored = scoreSentences(text).filter((s) => s.score > 0);
  if (!scored.length) return clean(text).slice(0, 400);
  const picked = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);
  return picked.join(' ');
}

/** Top-N most informative sentences as bullet points. */
function bulletPoints(text, limit = 5) {
  const scored = scoreSentences(text).filter((s) => s.score > 0);
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((s) => tidySentence(s.sentence));
}

function tidySentence(s = '') {
  const trimmed = s.trim().replace(/^[-•*\d.)\s]+/, '');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function readingMinutes(text = '') {
  const count = words(text).length;
  return Math.max(0.2, Math.round((count / 220) * 10) / 10);
}

// ------------------------------------------------------------- entity parsing

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function toIso(year, month, day) {
  const d = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Find explicit dates in free text and normalise the parseable ones to
 * YYYY-MM-DD. `reference` anchors relative expressions ("next Friday").
 */
function extractDates(text = '', reference = new Date()) {
  const found = [];
  const source = String(text);

  const push = (raw, iso) => {
    const label = raw.trim().replace(/[.,;:]+$/, '');
    if (!label) return;
    if (!found.some((f) => f.raw.toLowerCase() === label.toLowerCase())) {
      found.push({ raw: label, iso: iso || null });
    }
  };

  // ISO 2024-03-12
  for (const m of source.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    push(m[0], toIso(+m[1], +m[2] - 1, +m[3]));
  }
  // A bare "30 September" written in December almost certainly means next year;
  // a date a few weeks ago is simply in the past and must stay there.
  const rollForward = (iso) => {
    if (!iso) return iso;
    const ref = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
    const parsed = new Date(`${iso}T00:00:00Z`);
    const daysAgo = (ref - parsed) / 86400000;
    if (daysAgo <= 300) return iso;
    parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
    return parsed.toISOString().slice(0, 10);
  };

  // 12 March 2024 / 12th of March 2024
  for (const m of source.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?\s*,?\s*(\d{4})?\b/g)) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month === undefined) continue;
    const year = m[3] ? +m[3] : reference.getUTCFullYear();
    const iso = toIso(year, month, +m[1]);
    push(m[0], m[3] ? iso : rollForward(iso));
  }
  // March 12, 2024 / March 12
  for (const m of source.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})?\b/g)) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month === undefined) continue;
    const year = m[3] ? +m[3] : reference.getUTCFullYear();
    const iso = toIso(year, month, +m[2]);
    push(m[0], m[3] ? iso : rollForward(iso));
  }
  // 12/03/2024 and 12/03
  for (const m of source.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const year = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : reference.getUTCFullYear();
    const a = +m[1];
    const b = +m[2];
    const iso = toIso(year, b - 1, a);
    push(m[0], m[3] ? iso : rollForward(iso));
  }
  // Relative weekday: "by Friday", "next Monday"
  for (const m of source.matchAll(/\b(?:by|on|before|next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi)) {
    const target = WEEKDAYS[m[1].toLowerCase()];
    const base = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
    let delta = (target - base.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7;
    base.setUTCDate(base.getUTCDate() + delta);
    push(m[0], base.toISOString().slice(0, 10));
  }
  // Relative words
  const rel = [
    [/\btoday\b/i, 0], [/\btomorrow\b/i, 1], [/\bday after tomorrow\b/i, 2], [/\bnext week\b/i, 7],
    [/\bnext month\b/i, 30], [/\bend of (?:the )?month\b/i, null], [/\bnext quarter\b/i, 90]
  ];
  for (const [re, offset] of rel) {
    const m = source.match(re);
    if (!m) continue;
    let iso = null;
    if (offset !== null) {
      const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
      d.setUTCDate(d.getUTCDate() + offset);
      iso = d.toISOString().slice(0, 10);
    } else {
      const d = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0));
      iso = d.toISOString().slice(0, 10);
    }
    push(m[0], iso);
  }
  // Time of day
  for (const m of source.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi)) {
    push(m[0], null);
  }

  return found.slice(0, 24);
}

/** Monetary amounts, percentages and bare quantities worth flagging. */
function extractFigures(text = '') {
  const source = String(text);
  const out = [];
  const seen = new Set();
  const push = (value, label, context) => {
    const key = value.toLowerCase();
    if (seen.has(key) || out.length >= 20) return;
    seen.add(key);
    out.push({ value: value.trim(), label, context: context.trim().replace(/\s+/g, ' ').slice(0, 140) });
  };

  const money = /(?:[$£€₹]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|bn|b|million|billion|thousand))?)|(?:\b\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP|INR|dollars|euros|pounds)\b)/gi;
  for (const m of source.matchAll(money)) push(m[0].replace(/[,;:.]+$/, ''), 'currency', sentenceAround(source, m.index));

  const pct = /\b\d+(?:\.\d+)?\s?%/g;
  for (const m of source.matchAll(pct)) push(m[0], 'percentage', sentenceAround(source, m.index));

  const count = /\b\d[\d,]*(?:\.\d+)?\s+(?:customers|clients|users|orders|units|employees|staff|leads|sales|projects|tickets|hours|days|weeks|months|years)\b/gi;
  for (const m of source.matchAll(count)) push(m[0], 'quantity', sentenceAround(source, m.index));

  return out;
}

function sentenceAround(text, index) {
  const re = /[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g;
  let match;
  while ((match = re.exec(text))) {
    const startIdx = match.index;
    const endIdx = match.index + match[0].length;
    if (index >= startIdx && index <= endIdx) {
      return match[0].trim().replace(/\s+/g, ' ').slice(0, 240);
    }
  }
  return text.slice(Math.max(0, index - 100), index + 120).trim().replace(/\s+/g, ' ');
}

function detectPriority(text = '') {
  const lower = String(text).toLowerCase();
  for (const cue of PRIORITY_CUES.high) if (lower.includes(cue)) return 'high';
  for (const cue of PRIORITY_CUES.low) if (lower.includes(cue)) return 'low';
  return 'medium';
}

/** Split an action sentence into {owner, task, due}. */
function parseAction(rawSentence) {
  let text = tidySentence(rawSentence).replace(/^(action item|action|to-?do|task)\s*[:\-]\s*/i, '');
  let owner = null;

  const ownerPatterns = [
    /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:will|is going to|to|should|needs to|must|owns)\b/,
    /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[:\-]\s*/,
    /\b(?:owner|assigned to|responsible)\s*[:\-]\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i
  ];
  for (const re of ownerPatterns) {
    const m = text.match(re);
    if (m && m[1] && !/^(the|we|i|it|this|that|all|team|everyone)$/i.test(m[1])) {
      owner = m[1];
      text = text.replace(re, (full) => full.replace(m[1], '').replace(/^[\s:\-]+/, ''));
      break;
    }
  }

  const dueMatch = text.match(/\b(?:by|before|due|deadline|on|from|starting(?: on)?)\s+((?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:[A-Z][a-z]{2,9}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:\s+\d{4})?|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today|end of (?:the )?month|next week)\b/i);
  let due = null;
  if (dueMatch) {
    const extracted = extractDates(dueMatch[0]);
    due = extracted.find((d) => d.iso)?.iso || null;
  }

  const title = text
    .replace(/[.;]+$/, '')
    .replace(/^(please\s+)/i, '')
    .replace(/^(will|is going to|to|should|must|needs? to|has to)\s+/i, '')
    .trim();

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    owner,
    due,
    priority: detectPriority(text)
  };
}

function extractActions(text = '', limit = 8) {
  const list = sentences(text);
  const found = [];
  for (const rawSentence of list) {
    // "Action items: David will…" keeps the payload, drops the label.
    const s = rawSentence.replace(/^(action items?|actions|next steps|to-?dos?)\s*[:\-]\s*/i, '');
    if (!s || METADATA_LINE.test(s)) continue;
    const lower = s.toLowerCase();
    if (/\?\s*$/.test(s)) continue;

    const hasActionCue = ACTION_CUE_RES.some((re) => re.test(lower));
    const namedAction = NAME_TO_VERB.test(s);
    const stronglyActionable = STRONG_ACTION.test(lower);
    if (!hasActionCue && !namedAction) continue;
    // A plain past-tense report ("Ava reviewed the numbers") is not an action.
    if (!namedAction && !stronglyActionable && !/\b(to|for)\b.*\b(by|before|deadline)\b/i.test(lower)) {
      // keep only when the cue verb is in base form after a modal-free bullet list
      if (!/^[-–—•*]/.test(s) && !/^(send|prepare|schedule|draft|share|update|confirm|deliver|book|arrange|chase|complete|email|call)\b/i.test(s)) continue;
    }
    const strongDecision = STRONG_DECISION_CUES.some((cue) => lower.includes(cue));
    if (strongDecision && !/\bwill\b/i.test(lower)) continue;

    const action = parseAction(s);
    if (action.title.split(/\s+/).length < 2) continue;
    if (found.some((f) => f.title.toLowerCase() === action.title.toLowerCase())) continue;
    found.push(action);
    if (found.length >= limit) break;
  }
  return found;
}

const STRONG_DECISION_CUES = ['decided', 'agreed', 'approved', 'signed off', 'concluded', 'resolved', 'chose', 'chosen', 'rejected', 'postponed'];

function extractDecisions(text = '', limit = 6) {
  const found = [];
  for (const rawSentence of sentences(text)) {
    const s = rawSentence.replace(/^(decisions?|we agreed|outcomes?)\s*[:\-]\s*/i, '');
    if (!s) continue;
    const lower = s.toLowerCase();
    if (METADATA_LINE.test(s)) continue;
    if (!DECISION_CUE_RES.some((re) => re.test(lower))) continue;
    // "Tom needs to approve X" is an action, not a decision.
    const looksLikeAction = /\b(needs? to|has to|will|should|must|to-?do)\b/i.test(lower);
    if (looksLikeAction && !STRONG_DECISION_CUES.some((cue) => lower.includes(cue))) continue;
    const cleaned = tidySentence(s);
    if (found.some((f) => f.toLowerCase() === cleaned.toLowerCase())) continue;
    found.push(cleaned);
    if (found.length >= limit) break;
  }
  return found;
}

function extractAttendees(text = '') {
  const names = new Set();
  const m = text.match(/(?:attendees|present|participants|people)\s*[:\-]\s*([^\n.]+)/i);
  if (m) {
    m[1].split(/,|\band\b|;/).forEach((n) => {
      const name = n.trim().replace(/\.$/, '');
      if (name && name.length < 40) names.add(name);
    });
  }
  for (const s of sentences(text)) {
    for (const hit of s.matchAll(/\b([A-Z][a-z]{2,})\s+(?:said|asked|mentioned|proposed|suggested|confirmed|noted|agreed|will)\b/g)) {
      if (!STOPWORDS.has(hit[1].toLowerCase())) names.add(hit[1]);
    }
  }
  const list = [...names].filter((name) => ![...names].some((other) => other !== name && other.startsWith(`${name} `)));
  return list.slice(0, 10);
}

/** Very light grammar/lint signal used to score drafted emails. */
function readabilityScore(text = '') {
  const s = sentences(text);
  if (!s.length) return 0;
  const avg = words(text).length / s.length;
  return Math.max(0, Math.min(100, Math.round(100 - Math.max(0, avg - 12) * 2.4)));
}

module.exports = {
  STOPWORDS, clean, sentences, words, contentWords, keywords, summarise, bulletPoints,
  readingMinutes, extractDates, extractFigures, extractActions, extractDecisions,
  extractAttendees, detectPriority, parseAction, tidySentence, scoreSentences, readabilityScore
};
