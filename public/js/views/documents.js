import { api } from '../api.js';
import { esc, icon, toast, loadingButton, relTime, fullDate, shortDate, skeleton, download } from '../ui.js';

export default async function documentsView(host, ctx) {
  let file = null;
  let result = null;
  let library = [];
  let tab = 'upload';

  host.innerHTML = `
    <div class="split">
      <div class="grid" style="gap:18px">
        <section class="card reveal" style="--i:0">
          <div class="card-head">
            <div><h2>Add a document</h2><p>PDF, TXT, Markdown or CSV — up to 8 MB</p></div>
            <div class="tabs">
              <button class="tab is-active" data-tab="upload">Upload</button>
              <button class="tab" data-tab="paste">Paste text</button>
            </div>
          </div>

          <form id="doc-form" class="form-grid" novalidate>
            <label class="field">
              <span>Document title <span style="font-weight:400;color:var(--ink-400)">(optional)</span></span>
              <input type="text" name="title" placeholder="Inferred from the file name if left blank" maxlength="160" />
            </label>

            <div id="pane-upload">
              <div class="dropzone" id="dropzone">
                <input type="file" id="file-input" accept=".pdf,.txt,.md,.markdown,.csv,.log,.rtf,text/plain,application/pdf" />
                <div class="dropzone-icon">${icon('upload', 21)}</div>
                <h3>Drop your document here</h3>
                <p>or click to browse. We extract the text, then summarise it.</p>
                <div id="file-chip"></div>
              </div>
            </div>

            <div id="pane-paste" class="hidden">
              <label class="field">
                <span>Document text</span>
                <textarea name="text" rows="9" placeholder="Paste the report, proposal, contract or notes you want summarised…"></textarea>
              </label>
            </div>

            <div class="form-actions">
              <button class="btn btn-primary" type="submit" id="analyse-btn">${icon('spark', 15)} Summarise document</button>
              <span class="form-note">Nothing is sent to third parties unless a hosted key is configured.</span>
            </div>
          </form>
        </section>

        <section class="card reveal" style="--i:1">
          <div class="card-head">
            <div><h2>Document library</h2><p>Previously summarised documents</p></div>
            <button class="icon-btn" id="refresh-lib" title="Refresh">${icon('refresh', 16)}</button>
          </div>
          <div id="library">${skeleton(3)}</div>
        </section>
      </div>

      <section class="card reveal" style="--i:2" id="result-card">
        <div id="result">
          <div class="empty">
            <div class="empty-icon">${icon('doc', 20)}</div>
            <h3>No document analysed yet</h3>
            <p>Upload a report or paste text. You will get a summary, key points, dates, figures and action items.</p>
          </div>
        </div>
      </section>
    </div>
  `;

  const form = host.querySelector('#doc-form');
  const fileInput = host.querySelector('#file-input');
  const dropzone = host.querySelector('#dropzone');
  const chipHost = host.querySelector('#file-chip');
  const resultHost = host.querySelector('#result');
  const libraryHost = host.querySelector('#library');

  /* ---------------------------------------------------------------- tabs */
  host.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      if (tab === target) return;
      tab = target;
      host.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-active', b === btn));
      host.querySelector('#pane-upload').classList.toggle('hidden', tab !== 'upload');
      host.querySelector('#pane-paste').classList.toggle('hidden', tab !== 'paste');
    });
  });

  function setFile(f) {
    const allowed = /\.(pdf|txt|md|markdown|csv|log|rtf)$/i.test(f.name) || f.type.startsWith('text/') || f.type === 'application/pdf';
    if (!allowed) {
      toast('Unsupported file type. Please use PDF, TXT, MD or CSV.', 'error');
      file = null;
      chipHost.innerHTML = '';
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast('That file is larger than 8 MB.', 'error');
      file = null;
      chipHost.innerHTML = '';
      return;
    }
    file = f;
    chipHost.innerHTML = `<span class="file-chip">${icon('doc', 14)} ${esc(f.name)} · ${(f.size / 1024).toFixed(0)} KB
      <button type="button" class="icon-btn" style="width:20px;height:20px" id="clear-file" title="Remove">${icon('close', 12)}</button></span>`;
    host.querySelector('#clear-file').onclick = (e) => {
      e.preventDefault();
      file = null;
      fileInput.value = '';
      chipHost.innerHTML = '';
    };
    if (!form.title.value) form.title.value = f.name.replace(/\.[^.]+$/, '');
  }

  fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });
  ['dragenter', 'dragover'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
  }));
  dropzone.addEventListener('drop', (e) => {
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) setFile(dropped);
  });

  /* -------------------------------------------------------------- submit */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = host.querySelector('#analyse-btn');
    const restore = loadingButton(btn, 'Analysing…');
    resultHost.innerHTML = `<div style="padding:4px 0">
      <div class="skeleton sk-line w50"></div><div class="skeleton sk-line"></div>
      <div class="skeleton sk-line w70"></div><div class="skeleton sk-block" style="margin-top:14px"></div></div>`;
    try {
      let data;
      const title = form.title.value.trim();
      if (tab === 'upload') {
        if (!file) throw new Error('Choose a PDF or text file first.');
        const fd = new FormData();
        fd.append('file', file);
        if (title) fd.append('title', title);
        data = await api.upload('/api/documents', fd);
      } else {
        const text = form.text.value.trim();
        if (text.length < 30) throw new Error('Paste at least a few sentences to summarise.');
        data = await api.post('/api/documents', { text, title });
      }
      result = data.document;
      renderResult(result);
      form.reset();
      file = null;
      fileInput.value = '';
      chipHost.innerHTML = '';
      await loadLibrary();
      ctx.refreshShell();
      toast('Document summarised.', 'success');
    } catch (err) {
      resultHost.innerHTML = `<div class="card" style="border-color:#f8d4d4;background:#fffafa">
        <strong style="color:#b91c1c">We could not process that document</strong>
        <p class="prose" style="margin-top:6px">${esc(err.message)}</p>
        <p class="form-note" style="margin-top:8px">Try a text-based PDF, or paste the content directly.</p></div>`;
      toast(err.message, 'error');
    } finally { restore(); }
  });

  /* ------------------------------------------------------------- render -- */
  function renderResult(doc) {
    const dates = doc.dates || [];
    const figures = doc.figures || [];
    const points = doc.keyPoints || [];
    const actions = doc.actions || [];

    resultHost.innerHTML = `
      <div class="fade">
        <div class="result-head">
          <div>
            <h2 class="result-title">${esc(doc.title)}</h2>
            <div class="meta-row">
              <span>${esc(doc.sourceName || 'Pasted text')}</span>
              <span>${doc.wordCount.toLocaleString()} words</span>
              <span>${doc.readingMinutes} min read</span>
              <span>${relTime(doc.createdAt)}</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" data-act="download-summary">${icon('download', 14)} .txt</button>
            <button class="btn btn-ghost btn-sm" data-act="copy-summary">${icon('copy', 14)} Copy</button>
          </div>
        </div>

        <div style="margin-top:14px;padding:13px 15px;border-radius:12px;background:var(--blue-50);border:1px solid var(--blue-100)">
          <strong style="font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--blue-700)">Summary</strong>
          <p class="prose" style="margin-top:5px;font-size:13.9px">${esc(doc.summary)}</p>
        </div>

        ${points.length ? `<div style="margin-top:18px">
          <div class="section-title">Key points</div>
          <ul class="bullets">${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        </div>` : ''}

        <div class="grid" style="margin-top:18px;gap:16px">
          <div>
            <div class="section-title">Important dates</div>
            ${dates.length ? `<div class="list">${dates.slice(0, 8).map((d) => `
              <div class="list-row" style="padding:9px 11px">
                <span class="stat-icon" style="width:27px;height:27px;border-radius:8px;flex:none">${icon('calendar', 13)}</span>
                <div class="row-main">
                  <div class="row-title" style="font-size:13px">${esc(d.raw)}</div>
                  ${d.iso ? `<div class="row-sub">${esc(fullDate(d.iso))}</div>` : ''}
                </div>
              </div>`).join('')}</div>` : `<p class="form-note">No explicit dates detected.</p>`}
          </div>
          <div>
            <div class="section-title">Figures mentioned</div>
            ${figures.length ? `<div class="list">${figures.slice(0, 8).map((f) => `
              <div style="padding:10px 12px;border:1px solid var(--line-2);border-radius:11px;background:#fff">
                <span class="pill blue">${esc(f.value)}</span>
                <div style="font-size:12.4px;color:var(--ink-600);line-height:1.55;margin-top:6px">${esc(f.context || f.label)}</div>
              </div>`).join('')}</div>` : `<p class="form-note">No monetary or percentage figures detected.</p>`}
          </div>
        </div>

        <div style="margin-top:20px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
            <div class="section-title" style="margin:0">Action items</div>
            ${actions.length ? `<button class="btn btn-primary btn-sm" data-act="add-all">${icon('task', 13)} Add all to tasks</button>` : ''}
          </div>
          ${actions.length ? `<div class="list">${actions.map((a, i) => `
            <div class="list-row">
              <span class="pill ${a.priority || 'medium'}" style="flex:none">${esc((a.priority || 'medium').toUpperCase())}</span>
              <div class="row-main">
                <div class="row-title" style="font-size:13.2px">${esc(a.title)}</div>
                <div class="row-sub">${a.owner ? esc(a.owner) : 'Unassigned'}${a.due ? ` · due ${esc(shortDate(a.due))}` : ''}</div>
              </div>
              <button class="icon-btn" data-add-action="${i}" title="Add to tasks">${icon('plus', 15)}</button>
            </div>`).join('')}</div>` : `<p class="form-note">No action items detected in this document.</p>`}
        </div>
      </div>`;

    const summaryText = [
      doc.title, '', 'SUMMARY', doc.summary, '',
      points.length ? 'KEY POINTS' : '', ...points.map((p) => `- ${p}`), '',
      dates.length ? 'DATES' : '', ...dates.map((d) => `- ${d.raw}${d.iso ? ` (${d.iso})` : ''}`), '',
      figures.length ? 'FIGURES' : '', ...figures.map((f) => `- ${f.value} — ${f.context || f.label}`), '',
      actions.length ? 'ACTION ITEMS' : '', ...actions.map((a) => `- ${a.title}${a.owner ? ` (${a.owner})` : ''}${a.due ? ` — due ${a.due}` : ''}`)
    ].filter((l) => l !== undefined).join('\n');

    resultHost.querySelector('[data-act="copy-summary"]').onclick = async () => {
      await navigator.clipboard.writeText(summaryText).then(
        () => toast('Summary copied.', 'success'),
        () => toast('Copy failed.', 'error')
      );
    };
    resultHost.querySelector('[data-act="download-summary"]').onclick = () => {
      download(`${doc.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 50)}-summary.txt`, summaryText);
    };

    resultHost.querySelector('[data-act="add-all"]')?.addEventListener('click', async () => {
      try {
        await api.post('/api/tasks/bulk', {
          tasks: actions.map((a) => ({ title: a.title, priority: a.priority, due: a.due })),
          sourceType: 'document', sourceId: doc.id
        });
        toast(`${actions.length} tasks added.`, 'success');
        ctx.refreshShell();
      } catch (err) { toast(err.message, 'error'); }
    });

    resultHost.querySelectorAll('[data-add-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const a = actions[Number(btn.dataset.addAction)];
        btn.disabled = true;
        try {
          await api.post('/api/tasks', {
            title: a.title, priority: a.priority || 'medium', dueDate: a.due || '',
            notes: a.owner ? `Owner: ${a.owner}` : '', sourceType: 'document', sourceId: doc.id
          });
          btn.innerHTML = icon('check', 15);
          toast('Added to tasks.', 'success', 2000);
          ctx.refreshShell();
        } catch (err) {
          btn.disabled = false;
          toast(err.message, 'error');
        }
      });
    });
  }

  /* ------------------------------------------------------------ library -- */
  async function loadLibrary() {
    try {
      const data = await api.get('/api/documents');
      library = data.documents;
      if (!library.length) {
        libraryHost.innerHTML = `<div class="empty" style="padding:22px 14px"><p>No documents yet.</p></div>`;
        return;
      }
      libraryHost.innerHTML = `<div class="list">${library.map((doc) => `
        <div class="list-row">
          <span class="stat-icon" style="width:30px;height:30px;border-radius:9px;flex:none">${icon('doc', 15)}</span>
          <div class="row-main" data-open="${doc.id}" style="cursor:pointer">
            <div class="row-title" style="font-size:13.2px">${esc(doc.title)}</div>
            <div class="row-sub">${doc.wordCount.toLocaleString()} words · ${esc(relTime(doc.createdAt))} · ${(doc.actions || []).length} actions</div>
          </div>
          <button class="icon-btn danger" data-del="${doc.id}" title="Delete">${icon('trash', 15)}</button>
        </div>`).join('')}</div>`;
    } catch (err) {
      libraryHost.innerHTML = `<p class="form-note">${esc(err.message)}</p>`;
    }
  }

  libraryHost.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) {
      const doc = library.find((d) => String(d.id) === open.dataset.open);
      if (doc) {
        result = doc;
        renderResult(doc);
        host.querySelector('#result-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      try {
        await api.del(`/api/documents/${del.dataset.del}`);
        toast('Document removed.', 'success', 2000);
        await loadLibrary();
        ctx.refreshShell();
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  host.querySelector('#refresh-lib').addEventListener('click', loadLibrary);
  await loadLibrary();
  return () => {};
}
