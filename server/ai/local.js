'use strict';
/**
 * Offline generation engine ("Local Engine").
 *
 * Produces complete, useful output with no external API call, so the product
 * works out of the box and degrades gracefully if a hosted model is
 * unavailable. Every function returns the same shape as its hosted-model
 * counterpart, which keeps the routes engine-agnostic.
 */
const T = require('../lib/text');

const TONES = ['formal', 'professional', 'friendly'];

const TONE_PACK = {
  formal: {
    greeting: (r) => `Dear ${r || 'Sir or Madam'},`,
    signoff: (s) => `Kind regards,\n${s || '{{sender}}'}`,
    openers: {
      new: (topic) => `I am writing to you regarding ${topic}.`,
      followup: (topic) => `I am writing to follow up on my previous correspondence concerning ${topic}.`,
      reply: (topic) => `Thank you for your message regarding ${topic}.`
    },
    bulletLead: 'Please find the key points for your consideration below:',
    cta: 'I would be grateful if you could confirm receipt of this message and advise on the next steps at your earliest convenience.',
    bridge: 'Should you require any further information, please do not hesitate to contact me.',
    cont: ['I would therefore like to', 'In addition, I would like to', 'Finally, I would like to']
  },
  professional: {
    greeting: (r) => `Hello ${r || 'there'},`,
    signoff: (s) => `Best regards,\n${s || '{{sender}}'}`,
    openers: {
      new: (topic) => `I'm reaching out about ${topic}.`,
      followup: (topic) => `I'm following up on my earlier message about ${topic}.`,
      reply: (topic) => `Thanks for getting back to me about ${topic}.`
    },
    bulletLead: 'Here are the key details:',
    cta: 'Could you let me know if this works on your side, and what the next step looks like?',
    bridge: 'Happy to jump on a quick call if that is easier.',
    cont: ['Next, I would like to', 'I also want to', 'Lastly, I would like to']
  },
  friendly: {
    greeting: (r) => `Hi ${r || 'there'},`,
    signoff: (s) => `Thanks so much,\n${s || '{{sender}}'}`,
    openers: {
      new: (topic) => `Hope you're having a good week! I wanted to get in touch about ${topic}.`,
      followup: (topic) => `Just circling back on my note about ${topic} — I know things get busy!`,
      reply: (topic) => `Thanks so much for coming back to me about ${topic} — really appreciate it.`
    },
    bulletLead: 'A few quick things:',
    cta: 'Let me know what works best for you and I will get it sorted!',
    bridge: 'Always happy to jump on a quick call if that is easier for you.',
    cont: ['I would also love to', 'On top of that, I wanted to', 'And finally, I would like to']
  }
};

function normaliseTone(tone) {
  return TONES.includes(String(tone)) ? String(tone) : 'professional';
}

