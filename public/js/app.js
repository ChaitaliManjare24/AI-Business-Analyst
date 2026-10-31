import { api } from './api.js';
import { toast, loadingButton, esc } from './ui.js';

import dashboard from './views/dashboard.js';
import email from './views/email.js';
import documents from './views/documents.js';
import meetings from './views/meetings.js';
import reports from './views/reports.js';
import tasks from './views/tasks.js';
import settings from './views/settings.js';

const ROUTES = {
  dashboard: { title: 'Dashboard', sub: 'Everything on your plate, at a glance.', view: dashboard },
  email: { title: 'Email Assistant', sub: 'Draft, rewrite and follow up — in the right tone.', view: email },
  documents: { title: 'Document Summarizer', sub: 'Turn long PDFs into decisions, dates and figures.', view: documents },
  meetings: { title: 'Meeting Assistant', sub: 'Notes in, decisions and action items out.', view: meetings },
  reports: { title: 'Report Generator', sub: 'Structured performance reports you can download.', view: reports },
  tasks: { title: 'Tasks', sub: 'Priorities, owners and deadlines in one place.', view: tasks },
  settings: { title: 'Settings', sub: 'Profile, security and AI configuration.', view: settings }
};

const state = { user: null, ai: null, route: 'dashboard', cleanup: null, stats: null };

/* ------------------------------------------------------------------ auth -- */
const el = (id) => document.getElementById(id);

function showAuth() {
  el('boot').classList.add('hidden');
  el('app').classList.add('hidden');
  el('auth').classList.remove('hidden');
}

async function showApp() {
  el('boot').classList.add('hidden');
  el('auth').classList.add('hidden');
  el('app').classList.remove('hidden');
  el('user-name').textContent = state.user.name;
  el('user-company').textContent = state.user.company || state.user.role || 'Workspace';
  el('user-avatar').textContent = (state.user.name || '?').trim().charAt(0).toUpperCase();
  el('ai-label').textContent = state.ai?.label || 'Local Engine';
  el('ai-model').textContent = state.ai?.hosted ? state.ai.model : 'offline mode';
  el('ai-chip').classList.toggle('hosted', !!state.ai?.hosted);
  const today = new Date();
  el('today-chip').textContent = today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  await refreshCounts();
  navigate();
}

async function refreshCounts() {
  try {
    const stats = await api.get('/api/stats');
    state.stats = stats;
    state.ai = stats.ai || state.ai;
    const badge = el('nav-task-count');
    const open = stats.tasks.pending;
    badge.textContent = String(open);
    badge.hidden = open === 0;
    el('ai-label').textContent = stats.ai.label;
    el('ai-model').textContent = stats.ai.hosted ? stats.ai.model : 'offline mode';
  } catch { /* non-fatal */ }
}

function bindAuth() {
  document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-auth-tab]').forEach((t) => t.classList.toggle('is-active', t === tab));
      const isLogin = tab.dataset.authTab === 'login';
      el('login-form').classList.toggle('hidden', !isLogin);
      el('register-form').classList.toggle('hidden', isLogin);
      document.querySelectorAll('.auth-form [data-error]').forEach((e) => { e.hidden = true; });
    });
  });

  el('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const error = form.querySelector('[data-error]');
    const btn = form.querySelector('button[type=submit]');
    error.hidden = true;
    const restore = loadingButton(btn, 'Signing in…');
    try {
      const data = await api.post('/api/auth/login', {
        email: form.email.value.trim(),
        password: form.password.value
      });
      state.user = data.user;
      await bootstrapSession();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally { restore(); }
  });

  el('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const error = form.querySelector('[data-error]');
    const btn = form.querySelector('button[type=submit]');
    error.hidden = true;
    const restore = loadingButton(btn, 'Creating…');
    try {
      const data = await api.post('/api/auth/register', {
        name: form.name.value.trim(),
        company: form.company.value.trim(),
        email: form.email.value.trim(),
        password: form.password.value
      });
      state.user = data.user;
      await bootstrapSession();
      toast(`Welcome, ${data.user.name.split(' ')[0]}! Your workspace is ready.`, 'success');
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally { restore(); }
  });

  el('demo-login').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const restore = loadingButton(btn, 'Opening demo…');
    try {
      const data = await api.post('/api/auth/login', { email: 'demo@bizassist.ai', password: 'Demo1234' });
      state.user = data.user;
      await bootstrapSession();
      toast('Signed in to the demo workspace.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally { restore(); }
  });
}

async function bootstrapSession() {
  try {
    const me = await api.get('/api/auth/me');
    state.user = me.user;
    const status = await api.get('/api/public/status');
    state.ai = status.ai;
    await showApp();
  } catch (err) {
    if (err.status === 401) showAuth();
    else { toast(err.message, 'error'); showAuth(); }
  }
}

/* ---------------------------------------------------------------- router -- */
function currentRoute() {
  const [, query] = window.location.hash.replace(/^#\/?/, '').split('?');
  const name = window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard';
  return { name: ROUTES[name] ? name : 'dashboard', query: new URLSearchParams(query || '') };
}

async function navigate() {
  if (!state.user) return;
  if (typeof state.cleanup === 'function') {
    try { state.cleanup(); } catch { /* ignore */ }
    state.cleanup = null;
  }
  const { name, query } = currentRoute();
  state.route = name;
  const route = ROUTES[name];
  el('page-title').textContent = route.title;
  el('page-sub').textContent = route.sub;
  document.title = `${route.title} · AI Business Assistant`;
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.route === name);
  });
  closeSidebar();

  const host = el('view');
  host.innerHTML = `<div class="card reveal" style="--i:0"><div class="skeleton sk-line w50"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line w70"></div></div>`;
  try {
    state.cleanup = await route.view(host, {
      user: state.user,
      ai: state.ai,
      stats: state.stats,
      query,
      navigate: (hash) => { window.location.hash = hash; },
      refreshShell: refreshCounts
    });
  } catch (err) {
    host.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="prose" style="margin-top:8px">${esc(err.message)}</p>
      <button class="btn btn-ghost" style="margin-top:14px" onclick="location.reload()">Reload the page</button></div>`;
  }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ----------------------------------------------------------------- shell -- */
function openSidebar() {
  el('sidebar').classList.add('open');
  el('scrim').hidden = false;
}
function closeSidebar() {
  el('sidebar').classList.remove('open');
  el('scrim').hidden = true;
}

function bindShell() {
  el('menu-btn').addEventListener('click', openSidebar);
  el('sidebar-close').addEventListener('click', closeSidebar);
  el('scrim').addEventListener('click', closeSidebar);

  const quickBtn = el('quick-create-btn');
  const quickMenu = el('quick-menu');
  quickBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    quickMenu.hidden = !quickMenu.hidden;
  });
  quickMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-go]');
    if (!btn) return;
    quickMenu.hidden = true;
    window.location.hash = btn.dataset.go;
  });
  document.addEventListener('click', () => { quickMenu.hidden = true; });

  el('logout-btn').addEventListener('click', async () => {
    try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
    state.user = null;
    el('view').innerHTML = '';
    showAuth();
  });

  window.addEventListener('hashchange', () => { navigate(); });
}

/* ------------------------------------------------------------------ boot -- */
async function boot() {
  bindAuth();
  bindShell();
  let status = null;
  try {
    status = await api.get('/api/public/status');
    state.ai = status.ai;
  } catch { /* server status is best-effort */ }

  // Avoid a noisy 401 when there is no session: the public status endpoint
  // already tells us whether a cookie is valid.
  if (status && !status.authenticated) {
    showAuth();
    return;
  }
  await bootstrapSession();
}

boot();
export { state };
