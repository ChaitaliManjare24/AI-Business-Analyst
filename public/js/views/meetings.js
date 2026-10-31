import { api } from '../api.js';
import { esc, icon, toast, loadingButton, relTime, shortDate, skeleton, copyText } from '../ui.js';

const SAMPLE = `Weekly leadership sync — 12 September
Attendees: Ava Sharma, Daniel Okafor, Priya Nair, Tom Ellis

Ava opened by reviewing last week's numbers. Revenue for August came in at $128,000, which is 12% above July. Expenses also rose to $71,000 because of the new contractor spend.

Daniel reported that the Meridian Retail pilot is going well. They have 24 active users after three weeks and asked for a pricing proposal before the end of the month. Daniel will send the updated rate card by Friday.

Priya raised the onboarding issue. New clients are waiting up to nine days for their accounts to be set up. The team agreed to simplify the onboarding checklist and target a five-day turnaround from October.

Tom noted the marketing site conversion rate has fallen to 1.8% from 2.6% last quarter. We decided to run an A/B test on the pricing page, starting next Monday.

Action items:
- Daniel will send the Meridian rate card by Friday.
- Priya to rewrite the onboarding checklist before 30 September.
- Tom to set up the pricing page A/B test next Monday.
- Ava needs to approve the Q4 budget by 20 September.

Next meeting is scheduled for 19 September.`;

