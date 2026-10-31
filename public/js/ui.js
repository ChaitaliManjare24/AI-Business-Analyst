/** Shared UI helpers: escaping, icons, toasts, modals, formatting, markdown. */

export const esc = (str = '') => String(str)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const icon = (name, size = 18) => {
  const paths = {
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" fill="currentColor"/><path d="M18.5 15l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z" fill="currentColor" opacity=".55"/>',
    mail: '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 6.8 8 5.6 8-5.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    doc: '<path d="M6 3h8l4 4v14H6V3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v4h4M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    meeting: '<path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 4v-4H6a2 2 0 0 1-2-2V6Z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    report: '<path d="M4 19h16M7 16V9M12 16V5M17 16v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    task: '<path d="M4 6.5 6.5 9 11 4.5M4 12.5 6.5 15 11 10.5M4 18.5 6.5 21 11 16.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 7h7M14 13h7M14 19h7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    check: '<path d="m4 12.5 5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4H6.5A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    download: '<path d="M12 4v11M8 11.5l4 4 4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    upload: '<path d="M12 17V5M8 9l4-4 4 4M4 20h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    alert: '<path d="M12 4l8.5 15H3.5L12 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9.5v4M12 16.5h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    target: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    settings: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v2M12 19v2M21 12h-2M5 12H3M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    refresh: '<path d="M20 11.5A8 8 0 0 0 6.2 6.2L4 8.5M4 12.5A8 8 0 0 0 17.8 17.8L20 15.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 4.5v4h4M20 19.5v-4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    send: '<path d="M4 12 20 4l-6 16-3-6-7-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    money: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    bolt: '<path d="M13 3 5 14h6l-1 7 9-12h-6l1-6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
  };
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${paths[name] || ''}</svg>`;
};

export const money = (n, currency = '') => {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? '');
  return `${currency}${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const shortDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export const fullDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const relTime = (value) => {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fullDate(value);
};

export const dueMeta = (due) => {
  if (!due) return { label: 'No date', tone: 'grey', overdue: false };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due); d.setHours(0, 0, 0, 0);
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: 'overdue', overdue: true };
  if (days === 0) return { label: 'Due today', tone: 'medium', overdue: false };
  if (days === 1) return { label: 'Due tomorrow', tone: 'medium', overdue: false };
  if (days <= 7) return { label: `In ${days} days`, tone: 'blue', overdue: false };
  return { label: shortDate(due), tone: 'grey', overdue: false };
};

export const priorityPill = (p) => `<span class="pill ${p}">${p === 'high' ? 'High' : p === 'low' ? 'Low' : 'Medium'}</span>`;

/* ------------------------------------------------------------------ toasts */
export function toast(message, type = 'info', timeout = 4200) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const glyph = type === 'error' ? '!' : type === 'success' ? '✓' : 'i';
  el.innerHTML = `<span class="t-icon">${glyph}</span><div>${esc(message)}</div>`;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, timeout);
}

/* ------------------------------------------------------------------ modals */
export function modal({ title, subtitle = '', body, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  const scrim = document.createElement('div');
  scrim.className = 'modal-scrim';
  scrim.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h2>${esc(title)}</h2>
      ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
      ${body ? `<div class="mb">${body}</div>` : ''}
      <div class="form-actions" style="justify-content:flex-end;margin-top:20px">
        <button class="btn btn-quiet" data-cancel>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>
      </div>
    </div>`;
  document.body.appendChild(scrim);
  const close = () => scrim.remove();
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  scrim.querySelector('[data-cancel]').onclick = close;
  scrim.querySelector('[data-ok]').onclick = async () => {
    const btn = scrim.querySelector('[data-ok]');
    btn.disabled = true;
    try {
      const keep = await onConfirm?.(scrim);
      if (keep !== false) close();
    } finally {
      btn.disabled = false;
    }
  };
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  return { close, scrim };
}

/* ---------------------------------------------------------------- markdown */
export function markdown(src = '') {
  const escapeHtml = (s) => esc(s);
  const inline = (s) => escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');

  const lines = String(src).split('\n');
  const out = [];
  let inTable = false;
  let listType = null;

  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();

    if (/^\|/.test(t)) {
      closeList();
      const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!inTable) { out.push('<table>'); inTable = true; }
      const tag = out[out.length - 1] === '<table>' ? 'th' : 'td';
      out.push(`<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`);
      continue;
    }
    if (inTable) { out.push('</table>'); inTable = false; }

    const heading = t.match(/^(#{1,4})\s+(.*)$/);
    if (heading) { closeList(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue; }

    if (/^---+$/.test(t)) { closeList(); out.push('<hr>'); continue; }

    const ol = t.match(/^(\d+)\.\s+(.*)$/);
    if (ol) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(ol[2])}</li>`);
      continue;
    }
    const ul = t.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    if (!t) { closeList(); continue; }

    closeList();
    out.push(`<p>${inline(t)}</p>`);
  }
  closeList();
  if (inTable) out.push('</table>');
  return out.join('\n');
}

