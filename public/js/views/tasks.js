import { api } from '../api.js';
import { esc, icon, toast, dueMeta, priorityPill, relTime, fullDate, modal, skeleton } from '../ui.js';

const FILTERS = [
  ['all', 'All'],
  ['pending', 'Open'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
  ['overdue', 'Overdue']
];

export default async function tasksView(host, ctx) {
  let tasks = [];
  let filter = 'all';
  let search = '';
  let priorityFilter = '';
  let showForm = ctx.query?.get('new') === '1';

  host.innerHTML = `
    <div class="split">
      <div class="grid" style="gap:18px">
        <section class="card reveal" style="--i:0">
          <div class="card-head">
            <div><h2>Task list</h2><p id="task-count">—</p></div>
            <button class="btn btn-primary btn-sm" id="toggle-form">${icon('plus', 14)} New task</button>
          </div>

          <div id="task-form-wrap" class="${showForm ? '' : 'hidden'}" style="margin-bottom:16px">
            <form id="task-form" class="grid" style="gap:10px;padding:14px;border:1px solid var(--line);border-radius:13px;background:#fbfdff">
              <input type="text" name="title" placeholder="What needs doing?" maxlength="200" required />
              <div class="form-row">
                <select name="priority">
                  <option value="high">High priority</option>
                  <option value="medium" selected>Medium priority</option>
                  <option value="low">Low priority</option>
                </select>
                <input type="date" name="dueDate" />
              </div>
              <input type="text" name="notes" placeholder="Notes (optional)" maxlength="400" />
              <div class="form-actions">
                <button class="btn btn-primary btn-sm" type="submit">Add task</button>
                <button class="btn btn-quiet btn-sm" type="button" id="cancel-form">Cancel</button>
              </div>
            </form>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
            <div class="tabs" id="filters">
              ${FILTERS.map(([value, label]) => `<button class="tab ${value === filter ? 'is-active' : ''}" data-filter="${value}">${label}</button>`).join('')}
            </div>
            <div style="flex:1;min-width:150px">
              <input type="search" id="search" placeholder="Search tasks…" value="${esc(search)}" />
            </div>
          </div>

          <div class="chips" style="margin-bottom:14px">
            <button class="chip ${priorityFilter === '' ? 'on' : ''}" data-priority="">All priorities</button>
            <button class="chip ${priorityFilter === 'high' ? 'on' : ''}" data-priority="high">High</button>
            <button class="chip ${priorityFilter === 'medium' ? 'on' : ''}" data-priority="medium">Medium</button>
            <button class="chip ${priorityFilter === 'low' ? 'on' : ''}" data-priority="low">Low</button>
          </div>

          <div id="task-list">${skeleton(5)}</div>
        </section>
      </div>

      <div class="grid" style="gap:18px">
        <section class="card reveal" style="--i:1">
          <div class="card-head"><div><h2>Snapshot</h2><p>Live counts</p></div></div>
          <div id="snapshot">${skeleton(3)}</div>
        </section>
        <section class="card reveal" style="--i:2">
          <div class="card-head"><div><h2>Next up</h2><p>Earliest deadlines</p></div></div>
          <div id="next-up"></div>
        </section>
      </div>
    </div>
  `;

  const formWrap = host.querySelector('#task-form-wrap');
  const form = host.querySelector('#task-form');
  const listHost = host.querySelector('#task-list');
  const countHost = host.querySelector('#task-count');
  const snapshotHost = host.querySelector('#snapshot');
  const nextUpHost = host.querySelector('#next-up');

  host.querySelector('#toggle-form').addEventListener('click', () => {
    showForm = !showForm;
    formWrap.classList.toggle('hidden', !showForm);
    if (showForm) form.title.focus();
  });
  host.querySelector('#cancel-form').addEventListener('click', () => {
    showForm = false;
    formWrap.classList.add('hidden');
    form.reset();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    if (title.length < 2) return toast('Give the task a title.', 'error');
    try {
      await api.post('/api/tasks', {
        title,
        priority: form.priority.value,
        dueDate: form.dueDate.value || null,
        notes: form.notes.value.trim()
      });
      form.reset();
      showForm = false;
      formWrap.classList.add('hidden');
      await load();
      ctx.refreshShell();
      toast('Task added.', 'success', 1800);
    } catch (err) { toast(err.message, 'error'); }
  });

  host.querySelector('#filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    filter = btn.dataset.filter;
    host.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('is-active', b === btn));
    render();
  });

  host.querySelectorAll('[data-priority]').forEach((chip) => {
    chip.addEventListener('click', () => {
      priorityFilter = chip.dataset.priority;
      host.querySelectorAll('[data-priority]').forEach((c) => c.classList.toggle('on', c === chip));
      render();
    });
  });

  let searchTimer;
  host.querySelector('#search').addEventListener('input', (e) => {
    search = e.target.value.trim().toLowerCase();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  });

  function visible() {
    const today = new Date().toISOString().slice(0, 10);
    return tasks.filter((t) => {
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (search && !(`${t.title} ${t.notes}`.toLowerCase().includes(search))) return false;
      switch (filter) {
        case 'pending': return t.status !== 'completed';
        case 'in_progress': return t.status === 'in_progress';
        case 'completed': return t.status === 'completed';
        case 'overdue': return t.status !== 'completed' && t.dueDate && t.dueDate < today;
        default: return true;
      }
    });
  }

  function render() {
    const items = visible();
    const open = tasks.filter((t) => t.status !== 'completed').length;
    countHost.textContent = `${open} open · ${tasks.length} total`;
    if (!items.length) {
      listHost.innerHTML = `<div class="empty"><div class="empty-icon">${icon('check', 20)}</div>
        <h3>Nothing here</h3><p>${search || priorityFilter || filter !== 'all' ? 'No tasks match these filters.' : 'Add your first task, or generate them from meeting notes.'}</p></div>`;
      return;
    }
    listHost.innerHTML = `<div class="list">${items.map((t) => {
      const due = dueMeta(t.dueDate);
      const done = t.status === 'completed';
      return `
      <div class="list-row" data-task="${t.id}">
        <button class="check ${done ? 'is-on' : ''}" data-toggle="${t.id}" aria-label="${done ? 'Mark as open' : 'Mark as complete'}">${icon('check', 12)}</button>
        <div class="row-main">
          <div class="row-title ${done ? 'done' : ''}">${esc(t.title)}</div>
          <div class="row-sub">
            ${done ? '<span class="pill green">Completed</span>' : priorityPill(t.priority)}
            ${done ? '' : `<span class="pill ${due.tone}">${icon('clock', 11)} ${esc(due.label)}</span>`}
            ${t.sourceType && t.sourceType !== 'manual' ? `<span class="pill grey">from ${esc(t.sourceType)}</span>` : ''}
            ${t.notes ? `<span style="color:var(--ink-400)">${esc(t.notes.slice(0, 60))}</span>` : ''}
          </div>
        </div>
        <select data-status="${t.id}" style="width:auto;padding:5px 26px 5px 9px;font-size:12.2px;border-radius:8px" aria-label="Status">
          <option value="pending" ${t.status === 'pending' ? 'selected' : ''}>Open</option>
          <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In progress</option>
          <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>Completed</option>
        </select>
        <button class="icon-btn danger" data-delete="${t.id}" title="Delete task">${icon('trash', 15)}</button>
      </div>`;
    }).join('')}</div>`;
  }

  listHost.addEventListener('click', async (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      toggle.disabled = true;
      try {
        const { task } = await api.post(`/api/tasks/${toggle.dataset.toggle}/toggle`);
        tasks = tasks.map((t) => (t.id === task.id ? task : t));
        render();
        ctx.refreshShell();
        if (task.status === 'completed') toast('Task completed. Nice one.', 'success', 1800);
      } catch (err) {
        toggle.disabled = false;
        toast(err.message, 'error');
      }
      return;
    }
    const del = e.target.closest('[data-delete]');
    if (del) {
      const task = tasks.find((t) => String(t.id) === del.dataset.delete);
      modal({
        title: 'Delete this task?',
        subtitle: `“${task?.title || ''}” will be removed permanently.`,
        confirmLabel: 'Delete task',
        danger: true,
        onConfirm: async () => {
          try {
            await api.del(`/api/tasks/${del.dataset.delete}`);
            tasks = tasks.filter((t) => String(t.id) !== del.dataset.delete);
            render();
            ctx.refreshShell();
            toast('Task deleted.', 'success', 1600);
          } catch (err) { toast(err.message, 'error'); return false; }
          return true;
        }
      });
    }
  });

  listHost.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-status]');
    if (!sel) return;
    try {
      const { task } = await api.patch(`/api/tasks/${sel.dataset.status}`, { status: sel.value });
      tasks = tasks.map((t) => (t.id === task.id ? task : t));
      render();
      ctx.refreshShell();
      toast('Status updated.', 'success', 1500);
    } catch (err) { toast(err.message, 'error'); }
  });

  function renderSide() {
    const today = new Date().toISOString().slice(0, 10);
    const counts = {
      open: tasks.filter((t) => t.status !== 'completed').length,
      high: tasks.filter((t) => t.status !== 'completed' && t.priority === 'high').length,
      overdue: tasks.filter((t) => t.status !== 'completed' && t.dueDate && t.dueDate < today).length,
      done: tasks.filter((t) => t.status === 'completed').length
    };
    snapshotHost.innerHTML = `
      <div class="grid grid-2" style="gap:10px">
        ${mini('Open', counts.open, 'blue')}
        ${mini('High priority', counts.high, 'red')}
        ${mini('Overdue', counts.overdue, 'amber')}
        ${mini('Completed', counts.done, 'green')}
      </div>
      <div style="margin-top:14px;padding:11px 13px;border-radius:11px;background:var(--blue-50);border:1px solid var(--blue-100);font-size:12.4px;color:var(--ink-600)">
        Tasks created from meetings and documents keep a link back to their source.
      </div>`;

    const upcoming = tasks
      .filter((t) => t.status !== 'completed' && t.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
    nextUpHost.innerHTML = upcoming.length ? `<div class="list">${upcoming.map((t) => {
      const due = dueMeta(t.dueDate);
      return `<div class="list-row" style="padding:9px 11px">
        <div class="row-main">
          <div class="row-title" style="font-size:12.8px">${esc(t.title)}</div>
          <div class="row-sub"><span class="pill ${due.tone}">${esc(due.label)}</span></div>
        </div>
      </div>`;
    }).join('')}</div>` : `<p class="form-note">No dated tasks yet.</p>`;
  }

  function mini(label, value, tone) {
    return `<div style="padding:11px 12px;border-radius:11px;border:1px solid var(--line);background:#fff">
      <div style="font-size:11.6px;color:var(--ink-500);font-weight:550">${esc(label)}</div>
      <div style="font-size:20px;font-weight:700;letter-spacing:-.03em;color:var(--ink-900)">${value}</div>
    </div>`;
  }

  async function load() {
    const data = await api.get('/api/tasks');
    tasks = data.tasks;
    render();
    renderSide();
  }

  await load();
  if (showForm) form.title.focus();
  void fullDate;
  void relTime;
  return () => {};
}