export default async function meetingsView(host, ctx) {
  let meetings = [];

  host.innerHTML = `
    <div class="split">
      <div class="grid" style="gap:18px">
        <section class="card reveal" style="--i:0">
          <div class="card-head">
            <div><h2>Meeting notes</h2><p>Paste a transcript or your own notes — messy is fine</p></div>
            <button class="btn btn-quiet btn-sm" id="load-sample">Use sample notes</button>
          </div>
          <form id="meeting-form" class="form-grid" novalidate>
            <div class="form-row">
              <label class="field">
                <span>Meeting title</span>
                <input type="text" name="title" placeholder="Weekly leadership sync" maxlength="160" />
              </label>
              <label class="field">
                <span>Attendees <span style="font-weight:400;color:var(--ink-400)">(optional)</span></span>
                <input type="text" name="attendees" placeholder="Ava, Daniel, Priya" maxlength="300" />
              </label>
            </div>
            <label class="field">
              <span>Notes or transcript</span>
              <textarea name="text" id="meeting-text" rows="12" maxlength="30000" placeholder="Paste your meeting notes here. The assistant will extract a summary, the decisions made and every action item with an owner."></textarea>
            </label>
            <label style="display:flex;align-items:center;gap:9px;font-size:13.2px;color:var(--ink-600)">
              <input type="checkbox" name="createTasks" checked style="width:16px;height:16px;accent-color:#2563eb" />
              Automatically add action items to my task list
            </label>
            <div class="form-actions">
              <button class="btn btn-primary" type="submit" id="process-btn">${icon('spark', 15)} Process meeting</button>
              <span class="form-note">Nothing to set up — no calendar connection required.</span>
            </div>
          </form>
        </section>

        <section class="card reveal" style="--i:1">
          <div class="card-head">
            <div><h2>Past meetings</h2><p>Previously processed notes</p></div>
            <button class="icon-btn" id="refresh-meetings" title="Refresh">${icon('refresh', 16)}</button>
          </div>
          <div id="meeting-list">${skeleton(3)}</div>
        </section>
      </div>

      <section class="card reveal" style="--i:2">
        <div id="meeting-result">
          <div class="empty">
            <div class="empty-icon">${icon('meeting', 20)}</div>
            <h3>No meeting processed yet</h3>
            <p>Paste notes and the assistant returns a summary, the decisions made, and tasks with owners and deadlines.</p>
          </div>
        </div>
      </section>
    </div>
  `;

  const form = host.querySelector('#meeting-form');
  const textArea = host.querySelector('#meeting-text');
  const resultHost = host.querySelector('#meeting-result');
  const listHost = host.querySelector('#meeting-list');

  host.querySelector('#load-sample').addEventListener('click', () => {
    textArea.value = SAMPLE;
    form.title.value = 'Weekly leadership sync';
    form.attendees.value = 'Ava Sharma, Daniel Okafor, Priya Nair, Tom Ellis';
    toast('Sample notes loaded — press Process meeting.', 'info', 2600);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = host.querySelector('#process-btn');
    const text = textArea.value.trim();
    if (text.length < 40) {
      toast('Paste at least a few lines of notes.', 'error');
      return;
    }
    const restore = loadingButton(btn, 'Reading the meeting…');
    resultHost.innerHTML = `<div style="padding:4px 0"><div class="skeleton sk-line w50"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line w70"></div><div class="skeleton sk-block" style="margin-top:14px"></div></div>`;
    try {
      const data = await api.post('/api/meetings', {
        title: form.title.value.trim(),
        attendees: form.attendees.value.trim(),
        text,
        createTasks: form.createTasks.checked
      });
      renderMeeting(data.meeting, data.tasks || []);
      await loadList();
      ctx.refreshShell();
      toast(data.tasks?.length ? `Meeting processed · ${data.tasks.length} tasks created.` : 'Meeting processed.', 'success');
    } catch (err) {
      resultHost.innerHTML = `<div class="card" style="border-color:#f8d4d4;background:#fffafa"><strong style="color:#b91c1c">Could not process those notes</strong>
        <p class="prose" style="margin-top:6px">${esc(err.message)}</p></div>`;
      toast(err.message, 'error');
    } finally { restore(); }
  });

  function renderMeeting(meeting, tasks = []) {
    const decisions = meeting.decisions || [];
    const actions = meeting.actions || [];
    resultHost.innerHTML = `
      <div class="fade">
        <div class="result-head">
          <div>
            <h2 class="result-title">${esc(meeting.title)}</h2>
            <div class="meta-row">
              ${meeting.attendees ? `<span>${esc(meeting.attendees)}</span>` : ''}
              <span>${esc(relTime(meeting.createdAt))}</span>
              <span>${actions.length} action${actions.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" data-act="copy">${icon('copy', 14)} Copy notes</button>
        </div>

        <div style="margin-top:14px;padding:13px 15px;border-radius:12px;background:var(--blue-50);border:1px solid var(--blue-100)">
          <strong style="font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--blue-700)">Summary</strong>
          <p class="prose" style="margin-top:5px;font-size:13.9px">${esc(meeting.summary)}</p>
        </div>

        <div style="margin-top:18px">
          <div class="section-title">Decisions</div>
          ${decisions.length ? `<ul class="bullets">${decisions.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`
            : `<p class="form-note">No explicit decisions were recorded.</p>`}
        </div>

        <div style="margin-top:20px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
            <div class="section-title" style="margin:0">Action items</div>
            ${tasks.length ? `<span class="pill green">${icon('check', 11)} ${tasks.length} added to tasks</span>` : ''}
          </div>
          ${actions.length ? `<div class="list">${actions.map((a, i) => `
            <div class="list-row" style="align-items:flex-start">
              <span class="pill ${a.priority || 'medium'}" style="flex:none;margin-top:2px">${esc((a.priority || 'medium').toUpperCase())}</span>
              <div class="row-main">
                <div class="row-title" style="font-size:13.2px">${esc(a.title)}</div>
                <div class="row-sub">
                  ${a.owner ? `<span>${icon('target', 11)} ${esc(a.owner)}</span>` : '<span>Unassigned</span>'}
                  ${a.due ? `<span class="pill ${new Date(a.due) < new Date() ? 'overdue' : 'blue'}">${esc(shortDate(a.due))}</span>` : '<span>No date</span>'}
                </div>
              </div>
              <button class="icon-btn" data-add-task="${i}" title="Add this action to tasks">${icon('plus', 15)}</button>
            </div>`).join('')}</div>`
            : `<p class="form-note">No action items detected. Try adding lines like “Daniel will send the report by Friday”.</p>`}
        </div>
      </div>`;

    resultHost.querySelector('[data-act="copy"]').onclick = async () => {
      const text = [
        meeting.title, '',
        'SUMMARY', meeting.summary, '',
        'DECISIONS', ...decisions.map((d) => `- ${d}`), '',
        'ACTION ITEMS', ...actions.map((a) => `- ${a.title}${a.owner ? ` — ${a.owner}` : ''}${a.due ? ` (due ${a.due})` : ''}`)
      ].join('\n');
      const ok = await copyText(text);
      toast(ok ? 'Meeting summary copied.' : 'Copy failed.', ok ? 'success' : 'error');
    };

    resultHost.querySelectorAll('[data-add-task]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const a = actions[Number(btn.dataset.addTask)];
        btn.disabled = true;
        try {
          await api.post('/api/tasks', {
            title: a.title, priority: a.priority || 'medium', dueDate: a.due || '',
            notes: a.owner ? `Owner: ${a.owner}` : '', sourceType: 'meeting', sourceId: meeting.id
          });
          btn.innerHTML = icon('check', 15);
          toast('Task added.', 'success', 1800);
          ctx.refreshShell();
        } catch (err) {
          btn.disabled = false;
          toast(err.message, 'error');
        }
      });
    });
  }

  async function loadList() {
    try {
      const data = await api.get('/api/meetings');
      meetings = data.meetings;
      if (!meetings.length) {
        listHost.innerHTML = `<div class="empty" style="padding:22px 14px"><p>No meetings processed yet.</p></div>`;
        return;
      }
      listHost.innerHTML = `<div class="list">${meetings.map((m) => `
        <div class="list-row">
          <span class="stat-icon" style="width:30px;height:30px;border-radius:9px;flex:none">${icon('meeting', 15)}</span>
          <div class="row-main" data-open="${m.id}" style="cursor:pointer">
            <div class="row-title" style="font-size:13.2px">${esc(m.title)}</div>
            <div class="row-sub">${(m.actions || []).length} actions · ${(m.decisions || []).length} decisions · ${esc(relTime(m.createdAt))}</div>
          </div>
          <button class="icon-btn danger" data-del="${m.id}" title="Delete">${icon('trash', 15)}</button>
        </div>`).join('')}</div>`;
    } catch (err) {
      listHost.innerHTML = `<p class="form-note">${esc(err.message)}</p>`;
    }
  }

  listHost.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) {
      const m = meetings.find((x) => String(x.id) === open.dataset.open);
      if (m) {
        renderMeeting(m);
        host.querySelector('#meeting-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      try {
        await api.del(`/api/meetings/${del.dataset.del}`);
        toast('Meeting removed.', 'success', 1800);
        await loadList();
        ctx.refreshShell();
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  host.querySelector('#refresh-meetings').addEventListener('click', loadList);
  await loadList();
  return () => {};
}
