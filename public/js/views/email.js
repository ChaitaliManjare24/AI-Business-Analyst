import { api } from '../api.js';
import {
  esc, icon, toast, loadingButton, copyText, download, relTime, skeleton, markdown
} from '../ui.js';

const TONES = [
  ['formal', 'Formal', 'Senior stakeholders, legal, first contact'],
  ['professional', 'Professional', 'Everyday business default'],
  ['friendly', 'Friendly', 'Existing clients and colleagues']
];

export default async function emailView(host, ctx) {
  let mode = 'new';
  let tone = 'professional';
  let current = null;
  let points = [''];
  let history = [];

  host.innerHTML = `
    <div class="split">
      <section class="card reveal" style="--i:0">
        <div class="card-head">
          <div>
            <h2 id="composer-title">Compose with the assistant</h2>
            <p id="composer-sub">Describe what you need — the assistant writes the email.</p>
          </div>
        </div>

        <div class="tabs" style="margin-bottom:18px" role="tablist">
          <button class="tab is-active" data-mode="new">New email</button>
          <button class="tab" data-mode="followup">Follow-up</button>
          <button class="tab" data-mode="reply">Reply</button>
          <button class="tab" data-mode="rewrite">Rewrite a message</button>
        </div>

        <form id="email-form" class="form-grid" novalidate>
          <div class="field">
            <span>Tone</span>
            <div class="segmented">
              ${TONES.map(([value, label]) => `
                <input type="radio" id="tone-${value}" name="tone" value="${value}" ${value === tone ? 'checked' : ''} />
                <label for="tone-${value}" title="${esc(label)}">${label}</label>`).join('')}
            </div>
          </div>

          <div id="compose-fields">
            <div class="form-row" style="margin-bottom:15px">
              <label class="field">
                <span>Recipient name</span>
                <input type="text" name="recipient" placeholder="e.g. Daniel Okafor" maxlength="80" />
              </label>
              <label class="field">
                <span>Subject <span style="font-weight:400;color:var(--ink-400)">(optional)</span></span>
                <input type="text" name="subject" placeholder="Leave blank to generate one" maxlength="120" />
              </label>
            </div>

            <label class="field" style="margin-bottom:15px">
              <span id="brief-label">What should the email say?</span>
              <textarea name="brief" rows="4" maxlength="4000" placeholder="Ask Daniel for the updated Meridian rate card before Friday, confirm the pilot numbers and suggest a short call."></textarea>
            </label>

            <div class="field" style="margin-bottom:15px">
              <span>Key points <span style="font-weight:400;color:var(--ink-400)">(optional — one per line)</span></span>
              <div class="metrics-table" id="points"></div>
              <button type="button" class="btn btn-quiet btn-sm" id="add-point" style="justify-self:start;margin-top:8px">${icon('plus', 13)} Add key point</button>
            </div>

            <label class="field">
              <span>Length</span>
              <select name="length">
                <option value="short">Short — two or three sentences</option>
                <option value="medium" selected>Medium — standard business email</option>
                <option value="long">Long — detailed, with context</option>
              </select>
            </label>
          </div>

          <div id="rewrite-fields" class="hidden">
            <label class="field">
              <span>Message to rewrite</span>
              <textarea name="raw" rows="10" maxlength="6000" placeholder="hey dan, gonna need that rate card asap pls, the client is on my back about it. thanks!!"></textarea>
              <small class="hint">Informal wording, emoji and run-on sentences are cleaned up. Facts and requests are preserved.</small>
            </label>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" type="submit" id="generate-btn">${icon('spark', 15)} Generate draft</button>
            <button class="btn btn-quiet" type="reset">Clear</button>
            <span class="form-note" id="engine-note">${esc(ctx.ai?.hosted ? `Using ${ctx.ai.label}` : 'Using the built-in engine')}</span>
          </div>
        </form>
      </section>

      <div class="grid" style="gap:18px">
        <section class="card reveal" style="--i:1" id="preview-card">
          <div class="card-head"><div><h2>Preview</h2><p>Copy, download or save to your history</p></div></div>
          <div id="preview">
            <div class="empty">
              <div class="empty-icon">${icon('mail', 20)}</div>
              <h3>Your draft will appear here</h3>
              <p>Fill in the brief and press Generate. Drafts are saved automatically.</p>
            </div>
          </div>
        </section>

        <section class="card reveal" style="--i:2">
          <div class="card-head">
            <div><h2>History</h2><p>Recent drafts</p></div>
            <button class="icon-btn" id="refresh-history" title="Refresh">${icon('refresh', 16)}</button>
          </div>
          <div id="history">${skeleton(4)}</div>
        </section>
      </div>
    </div>
  `;

  const form = host.querySelector('#email-form');
  const pointsHost = host.querySelector('#points');
  const previewHost = host.querySelector('#preview');
  const historyHost = host.querySelector('#history');

  /* -------------------------------------------------------------- points */
  function renderPoints() {
    pointsHost.innerHTML = points.map((value, i) => `
      <div class="metric-row" style="grid-template-columns:1fr 32px">
        <input type="text" value="${esc(value)}" placeholder="Key point ${i + 1}" maxlength="240" data-point="${i}" />
        <button type="button" class="icon-btn danger" data-remove-point="${i}" title="Remove">${icon('close', 14)}</button>
      </div>`).join('');
  }
  renderPoints();

  pointsHost.addEventListener('input', (e) => {
    const input = e.target.closest('[data-point]');
    if (input) points[Number(input.dataset.point)] = input.value;
  });
  pointsHost.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-point]');
    if (!btn) return;
    points.splice(Number(btn.dataset.removePoint), 1);
    if (!points.length) points = [''];
    renderPoints();
  });
  host.querySelector('#add-point').addEventListener('click', () => {
    if (points.length >= 12) return toast('You can add up to 12 key points.', 'info');
    points.push('');
    renderPoints();
    pointsHost.querySelectorAll('[data-point]')[points.length - 1]?.focus();
  });

  /* ---------------------------------------------------------------- modes */
  host.querySelectorAll('[data-mode]').forEach((tab) => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.mode;
      host.querySelectorAll('[data-mode]').forEach((t) => t.classList.toggle('is-active', t === tab));
      const isRewrite = mode === 'rewrite';
      host.querySelector('#compose-fields').classList.toggle('hidden', isRewrite);
      host.querySelector('#rewrite-fields').classList.toggle('hidden', !isRewrite);
      host.querySelector('#composer-title').textContent = isRewrite ? 'Rewrite an informal message' : 'Compose with the assistant';
      host.querySelector('#composer-sub').textContent = isRewrite
        ? 'Paste the message — the assistant rewrites it professionally.'
        : 'Describe what you need — the assistant writes the email.';
      host.querySelector('#generate-btn').innerHTML = `${icon('spark', 15)} ${isRewrite ? 'Rewrite message' : mode === 'followup' ? 'Generate follow-up' : 'Generate draft'}`;
      host.querySelector('#brief-label').textContent = mode === 'followup'
        ? 'What are you following up on?'
        : 'What should the email say?';
    });
  });

  form.addEventListener('change', (e) => {
    if (e.target.name === 'tone') tone = e.target.value;
  });

  form.addEventListener('reset', () => {
    setTimeout(() => {
      points = [''];
      renderPoints();
      tone = 'professional';
      host.querySelector('#tone-professional').checked = true;
    }, 0);
  });

  /* ------------------------------------------------------------- submit -- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = host.querySelector('#generate-btn');
    const restore = loadingButton(btn, mode === 'rewrite' ? 'Rewriting…' : 'Writing…');
    previewHost.innerHTML = `<div style="padding:6px 0"><div class="skeleton sk-line w50"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line w70"></div></div>`;
    try {
      let result;
      if (mode === 'rewrite') {
        const raw = form.raw.value.trim();
        if (raw.length < 10) throw new Error('Paste the message you would like rewritten.');
        const res = await api.post('/api/emails/rewrite', { text: raw, tone });
        result = { subject: res.result.subject, body: res.result.body, tips: res.result.tips, engine: res.result.engine };
        current = { ...resultRight(mode), subject: result.subject, body: result.body, engine: result.engine, createdAt: new Date().toISOString() };
      } else {
        const cleanPoints = points.map((p) => p.trim()).filter(Boolean);
        const brief = form.brief.value.trim();
        if (brief.length < 8 && !cleanPoints.length) throw new Error('Add a brief or at least one key point.');
        const res = await api.post('/api/emails', {
          mode, tone, recipient: form.recipient.value, subject: form.subject.value,
          brief, points: cleanPoints, length: form.length.value
        });
        result = res.email;
        current = res.email;
      }
      renderPreview(result, mode);
      if (mode !== 'rewrite') await loadHistory();
      ctx.refreshShell();
      toast('Draft ready.', 'success', 2200);
    } catch (err) {
      previewHost.innerHTML = `<div class="card" style="border-color:#f8d4d4;background:#fffafa">
        <strong style="color:#b91c1c">Could not generate the draft</strong>
        <p class="prose" style="margin-top:6px;color:var(--ink-700)">${esc(err.message)}</p></div>`;
      toast(err.message, 'error');
    } finally { restore(); }
  });

  /* ------------------------------------------------------------ preview -- */
  function resultRight() { return { mode, tone }; }

  function renderPreview(email, currentMode) {
    const tips = email.tips || [];
    previewHost.innerHTML = `
      <div class="fade">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap">
          <span class="pill blue">${icon('spark', 11)} ${esc((email.engine || 'local').startsWith('local') ? 'Built-in engine' : email.engine)}</span>
          <span class="pill grey">${esc(currentMode === 'rewrite' ? 'Rewritten' : currentMode === 'followup' ? 'Follow-up' : currentMode === 'reply' ? 'Reply' : 'New email')} · ${esc(tone)}</span>
        </div>
        <div style="border:1px solid var(--line);border-radius:13px;overflow:hidden;background:#fff">
          <div style="padding:12px 15px;background:#f7fafd;border-bottom:1px solid var(--line)">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-400);font-weight:650">Subject</div>
            <div style="font-size:14.5px;font-weight:620;color:var(--ink-900);margin-top:2px">${esc(email.subject || '(no subject)')}</div>
          </div>
          <div style="padding:16px;white-space:pre-wrap;font-size:13.9px;line-height:1.75;color:var(--ink-700);max-height:420px;overflow:auto">${esc(email.body || '')}</div>
        </div>
        ${tips.length ? `<div style="margin-top:12px;padding:11px 13px;border-radius:11px;background:var(--blue-50);border:1px solid var(--blue-100)">
          <strong style="font-size:12px;color:var(--blue-700);text-transform:uppercase;letter-spacing:.06em">Assistant notes</strong>
          <ul style="margin:6px 0 0;padding-left:16px;font-size:12.6px;color:var(--ink-600)">
            ${tips.map((t) => `<li style="margin:3px 0">${esc(t)}</li>`).join('')}
          </ul></div>` : ''}
        <div class="form-actions" style="margin-top:14px">
          <button class="btn btn-primary btn-sm" data-act="copy">${icon('copy', 14)} Copy</button>
          <button class="btn btn-ghost btn-sm" data-act="download">${icon('download', 14)} Download .txt</button>
          <button class="btn btn-ghost btn-sm" data-act="task">${icon('task', 14)} Add follow-up task</button>
          <button class="btn btn-quiet btn-sm" data-act="open-mail">${icon('send', 14)} Open in mail app</button>
        </div>
      </div>`;

    const body = email.subject ? `Subject: ${email.subject}\n\n${email.body}` : email.body;

    previewHost.querySelector('[data-act="copy"]').onclick = async () => {
      const ok = await copyText(body);
      toast(ok ? 'Copied to clipboard.' : 'Copy failed — select the text manually.', ok ? 'success' : 'error');
    };
    previewHost.querySelector('[data-act="download"]').onclick = () => {
      const name = (email.subject || 'email').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60);
      download(`${name}.txt`, body);
    };
    previewHost.querySelector('[data-act="task"]').onclick = async () => {
      const title = `Follow up: ${(email.subject || 'email draft').slice(0, 90)}`;
      const due = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
      try {
        await api.post('/api/tasks', { title, priority: 'medium', dueDate: due, notes: 'Created from the Email Assistant.' });
        toast('Follow-up task added for ' + new Date(due).toDateString().slice(4), 'success');
        ctx.refreshShell();
      } catch (err) { toast(err.message, 'error'); }
    };
    previewHost.querySelector('[data-act="open-mail"]').onclick = () => {
      window.location.href = `mailto:?subject=${encodeURIComponent(email.subject || '')}&body=${encodeURIComponent(email.body || '')}`;
    };
  }

  /* ------------------------------------------------------------ history -- */
  async function loadHistory() {
    try {
      const data = await api.get('/api/emails');
      history = data.emails;
      if (!history.length) {
        historyHost.innerHTML = `<div class="empty" style="padding:22px 14px"><p>No saved drafts yet.</p></div>`;
        return;
      }
      historyHost.innerHTML = `<div class="list">${history.slice(0, 8).map((mail) => `
        <button class="list-row" data-history="${mail.id}" style="text-align:left;cursor:pointer;width:100%">
          <span class="stat-icon" style="width:30px;height:30px;border-radius:9px;flex:none">${icon('mail', 15)}</span>
          <div class="row-main">
            <div class="row-title" style="font-size:13.2px">${esc(mail.subject)}</div>
            <div class="row-sub"><span class="pill grey">${esc(mail.tone)}</span> ${esc(relTime(mail.createdAt))}${mail.recipient ? ` · ${esc(mail.recipient)}` : ''}</div>
          </div>
        </button>`).join('')}</div>`;
    } catch (err) {
      historyHost.innerHTML = `<p class="form-note">${esc(err.message)}</p>`;
    }
  }

  historyHost.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-history]');
    if (!btn) return;
    const mail = history.find((m) => String(m.id) === btn.dataset.history);
    if (!mail) return;
    tone = mail.tone;
    renderPreview(mail, mail.mode);
    previewHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  host.querySelector('#refresh-history').addEventListener('click', loadHistory);
  await loadHistory();

  void markdown;
  return () => {};
}
