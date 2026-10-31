import { api } from '../api.js';
import {
  esc, icon, toast, loadingButton, relTime, skeleton, markdown, copyText, download, fullDate
} from '../ui.js';

const SAMPLE_METRICS = [
  { name: 'Revenue', current: 128000, previous: 114286 },
  { name: 'Operating expenses', current: 71000, previous: 58000 },
  { name: 'Active clients', current: 48, previous: 41 },
  { name: 'Website conversion rate', current: 1.8, previous: 2.6 },
  { name: 'Cost per lead', current: 52, previous: 38 },
  { name: 'Overdue invoices', current: 42000, previous: 15000 }
];

const SAMPLE_NOTES = 'August saw strong top-line growth driven by retainer renewals and an increase in self-serve signups. Delivery slipped on three projects due to delayed client approvals. Cash collection is the main pressure point with $42,000 overdue, $18,000 of it beyond 60 days. The marketing site conversion decline is under investigation with a pricing page experiment scheduled for 23 September.';

export default async function reportsView(host, ctx) {
  let rows = [{ name: '', current: '', previous: '' }];
  let reports = [];
  let active = null;

  host.innerHTML = `
    <div class="split">
      <div class="grid" style="gap:18px">
        <section class="card reveal" style="--i:0">
          <div class="card-head">
            <div><h2>Report inputs</h2><p>Give the numbers — the assistant writes the narrative</p></div>
            <button class="btn btn-quiet btn-sm" id="load-sample">Load sample</button>
          </div>

          <form id="report-form" class="form-grid" novalidate>
            <div class="form-row">
              <label class="field">
                <span>Business or project</span>
                <input type="text" name="businessName" placeholder="Northwind Studio" maxlength="120" required />
              </label>
              <label class="field">
                <span>Period</span>
                <input type="text" name="period" placeholder="August 2024" maxlength="60" />
              </label>
            </div>
            <div class="form-row">
              <label class="field">
                <span>Currency</span>
                <select name="currency">
                  <option value="USD">USD — US dollar</option>
                  <option value="GBP">GBP — Pound sterling</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="INR">INR — Indian rupee</option>
                  <option value="AUD">AUD — Australian dollar</option>
                  <option value="CAD">CAD — Canadian dollar</option>
                </select>
              </label>
              <label class="field">
                <span>Audience</span>
                <input type="text" name="audience" placeholder="board and leadership team" maxlength="60" />
              </label>
            </div>

            <div class="field">
              <span>Metrics</span>
              <div class="metrics-table" id="metrics"></div>
              <button type="button" class="btn btn-quiet btn-sm" id="add-metric" style="justify-self:start;margin-top:8px">${icon('plus', 13)} Add metric</button>
              <small class="hint">Add the previous period to unlock change analysis. Percentages can be entered as numbers (e.g. 1.8).</small>
            </div>

            <label class="field">
              <span>Context notes <span style="font-weight:400;color:var(--ink-400)">(what happened this period?)</span></span>
              <textarea name="notes" rows="5" maxlength="6000" placeholder="What drove the numbers? Any risks, wins or one-offs the reader should know about?"></textarea>
            </label>

            <div class="form-actions">
              <button class="btn btn-primary" type="submit" id="generate-report">${icon('spark', 15)} Generate report</button>
              <span class="form-note">${esc(ctx.ai?.hosted ? `Using ${ctx.ai.label}` : 'Using the built-in engine')}</span>
            </div>
          </form>
        </section>

        <section class="card reveal" style="--i:1">
          <div class="card-head">
            <div><h2>Saved reports</h2><p>Download or re-open any report</p></div>
            <button class="icon-btn" id="refresh-reports" title="Refresh">${icon('refresh', 16)}</button>
          </div>
          <div id="report-list">${skeleton(3)}</div>
        </section>
      </div>

      <section class="card reveal" style="--i:2" id="report-preview-card">
        <div id="report-preview">
          <div class="empty">
            <div class="empty-icon">${icon('report', 20)}</div>
            <h3>No report generated yet</h3>
            <p>Add your metrics and context, then generate a structured report with observations and recommendations.</p>
          </div>
        </div>
      </section>
    </div>
  `;

  const form = host.querySelector('#report-form');
  const metricsHost = host.querySelector('#metrics');
  const previewHost = host.querySelector('#report-preview');
  const listHost = host.querySelector('#report-list');

  function renderMetrics() {
    metricsHost.innerHTML = rows.map((row, i) => `
      <div class="metric-row">
        <input type="text" value="${esc(row.name)}" placeholder="Metric name (e.g. Revenue)" maxlength="80" data-m="${i}" data-f="name" />
        <input type="number" step="any" value="${esc(row.current)}" placeholder="Current" data-m="${i}" data-f="current" />
        <input type="number" step="any" value="${esc(row.previous)}" placeholder="Previous" data-m="${i}" data-f="previous" />
        <button type="button" class="icon-btn danger" data-remove-metric="${i}" title="Remove">${icon('close', 14)}</button>
      </div>`).join('');
  }
  renderMetrics();

  metricsHost.addEventListener('input', (e) => {
    const input = e.target.closest('[data-m]');
    if (!input) return;
    rows[Number(input.dataset.m)][input.dataset.f] = input.value;
  });
  metricsHost.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-metric]');
    if (!btn) return;
    rows.splice(Number(btn.dataset.removeMetric), 1);
    if (!rows.length) rows = [{ name: '', current: '', previous: '' }];
    renderMetrics();
  });
  host.querySelector('#add-metric').addEventListener('click', () => {
    if (rows.length >= 20) return toast('Up to 20 metrics per report.', 'info');
    rows.push({ name: '', current: '', previous: '' });
    renderMetrics();
  });

  host.querySelector('#load-sample').addEventListener('click', () => {
    rows = SAMPLE_METRICS.map((m) => ({ ...m }));
    renderMetrics();
    form.businessName.value = 'Northwind Studio';
    form.period.value = 'August 2024';
    form.audience.value = 'board and leadership team';
    form.notes.value = SAMPLE_NOTES;
    toast('Sample business data loaded.', 'info', 2400);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = host.querySelector('#generate-report');
    const cleanMetrics = rows
      .filter((r) => r.name.trim() && r.current !== '')
      .map((r) => ({
        name: r.name.trim(),
        current: r.current,
        previous: r.previous === '' ? null : r.previous
      }));
    if (!form.businessName.value.trim()) return toast('Enter the business or project name.', 'error');
    if (!cleanMetrics.length && form.notes.value.trim().length < 40) {
      return toast('Add at least one metric or 40+ characters of context notes.', 'error');
    }

    const restore = loadingButton(btn, 'Writing the report…');
    previewHost.innerHTML = `<div style="padding:4px 0"><div class="skeleton sk-line w50"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line w70"></div><div class="skeleton sk-block" style="margin-top:14px"></div><div class="skeleton sk-line" style="margin-top:14px"></div></div>`;
    try {
      const data = await api.post('/api/reports', {
        businessName: form.businessName.value.trim(),
        period: form.period.value.trim(),
        currency: form.currency.value,
        audience: form.audience.value.trim(),
        metrics: cleanMetrics,
        notes: form.notes.value.trim()
      });
      active = data.report;
      renderReport(data.report);
      await loadReports();
      ctx.refreshShell();
      toast('Report generated.', 'success');
    } catch (err) {
      previewHost.innerHTML = `<div class="card" style="border-color:#f8d4d4;background:#fffafa"><strong style="color:#b91c1c">Could not generate the report</strong>
        <p class="prose" style="margin-top:6px">${esc(err.message)}</p></div>`;
      toast(err.message, 'error');
    } finally { restore(); }
  });

  function renderReport(report) {
    previewHost.innerHTML = `
      <div class="fade">
        <div class="result-head" style="margin-bottom:14px">
          <div>
            <h2 class="result-title">${esc(report.title)}</h2>
            <div class="meta-row">
              <span>${esc(report.period || 'Period not set')}</span>
              <span>${esc(relTime(report.createdAt))}</span>
              <span>${esc((report.engine || 'local').startsWith('local') ? 'Built-in engine' : report.engine)}</span>
            </div>
          </div>
        </div>
        <div class="form-actions" style="margin-bottom:16px">
          <button class="btn btn-primary btn-sm" data-act="md">${icon('download', 14)} Markdown</button>
          <button class="btn btn-ghost btn-sm" data-act="html">${icon('download', 14)} HTML</button>
          <button class="btn btn-ghost btn-sm" data-act="print">Print / PDF</button>
          <button class="btn btn-quiet btn-sm" data-act="copy">${icon('copy', 14)} Copy</button>
        </div>
        <div class="md" style="border-top:1px solid var(--line);padding-top:16px">${markdown(stripHeading(report.contentMd || ''))}</div>
      </div>`;

    const base = `/api/reports/${report.id}/download`;
    previewHost.querySelector('[data-act="md"]').onclick = () => { window.location.href = `${base}?format=md`; };
    previewHost.querySelector('[data-act="html"]').onclick = () => { window.location.href = `${base}?format=html`; };
    previewHost.querySelector('[data-act="copy"]').onclick = async () => {
      const ok = await copyText(report.contentMd || '');
      toast(ok ? 'Report copied as Markdown.' : 'Copy failed.', ok ? 'success' : 'error');
    };
    previewHost.querySelector('[data-act="print"]').onclick = () => printReport(report);
  }

  function stripHeading(md) {
    // The title is already rendered above the document body.
    return md.replace(/^#\s+.*\n+/, '');
  }

  async function printReport(report) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.title)}</title>
      <style>
      body{font:14px/1.65 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#16233a;padding:28px 34px}
      h1{font-size:24px;letter-spacing:-.02em;margin:0 0 18px} h2{font-size:15.5px;margin:24px 0 8px;border-bottom:1px solid #e4ecf7;padding-bottom:6px}
      table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12.5px}
      th,td{border:1px solid #e4ecf7;padding:7px 9px;text-align:left} th{background:#f2f7ff}
      ul,ol{padding-left:20px} li{margin:4px 0} hr{border:0;border-top:1px solid #e4ecf7;margin:20px 0}
      em{color:#5b6b82;font-size:12px} @page{margin:16mm}
      </style></head><body><h1>${esc(report.title)}</h1>${markdown(stripHeading(report.contentMd || ''))}</body></html>`);
    doc.close();
    frame.onload = () => {};
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 1200);
    }, 240);
  }

  async function loadReports() {
    try {
      const data = await api.get('/api/reports');
      reports = data.reports;
      if (!reports.length) {
        listHost.innerHTML = `<div class="empty" style="padding:22px 14px"><p>No reports yet.</p></div>`;
        return;
      }
      listHost.innerHTML = `<div class="list">${reports.map((r) => `
        <div class="list-row">
          <span class="stat-icon" style="width:30px;height:30px;border-radius:9px;flex:none">${icon('report', 15)}</span>
          <div class="row-main" data-open="${r.id}" style="cursor:pointer">
            <div class="row-title" style="font-size:13.2px">${esc(r.title)}</div>
            <div class="row-sub">${esc(r.period || 'No period')} · ${esc(relTime(r.createdAt))}</div>
          </div>
          <a class="icon-btn" href="/api/reports/${r.id}/download?format=md" title="Download">${icon('download', 15)}</a>
          <button class="icon-btn danger" data-del="${r.id}" title="Delete">${icon('trash', 15)}</button>
        </div>`).join('')}</div>`;
    } catch (err) {
      listHost.innerHTML = `<p class="form-note">${esc(err.message)}</p>`;
    }
  }

  listHost.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) {
      try {
        const data = await api.get(`/api/reports/${open.dataset.open}`);
        active = data.report;
        renderReport(data.report);
        host.querySelector('#report-preview-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      try {
        await api.del(`/api/reports/${del.dataset.del}`);
        toast('Report deleted.', 'success', 1800);
        await loadReports();
        ctx.refreshShell();
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  host.querySelector('#refresh-reports').addEventListener('click', loadReports);
  await loadReports();
  void active;
  void download;
  void fullDate;
  return () => {};
}
