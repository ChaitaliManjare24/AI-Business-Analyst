import { api } from '../api.js';
import { esc, icon, areaChart, donut, dueMeta, priorityPill, relTime, toast } from '../ui.js';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const activityIcon = {
  task: 'task', email: 'mail', document: 'doc', meeting: 'meeting', report: 'report', account: 'spark'
};

export default async function dashboard(host, ctx) {
  const stats = await api.get('/api/stats');
  const first = (ctx.user.name || '').split(' ')[0];
  const t = stats.tasks;

  const openToday = t.dueToday + t.overdue;
  const headline = openToday > 0
    ? `You have <strong>${openToday}</strong> ${openToday === 1 ? 'task' : 'tasks'} needing attention today and <strong>${t.pending}</strong> open in total.`
    : `Nothing overdue — you have <strong>${t.pending}</strong> open ${t.pending === 1 ? 'task' : 'tasks'} in the pipeline.`;

  host.innerHTML = `
    <section class="card reveal" style="--i:0;background:linear-gradient(120deg,#ffffff 0%,#f4f9ff 58%,#eaf3ff 100%);border-color:#dbe9fb">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap">
        <div style="min-width:260px;flex:1">
          <span class="pill blue" style="margin-bottom:10px">${icon('spark', 12)} ${esc(stats.ai.hosted ? stats.ai.label : 'Local AI engine')} active</span>
          <h2 style="font-size:22px;margin-bottom:6px">${greeting()}, ${esc(first)}.</h2>
          <p class="prose" style="max-width:620px">${headline}</p>
        </div>
        <div style="display:flex;gap:34px;flex-wrap:wrap;min-width:0">
          <div>
            <div class="stat-label">Completed this week</div>
            <div class="stat-value" style="font-size:24px">${stats.throughput}</div>
          </div>
          <div>
            <div class="stat-label">AI outputs (7 days)</div>
            <div class="stat-value" style="font-size:24px">${stats.outputs7}</div>
          </div>
          <div>
            <div class="stat-label">Completion rate</div>
            <div class="stat-value" style="font-size:24px">${stats.completionRate}%</div>
          </div>
        </div>
      </div>
      <div class="form-actions" style="margin-top:18px">
        <button class="btn btn-primary" data-act="go" data-to="#/email">${icon('mail', 15)} Draft an email</button>
        <button class="btn btn-ghost" data-act="go" data-to="#/documents">${icon('doc', 15)} Summarise a document</button>
        <button class="btn btn-ghost" data-act="go" data-to="#/meetings">${icon('meeting', 15)} Process meeting notes</button>
        <button class="btn btn-ghost" data-act="go" data-to="#/reports">${icon('report', 15)} Generate a report</button>
      </div>
    </section>

    <div class="grid grid-4" style="margin-top:18px">
      ${statCard('Open tasks', t.pending, t.highPriority ? `${t.highPriority} high priority` : 'All priorities balanced', 'task', '', `--i:1`)}
      ${statCard('Completed', t.completed, `${stats.completionRate}% completion rate`, 'check', 'green', '--i:2')}
      ${statCard('Due today', t.dueToday, t.overdue ? `${t.overdue} overdue` : 'Nothing overdue', 'clock', 'amber', '--i:3', true)}
      ${statCard('Library', stats.library.documents + stats.library.meetings + stats.library.reports + stats.library.emails, `${stats.library.documents} docs · ${stats.library.reports} reports`, 'report', 'violet', '--i:4')}
    </div>

    <div class="split" style="margin-top:18px">
      <section class="card reveal" style="--i:5">
        <div class="card-head">
          <div>
            <h2>Activity overview</h2>
            <p>Task throughput and AI outputs across the last 14 days</p>
          </div>
          <span class="pill grey">Last 14 days</span>
        </div>
        ${areaChart(stats.series)}
      </section>

      <div class="grid" style="gap:18px">
        <section class="card reveal" style="--i:6">
          <div class="card-head"><div><h2>Completion</h2><p>Tasks closed vs. created</p></div></div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            ${donut(stats.completionRate, { label: 'completed' })}
            <div style="flex:1;min-width:110px">
              <div class="row-sub" style="margin-bottom:6px"><span class="legend-dot" style="background:#2563eb"></span>${t.completed} completed</div>
              <div class="row-sub" style="margin-bottom:6px"><span class="legend-dot" style="background:#cbd5e1"></span>${t.pending} still open</div>
              <div class="row-sub"><span class="legend-dot" style="background:#ef4444"></span>${t.overdue} overdue</div>
            </div>
          </div>
        </section>

        <section class="card reveal" style="--i:7">
          <div class="card-head">
            <div><h2>Upcoming deadlines</h2><p>Next 7 days</p></div>
            <button class="icon-btn" data-act="go" data-to="#/tasks" title="Open tasks">${icon('arrow', 16)}</button>
          </div>
          ${stats.upcoming.length ? `<div class="list">${stats.upcoming.map((task) => {
            const due = dueMeta(task.dueDate);
            return `<div class="list-row">
              <span class="check" style="pointer-events:none"></span>
              <div class="row-main">
                <div class="row-title">${esc(task.title)}</div>
                <div class="row-sub"><span class="pill ${due.tone}">${icon('clock', 11)} ${esc(due.label)}</span>${priorityPill(task.priority)}</div>
              </div>
            </div>`;
          }).join('')}</div>` : `<div class="empty"><div class="empty-icon">${icon('calendar', 20)}</div><h3>No deadlines this week</h3><p>Add due dates to your tasks and they will appear here.</p></div>`}
        </section>
      </div>
    </div>

    <div class="split-even" style="margin-top:18px">
      <section class="card reveal" style="--i:8">
        <div class="card-head"><div><h2>Recent activity</h2><p>What the assistant has done for you</p></div></div>
        ${stats.activity.length ? `<div style="display:grid;gap:2px">${stats.activity.map((a) => `
          <div style="display:flex;gap:11px;padding:9px 0;border-bottom:1px solid var(--line-2)">
            <span class="stat-icon" style="width:29px;height:29px;border-radius:9px;flex:none">${icon(activityIcon[a.type] || 'spark', 15)}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13.2px;color:var(--ink-800)">${esc(a.message)}</div>
              <div style="font-size:11.5px;color:var(--ink-400);margin-top:1px">${relTime(a.createdAt)}</div>
            </div>
          </div>`).join('')}</div>` : `<div class="empty"><div class="empty-icon">${icon('bolt', 20)}</div><h3>No activity yet</h3><p>Generate an email or summarise a document to get started.</p></div>`}
      </section>

      <section class="card reveal" style="--i:9">
        <div class="card-head"><div><h2>Your library</h2><p>Everything you have generated</p></div></div>
        <div class="grid grid-2" style=" gap:10px">
          ${libraryTile('Emails drafted', stats.library.emails, 'mail', '#/email')}
          ${libraryTile('Documents', stats.library.documents, 'doc', '#/documents')}
          ${libraryTile('Meetings', stats.library.meetings, 'meeting', '#/meetings')}
          ${libraryTile('Reports', stats.library.reports, 'report', '#/reports')}
        </div>
        <div style="margin-top:16px;padding:12px 14px;border-radius:12px;background:var(--blue-50);border:1px solid var(--blue-100);font-size:12.6px;color:var(--ink-700)">
          <strong style="color:var(--blue-700)">AI engine:</strong> ${esc(stats.ai.label)} · ${esc(stats.ai.model)}
          ${stats.ai.hosted ? '' : '<br><span style="color:var(--ink-500)">No hosted key configured — the built-in engine handles every feature locally. Add a key in <code>.env</code> to switch to a hosted model.</span>'}
        </div>
      </section>
    </div>
  `;

  // Chart tooltip
  const tip = host.querySelector('#chart-tip');
  host.querySelectorAll('.chart-dot').forEach((dot) => {
    dot.addEventListener('mouseenter', () => {
      const svg = dot.closest('svg');
      const rect = svg.getBoundingClientRect();
      const cx = Number(dot.getAttribute('cx')) / 720 * rect.width;
      const cy = Number(dot.getAttribute('cy')) / Number(svg.getAttribute('viewBox').split(' ')[3]) * rect.height;
      tip.textContent = `${dot.dataset.label} · ${dot.dataset.value}`;
      tip.style.left = `${cx}px`;
      tip.style.top = `${cy}px`;
      tip.style.opacity = '1';
    });
    dot.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
  });

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="go"]');
    if (btn) window.location.hash = btn.dataset.to;
  });

  void toast;
  void ctx;
  return () => {};
}

function statCard(label, value, foot, iconName, tone = '', style = '', warn = false) {
  return `<article class="stat reveal" style="${style}">
    <div class="stat-top">
      <span class="stat-label">${esc(label)}</span>
      <span class="stat-icon ${tone}">${icon(iconName, 17)}</span>
    </div>
    <div class="stat-value">${value}</div>
    <div class="stat-foot">${warn && value > 0 ? `<span class="trend down">${icon('alert', 12)}</span>` : ''}${esc(foot)}</div>
  </article>`;
}

function libraryTile(label, count, iconName, href) {
  return `<a href="${href}" style="display:block;padding:13px;border-radius:12px;border:1px solid var(--line);background:#fff;transition:all .18s var(--ease)" class="lib-tile">
    <span style="display:flex;align-items:center;gap:7px;color:var(--ink-500);font-size:12.2px;font-weight:550">${icon(iconName, 14)} ${esc(label)}</span>
    <span style="display:block;font-size:20px;font-weight:700;color:var(--ink-900);letter-spacing:-.03em;margin-top:5px">${count}</span>
  </a>`;
}