/** Derive a compact topic phrase from free text. */
function topicFrom(...sources) {
  const raw = T.clean(sources.filter(Boolean).join(' '));
  if (!raw) return 'our recent conversation';
  let clause = raw.split(/[.!?\n]/)[0].trim();

  // Strip leading meta-verbs so the phrase reads as a noun phrase.
  clause = clause
    .replace(/^(please\s+)?(i (?:am|would like to|'d like to|want to|need to)|we (?:need|want) to)\s+/i, '')
    .replace(/^(follow[\s-]?up on|follow[\s-]?up|follow up|checking in on|ask\s+\w+\s+(?:for|about)|request|remind\s+\w+\s+to|tell\s+\w+\s+(?:to|that)|let\s+\w+\s+know)\s+/i, '')
    .replace(/^(?:ask|tell|remind)\s+[A-Za-z]+\s+(?:to|for|about)\s+/i, '')
    .replace(/^(?:please\s+)?(?:can|could|would)\s+you\s+/i, '')
    .replace(/^(that|about|regarding|re:)\s+/i, '')
    .trim();

  // Keep the first idea only, if a natural break exists.
  const breakAt = clause.search(/[,;]\s|\s(?:and|then|also)\s/i);
  if (breakAt > 12) clause = clause.slice(0, breakAt);

  const words = clause.split(/\s+/);
  if (words.length > 12) clause = words.slice(0, 12).join(' ');
  clause = clause.replace(/[,;:\-]+$/, '').trim();
  if (!clause) return 'our recent conversation';
  return clause.charAt(0).toLowerCase() + clause.slice(1);
}

const COMPANY_SUFFIX = /(ltd|limited|inc|co|corp|plc|llc|team|group|partners|studio|studios|solutions|retail|agency|consulting|services|bank|capital)$/i;

/** First name when the recipient clearly reads as a person, else the full name. */
function greetingName(recipient = '') {
  const parts = String(recipient).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 3 && !COMPANY_SUFFIX.test(parts[parts.length - 1])) return parts[0];
  return recipient;
}

const IMPERATIVE_VERBS = /^(introduce|offer|propose|discuss|partner|collaborate|negotiate|quote|tender|apply|register|renew|cancel|reschedule|escalate|thank|apologise|apologize|congratulate|invite|welcome|announce|brief|align|prioritise|prioritize|document|translate|proofread|edit|format|track|monitor|forecast|budget|audit|reconcile|refund|reschedule|notify|inform|introduce|ask|send|confirm|share|rewrite|review|prepare|schedule|draft|update|book|chase|finish|complete|approve|check|plan|organise|organize|create|set|provide|follow|remind|arrange|deliver|submit|sign|pay|call|email|write|add|remove|fix|test|launch|build|order|invoice|onboard|train|hire|publish|record|summarise|summarize|report|present|research|contact|request|collect|gather|clean|migrate|deploy|install|verify|validate)\b/i;

const SELF_VERBS = /^(introduce|offer|propose|discuss|thank|apologise|apologize|congratulate|invite|welcome|announce|apply|register|renew|present|share our|introduce ourselves)\b/i;

const isImperative = (clause = '') => IMPERATIVE_VERBS.test(clause);

function splitPoints(brief) {
  return T.clean(brief)
    .split(/\n|(?:^|\s)[-•*]\s|;\s+/)
    .map((p) => p.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter((p) => p.length > 2);
}

function subjectFor({ mode, topic, brief, subject }) {
  if (subject && subject.trim()) {
    return subject.trim().replace(/\s+/g, ' ').slice(0, 120);
  }
  const core = topic.replace(/^(i am writing to|i'm reaching out about|regarding)\s+/i, '');
  const words = core.split(/\s+/).slice(0, 9).join(' ');
  const title = words.charAt(0).toUpperCase() + words.slice(1);
  const prefix = mode === 'followup' ? 'Follow-up: ' : mode === 'reply' ? 'Re: ' : '';
  void brief;
  return `${prefix}${title}`;
}

/**
 * Compose a complete email locally.
 * @returns {{subject: string, body: string, tips: string[]}}
 */
function draftEmail({ mode = 'new', tone, recipient = '', senderName = '', brief = '', points = [], length = 'medium', subject = '' }) {
  const pack = TONE_PACK[normaliseTone(tone)];
  const safeMode = ['new', 'followup', 'reply'].includes(mode) ? mode : 'new';
  const topics = topicFrom(brief || points.join(' '), subject);
  const imperative = isImperative(topics);

  // A brief written as an instruction ("Ask Priya to…") is rephrased as a
  // polite request so the draft reads like a sentence, not a to-do list.
  const t = normaliseTone(tone);
  let opener;
  if (imperative && SELF_VERBS.test(topics)) {
    opener = {
      formal: `I am writing to ${topics}.`,
      professional: `I'm reaching out to ${topics}.`,
      friendly: `I wanted to reach out to ${topics}.`
    }[t];
  } else if (imperative) {
    opener = {
      formal: `I am writing to ask whether you could ${topics}.`,
      professional: `I'm reaching out with a quick request — could you ${topics}?`,
      friendly: `I've got a small favour to ask — could you ${topics}?`
    }[t];
  } else {
    opener = pack.openers[safeMode](topics);
  }

  const briefLines = points.length ? [] : splitPoints(brief);
  const detailPoints = (points.length
    ? points
    : briefLines.slice(1).concat(briefLines[0] && T.words(briefLines[0]) > 18 ? [briefLines[0]] : []))
    .slice(0, length === 'short' ? 2 : length === 'long' ? 8 : 4);

  const bodyParts = [opener];
  if (detailPoints.length > 1) {
    bodyParts.push(`${pack.bulletLead}\n\n${detailPoints.map((p) => `• ${T.tidySentence(p)}`).join('\n')}`);
  } else if (detailPoints.length === 1) {
    bodyParts.push(T.tidySentence(detailPoints[0]));
  }

  if (safeMode === 'followup') {
    bodyParts.push('I appreciate that your schedule is busy, so I wanted to keep this brief and make it easy to respond.');
  }
  if (length === 'long') bodyParts.push(pack.bridge);
  bodyParts.push(pack.cta);

  const body = `${pack.greeting(greetingName(recipient))}\n\n${bodyParts.filter(Boolean).join('\n\n')}\n\n${pack.signoff(senderName)}`;
  const tips = [];
  const wc = T.words(body).length;
  if (wc > 220) tips.push('This draft is on the long side — trim to the two strongest points for a faster reply.');
  if (wc < 60) tips.push('Consider adding one concrete detail (a date, figure or deliverable) to make replying easy.');
  if (!/\d/.test(body)) tips.push('No dates or numbers in the draft — adding a deadline usually lifts reply rates.');
  tips.push(`Readability score: ${T.readabilityScore(body)}/100 · ${wc} words.`);

  const finalSubject = subjectFor({ mode: safeMode, topic: topics, brief });
  return {
    subject: imperative && !SELF_VERBS.test(topics) && safeMode !== 'followup' ? `Request: ${finalSubject}` : finalSubject,
    body,
    tips
  };
}

const INFORMAL_MAP = [
  [/\bgonna\b/gi, 'going to'], [/\bwanna\b/gi, 'want to'], [/\bgotta\b/gi, 'need to'],
  [/\bhey\b/gi, 'Hello'], [/\byeah\b/gi, 'yes'], [/\bthanks a lot\b/gi, 'thank you very much'],
  [/\bthanks\b/gi, 'Thank you'], [/\bthx\b/gi, 'thank you'], [/\bpls\b/gi, 'please'],
  [/\bplz\b/gi, 'please'], [/\basap\b/gi, 'at your earliest convenience'],
  [/\bkinda\b/gi, 'somewhat'], [/\bsorta\b/gi, 'somewhat'], [/\bcuz\b/gi, 'because'],
  [/\bbtw\b/gi, 'incidentally'], [/\bfyi\b/gi, 'for your information'],
  [/\bcan't\b/gi, 'cannot'], [/\bwon't\b/gi, 'will not'], [/\bdon't\b/gi, 'do not'],
  [/\bdidn't\b/gi, 'did not'], [/\bisn't\b/gi, 'is not'], [/\bwon’t\b/gi, 'will not'],
  [/\bI'm\b/gi, 'I am'], [/\bi've\b/gi, 'I have'],
  [/\bget back to you\b/gi, 'respond to you'], [/\blet me know\b/gi, 'please advise'],
  [/\bchat\b/gi, 'discuss'], [/\bstuff\b/gi, 'materials'], [/\bthings\b/gi, 'items'],
  [/\bgiant\b/gi, 'significant'], [/\bhuge\b/gi, 'significant'], [/\bawesome\b/gi, 'excellent'],
  [/\bquickly\b/gi, 'promptly'], [/\bfix\b/gi, 'resolve'], [/\bcheck\b/gi, 'review']
];

/** Rewrite an informal message into a polished one. */
function rewriteEmail({ text = '', tone = 'professional', recipient = '', senderName = '' }) {
  const pack = TONE_PACK[normaliseTone(tone)];
  let body = T.clean(text).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
  if (!body) return { subject: 'Professional rewrite', body: '', tips: ['Nothing to rewrite.'] };

  const changes = [];
  for (const [re, replacement] of INFORMAL_MAP) {
    if (re.test(body)) {
      changes.push(`${re.source.replace(/\\b/g, '')} → ${replacement}`);
      body = body.replace(re, replacement);
    }
  }

  // Sentence-level capitalisation and punctuation.
  let normalised = body
    .split(/(?<=[.!?])\s+/)
    .map((s) => {
      const t = s.trim();
      if (!t) return '';
      const capped = t.charAt(0).toUpperCase() + t.slice(1);
      return /[.!?]$/.test(capped) ? capped : `${capped}.`;
    })
    .filter(Boolean)
    .join(' ');
  normalised = normalised.replace(/\s+([,.!?])/g, '$1').replace(/!{2,}/g, '!').replace(/\.\.\./g, '.');

  const hasGreeting = /^(dear|hello|hi|good (morning|afternoon|evening))/i.test(normalised);
  const hasSignoff = /(kind regards|best regards|regards|sincerely|thanks|thank you)[,\s]*$/i.test(normalised);
  const sentences = T.sentences(normalised);
  const core = sentences.length ? sentences.map((s) => T.tidySentence(s)).join(' ') : normalised;

  const opened = hasGreeting ? core : `${pack.greeting(greetingName(recipient))}\n\n${core}`;
  const closed = hasSignoff ? opened : `${opened}\n\n${pack.signoff(senderName)}`;

  const tips = [
    changes.length
      ? `Rewritten ${changes.length} informal phrase${changes.length > 1 ? 's' : ''}: ${changes.slice(0, 5).join('; ')}.`
      : 'Tone and wording were already reasonably professional; structure was tightened.',
    `Readability score: ${T.readabilityScore(closed)}/100 · ${T.words(closed).length} words.`
  ];
  if (!/\d/.test(closed)) tips.push('Add a specific date or next step so the recipient can act immediately.');

  return {
    subject: subjectFor({ mode: 'reply', topic: topicFrom(text) }),
    body: closed,
    tips
  };
}

/** Drop a leading title/heading block so it is not repeated as the summary. */
function stripTitleBlock(text = '') {
  const lines = String(text).split('\n');
  let i = 0;
  while (i < lines.length && i < 4) {
    const line = lines[i].trim();
    if (!line) { i += 1; continue; }
    if (line.length <= 110 && !/[.!?]$/.test(line)) { i += 1; continue; }
    break;
  }
  const body = lines.slice(i).join('\n');
  return body.trim().length > 40 ? body : text;
}

const HEADING_LINE = /^(prepared|author|date|version|confidential|draft|subject|client|report|document)\b/i;
const isHeadingLine = (line) => {
  const t = line.trim();
  if (!t) return false;
  if (/^[-–—•*]\s|^\d+[.)]\s/.test(t)) return false; // bullets carry content
  if (HEADING_LINE.test(t)) return true;
  return t.length < 42 && !/[.!?;:]$/.test(t) && t.split(/\s+/).length <= 8;
};

/** Local document analysis. */
function analyseDocument(text, { title = '' } = {}) {
  const clean = T.clean(text);
  const body = stripTitleBlock(clean)
    .split('\n')
    .filter((line) => !isHeadingLine(line))
    .join('\n');
  const wc = T.words(clean).length;
  return {
    title: title || 'Untitled document',
    summary: T.summarise(body, wc > 900 ? 5 : wc > 400 ? 4 : 3),
    key_points: T.bulletPoints(body, 6),
    dates: T.extractDates(clean),
    figures: T.extractFigures(clean),
    actions: T.extractActions(clean, 6),
    keywords: T.keywords(clean, 8),
    word_count: wc,
    reading_minutes: T.readingMinutes(clean)
  };
}

/** Local meeting analysis. */
function analyseMeeting(text, { title = '' } = {}) {
  const clean = T.clean(text);
  const body = clean.split('\n').filter((line) => !isHeadingLine(line)).join('\n');
  const actions = T.extractActions(clean, 10);
  const decisions = T.extractDecisions(clean, 6);
  const attendees = T.extractAttendees(clean);
  const summary = T.summarise(body, 3);

  return {
    title: title || 'Team meeting',
    attendees,
    summary: summary || 'No substantive content was detected in the notes.',
    decisions: decisions.length ? decisions : ['No explicit decisions were recorded in these notes.'],
    actions: actions.length ? actions : [],
    key_points: T.bulletPoints(body, 5)
  };
}

// ------------------------------------------------------------------- reports

const CURRENCY_SYMBOLS = { USD: '$', GBP: '£', EUR: '€', INR: '₹', AUD: 'A$', CAD: 'C$' };

function fmtMoney(value, currency = 'USD') {
  const symbol = CURRENCY_SYMBOLS[currency] || '';
  const abs = Math.abs(value);
  const formatted = abs >= 1000000
    ? `${(abs / 1000000).toFixed(2)}M`
    : abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : abs.toFixed(2);
  return `${value < 0 ? '-' : ''}${symbol}${formatted}`;
}

function pct(value) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function delta(current, previous) {
  if (previous === null || previous === undefined || previous === 0 || Number.isNaN(previous)) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Build a structured business report from metrics + free-form notes.
 * Returns { title, markdown, observations, recommendations, metrics }.
 */
function buildReport({ businessName = 'The business', period = '', currency = 'USD', metrics = [], notes = '', audience = 'internal' }) {
  const rows = metrics
    .filter((m) => m && m.name && (m.current !== '' && m.current !== null && !Number.isNaN(Number(m.current))))
    .map((m) => ({
      name: String(m.name).trim(),
      current: Number(m.current),
      previous: m.previous === '' || m.previous === null || m.previous === undefined ? null : Number(m.previous)
    }));

  const byName = (needle) => rows.find((r) => r.name.toLowerCase().includes(needle));
  const revenue = byName('revenue') || byName('sales') || byName('income');
  const expenses = byName('expense') || byName('cost') || byName('spend');
  const customers = byName('customer') || byName('client') || byName('user');

  const observations = [];
  const recommendations = [];

  const revDelta = revenue ? delta(revenue.current, revenue.previous) : null;
  if (revenue && revDelta !== null) {
    if (revDelta >= 10) {
      observations.push(`Revenue reached ${fmtMoney(revenue.current, currency)} in ${period || 'the period'}, up ${Math.abs(revDelta).toFixed(1)}% period-on-period — growth is clearly accelerating.`);
      recommendations.push('Protect the growth engine: document which channels drove the uplift and shift a share of budget towards the two strongest performers.');
    } else if (revDelta > 0) {
      observations.push(`Revenue grew modestly to ${fmtMoney(revenue.current, currency)}, up ${Math.abs(revDelta).toFixed(1)}%. Growth is positive but below double digits.`);
      recommendations.push('Test one additional acquisition channel and re-price your best-selling offer before scaling spend.');
    } else if (revDelta < 0) {
      observations.push(`Revenue declined ${Math.abs(revDelta).toFixed(1)}% to ${fmtMoney(revenue.current, currency)} versus the prior period.`);
      recommendations.push('Run a churn and pipeline review this week — identify the three largest lost or delayed deals and the reason behind each.');
    }
  } else if (revenue) {
    observations.push(`Revenue for the period stands at ${fmtMoney(revenue.current, currency)}; no prior-period comparison was supplied, so trend analysis is not possible.`);
    recommendations.push('Capture prior-period comparatives next cycle so trend, not just level, can be assessed.');
  }

  const profit = revenue && expenses ? revenue.current - expenses.current : null;
  const margin = profit !== null && revenue.current ? (profit / revenue.current) * 100 : null;
  if (profit !== null) {
    observations.push(`Operating profit is ${fmtMoney(profit, currency)} with a margin of ${margin.toFixed(1)}%.`);
    if (margin < 10) {
      recommendations.push(`Margin at ${margin.toFixed(1)}% is thin. Audit the five largest cost lines for renegotiation and remove any subscription without a named owner.`);
    } else if (margin < 25) {
      recommendations.push('Margin is healthy but improvable — review supplier terms and pricing on your lowest-margin product line.');
    } else {
      recommendations.push('Strong margin gives room to reinvest in marketing or hiring without endangering cash flow.');
    }
    const expDelta = expenses ? delta(expenses.current, expenses.previous) : null;
    if (expDelta !== null && revDelta !== null && expDelta > revDelta) {
      observations.push(`Expenses grew faster than revenue (+${Math.abs(expDelta).toFixed(1)}% vs +${Math.abs(revDelta).toFixed(1)}%), compressing margin.`);
      recommendations.push('Introduce a monthly spend approval threshold and a 30-day review of all new recurring costs.');
    }
  }

  if (customers) {
    const cap = delta(customers.current, customers.previous);
    if (cap !== null) {
      observations.push(`Customer base moved to ${customers.current.toLocaleString()} (${pct(cap)}).`);
      if (revenue && cap > 0 && revDelta !== null && revDelta < cap) {
        observations.push('Revenue per customer is falling while the customer count rises — the new mix is lower value than the existing base.');
        recommendations.push('Introduce a lightweight upsell or onboarding sequence aimed at accounts acquired in the last 90 days.');
      }
      if (cap < 0) recommendations.push('Instigate a win-back campaign for lapsed customers before increasing acquisition spend.');
    } else {
      observations.push(`Customer base stands at ${customers.current.toLocaleString()}.`);
    }
  }

  const unflagged = rows.filter((r) => ![revenue, expenses, customers].includes(r));
  for (const r of unflagged.slice(0, 4)) {
    const d = delta(r.current, r.previous);
    const unit = /%|rate|margin/i.test(r.name) ? '%' : '';
    observations.push(
      `${r.name}: ${r.current.toLocaleString()}${unit}${d !== null ? ` (${pct(d)} vs prior period)` : ''}.`
    );
    if (d !== null && d < -15) {
      recommendations.push(`${r.name} is down ${Math.abs(d).toFixed(0)}% — assign an owner and a recovery plan with a review date.`);
    }
  }

  if (!rows.length) {
    observations.push('No quantitative metrics were provided, so this report is based on the qualitative notes only.');
    recommendations.push('Add at least revenue, expenses and customer counts to unlock trend analysis and margin commentary.');
  }

  const noteSentences = T.bulletPoints(notes, 4);
  if (noteSentences.length) {
    observations.push(...noteSentences.map((n) => `From the notes: ${n}`));
  }

  if (!recommendations.length) {
    recommendations.push('Set one measurable objective for the next period and review it at the same cadence as this report.');
  }
  while (recommendations.length < 3) {
    recommendations.push('Keep the reporting cadence monthly and track the same metric definitions so comparisons stay valid.');
  }

  const title = `${businessName} — ${period || 'Business'} Performance Report`;
  const table = rows.length
    ? [
        '| Metric | Current | Previous | Change |',
        '| --- | --- | --- | --- |',
        ...rows.map((r) => {
          const d = delta(r.current, r.previous);
          return `| ${r.name} | ${r.current.toLocaleString()} | ${r.previous === null ? '—' : r.previous.toLocaleString()} | ${d === null ? '—' : pct(d)} |`;
        })
      ].join('\n')
    : '_No metrics supplied._';

  const exec = [
    `${businessName}${period ? ` closed ${period}` : ''} with ${rows.length ? `${rows.length} tracked metrics` : 'qualitative notes only'}.`,
    revenue ? `Revenue was ${fmtMoney(revenue.current, currency)}${revDelta !== null ? `, ${revDelta >= 0 ? 'up' : 'down'} ${Math.abs(revDelta).toFixed(1)}% period-on-period` : ''}.` : '',
    profit !== null ? `Operating profit was ${fmtMoney(profit, currency)} at a ${margin.toFixed(1)}% margin.` : '',
    recommendations.length ? `The single most important action is to ${recommendations[0].replace(/^[A-Z]/, (c) => c.toLowerCase())}` : ''
  ].filter(Boolean).join(' ');

  const markdown = [
    `# ${title}`,
    '',
    `**Prepared for:** ${audience}  `,
    `**Period:** ${period || 'Not specified'}  `,
    `**Generated:** ${new Date().toUTCString()}`,
    '',
    '## 1. Executive summary',
    '',
    exec,
    '',
    '## 2. Performance overview',
    '',
    table,
    '',
    '## 3. Key observations',
    '',
    ...observations.slice(0, 9).map((o, i) => `${i + 1}. ${o}`),
    '',
    '## 4. Recommendations',
    '',
    ...recommendations.slice(0, 6).map((r, i) => `${i + 1}. ${r}`),
    '',
    '## 5. Risks and watch list',
    '',
    ...(rows.length
      ? rows
          .filter((r) => (delta(r.current, r.previous) ?? 0) < 0)
          .slice(0, 4)
          .map((r) => `- **${r.name}** is trending down (${pct(delta(r.current, r.previous))}). Monitor weekly until the trend reverses.`)
      : ['- No metric-level risks could be derived without quantitative input.'])
      .concat(rows.every((r) => (delta(r.current, r.previous) ?? 0) >= 0) ? ['- No declining metrics this period; the main risk is complacency in the strongest channel.'] : []),
    '',
    '## 6. Next steps',
    '',
    `1. Assign an owner and a date to each recommendation above.`,
    `2. Re-run this report at the end of ${period ? 'the next period' : 'the next month'} using identical metric definitions.`,
    `3. Circulate the summary to stakeholders within 48 hours.`,
    '',
    '---',
    '_Prepared with AI Business Assistant. Figures are derived from the data supplied and should be validated against the source ledger before external distribution._'
  ].join('\n');

  return {
    title,
    markdown,
    observations,
    recommendations,
    metrics: rows,
    summary: exec
  };
}

module.exports = { draftEmail, rewriteEmail, analyseDocument, analyseMeeting, buildReport, TONES, normaliseTone, fmtMoney, pct, delta };