/* ------------------------------------------------------------------ misc -- */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function download(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function loadingButton(btn, text = 'Working…') {
  if (!btn) return () => {};
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span><span>${esc(text)}</span>`;
  return () => { btn.disabled = false; btn.innerHTML = original; };
}

export function skeleton(lines = 3) {
  return `<div style="padding:4px 0">${Array.from({ length: lines }, () => '<div class="skeleton sk-line"></div>').join('')}</div>`;
}

/** Two-column bar/area chart as inline SVG. */
export function areaChart(series, { height = 200 } = {}) {
  const w = 720;
  const h = height;
  const pad = { t: 14, r: 8, b: 22, l: 26 };
  const max = Math.max(3, ...series.map((d) => Math.max(d.outputs, d.completed, d.created)));
  const stepX = (w - pad.l - pad.r) / Math.max(1, series.length - 1);
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const x = (i) => pad.l + i * stepX;

  const areaPts = series.map((d, i) => `${x(i)},${y(d.outputs)}`).join(' ');
  const linePts = series.map((d, i) => `${x(i)},${y(d.completed)}`).join(' ');
  const gridLines = [0, 0.5, 1].map((f) => {
    const yy = pad.t + (h - pad.t - pad.b) * f;
    return `<line x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" />`;
  }).join('');

  const points = series.map((d, i) => `
    <circle class="chart-dot" cx="${x(i)}" cy="${y(d.completed)}" r="3.4" fill="#2563eb"
      data-label="${d.day}" data-value="${d.completed} completed · ${d.outputs} outputs" />`).join('');

  const labels = series.map((d, i) => (i % 2 === 0
    ? `<text x="${x(i)}" y="${h - 5}" text-anchor="middle" font-size="10.5" fill="#a7b4c6">${shortDate(d.day)}</text>`
    : '')).join('');

  return `
  <div class="chart-wrap">
    <svg class="chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Activity over the last 14 days">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3b82f6" stop-opacity=".22" />
          <stop offset="1" stop-color="#3b82f6" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g class="chart-grid">${gridLines}</g>
      <polygon class="chart-area" points="${pad.l},${h - pad.b} ${areaPts} ${w - pad.r},${h - pad.b}" fill="url(#areaFill)" />
      <polyline points="${areaPts}" fill="none" stroke="#93c5fd" stroke-width="1.6" stroke-dasharray="4 4" />
      <polyline points="${linePts}" fill="none" stroke="#2563eb" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
      ${points}
      ${labels}
    </svg>
    <div class="chart-tip" id="chart-tip"></div>
  </div>
  <div class="chart-legend">
    <span><i class="legend-dot" style="background:#2563eb"></i>Tasks completed</span>
    <span><i class="legend-dot" style="background:#93c5fd"></i>AI outputs (emails, docs, reports)</span>
  </div>`;
}

export function donut(value, { size = 120, label = '' } = {}) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  return `
  <div style="display:flex;align-items:center;gap:18px">
    <svg width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="${pct}% ${label}">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="#eef3fa" stroke-width="11" />
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="url(#donutGrad)" stroke-width="11" stroke-linecap="round"
        stroke-dasharray="${dash} ${c}" transform="rotate(-90 60 60)">
      </circle>
      <defs><linearGradient id="donutGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#3b82f6" /><stop offset="1" stop-color="#38bdf8" />
      </linearGradient></defs>
      <text x="60" y="58" text-anchor="middle" font-size="24" font-weight="700" fill="#0b1526">${pct}%</text>
      <text x="60" y="76" text-anchor="middle" font-size="10.5" fill="#7d8ca1">${esc(label)}</text>
    </svg>
  </div>`;
}
