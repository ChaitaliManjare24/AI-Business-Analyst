import { api } from '../api.js';
import { esc, icon, toast, loadingButton, modal, fullDate } from '../ui.js';

export default async function settingsView(host, ctx) {
  const { user } = ctx;

  host.innerHTML = `
    <div class="split">
      <div class="grid" style="gap:18px">
        <section class="card reveal" style="--i:0">
          <div class="card-head"><div><h2>Profile</h2><p>How you appear across the workspace and in generated emails</p></div></div>
          <form id="profile-form" class="form-grid" novalidate>
            <div class="form-row">
              <label class="field">
                <span>Full name</span>
                <input type="text" name="name" value="${esc(user.name)}" maxlength="100" required />
              </label>
              <label class="field">
                <span>Business name</span>
                <input type="text" name="company" value="${esc(user.company || '')}" maxlength="100" />
              </label>
            </div>
            <div class="form-row">
              <label class="field">
                <span>Role</span>
                <input type="text" name="role" value="${esc(user.role || '')}" maxlength="60" placeholder="Founder" />
              </label>
              <label class="field">
                <span>Email address</span>
                <input type="email" value="${esc(user.email)}" disabled />
                <small class="hint">Email is your sign-in identity and cannot be changed here.</small>
              </label>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" type="submit">Save changes</button>
              <span class="form-note">Member since ${esc(fullDate(user.createdAt))}</span>
            </div>
          </form>
        </section>

        <section class="card reveal" style="--i:1">
          <div class="card-head"><div><h2>Password</h2><p>Passwords are hashed with scrypt and a per-user salt</p></div></div>
          <form id="password-form" class="form-grid" novalidate>
            <label class="field">
              <span>Current password</span>
              <input type="password" name="currentPassword" autocomplete="current-password" required />
            </label>
            <div class="form-row">
              <label class="field">
                <span>New password</span>
                <input type="password" name="newPassword" autocomplete="new-password" required placeholder="8+ characters, letter and number" />
              </label>
              <label class="field">
                <span>Confirm new password</span>
                <input type="password" name="confirmPassword" autocomplete="new-password" required />
              </label>
            </div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">Update password</button></div>
          </form>
        </section>

        <section class="card reveal" style="--i:2;border-color:#f8d4d4">
          <div class="card-head"><div><h2 style="color:#b91c1c">Danger zone</h2><p>Permanent actions</p></div></div>
          <p class="prose" style="font-size:13.4px">Deleting your account removes every email draft, document, meeting, report and task attached to it. This cannot be undone.</p>
          <div class="form-actions" style="margin-top:12px">
            <button class="btn btn-ghost" id="export-btn">${icon('download', 14)} Export all data (.json)</button>
            <button class="btn btn-danger" id="delete-account">Delete account</button>
          </div>
        </section>
      </div>

      <div class="grid" style="gap:18px">
        <section class="card reveal" style="--i:3">
          <div class="card-head"><div><h2>AI engine</h2><p>Where generation happens</p></div></div>
          <div style="padding:13px 15px;border-radius:12px;background:var(--blue-50);border:1px solid var(--blue-100)">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="ai-dot"></span>
              <strong style="font-size:13.4px;color:var(--blue-700)">${esc(ctx.ai?.label || 'Local Engine')}</strong>
            </div>
            <div style="font-size:12.6px;color:var(--ink-600);margin-top:6px">
              ${ctx.ai?.hosted
                ? `Requests are sent server-side to <strong>${esc(ctx.ai.label)}</strong> using model <code>${esc(ctx.ai.model)}</code>.`
                : 'Every feature runs on the built-in deterministic engine. No text leaves your server.'}
            </div>
          </div>
          <p class="prose" style="font-size:13px;margin-top:14px">
            API keys live only in server environment variables. The browser never receives a key, and all model calls are proxied through the backend.
          </p>
          <div style="margin-top:12px;padding:12px 14px;border-radius:11px;background:#fbfdff;border:1px solid var(--line);font-size:12.3px;color:var(--ink-600);line-height:1.8">
            <strong style="color:var(--ink-800)">To connect a hosted model</strong><br>
            Set one of these in <code>.env</code> and restart:<br>
            <code>OPENAI_API_KEY</code> · <code>ANTHROPIC_API_KEY</code> · <code>GEMINI_API_KEY</code> · <code>OPENROUTER_API_KEY</code>
          </div>
        </section>

        <section class="card reveal" style="--i:4">
          <div class="card-head"><div><h2>Security</h2><p>How your data is protected</p></div></div>
          <ul class="bullets" style="font-size:13px">
            <li>Passwords hashed with scrypt (64-byte digest, unique salt per user)</li>
            <li>Opaque session tokens stored server-side, delivered as HttpOnly + SameSite cookies</li>
            <li>Every query is scoped to your user id — no cross-tenant reads</li>
            <li>Uploads validated by extension, MIME type and file signature (max 8 MB)</li>
            <li>Cross-origin state changes blocked; strict Content-Security-Policy</li>
          </ul>
        </section>
      </div>
    </div>
  `;

  host.querySelector('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = form.querySelector('button[type=submit]');
    const restore = loadingButton(btn, 'Saving…');
    try {
      const { user: updated } = await api.patch('/api/auth/me', {
        name: form.name.value.trim(),
        company: form.company.value.trim(),
        role: form.role.value.trim()
      });
      Object.assign(ctx.user, updated);
      document.getElementById('user-name').textContent = updated.name;
      document.getElementById('user-company').textContent = updated.company || updated.role || 'Workspace';
      document.getElementById('user-avatar').textContent = updated.name.trim().charAt(0).toUpperCase();
      toast('Profile updated.', 'success');
    } catch (err) { toast(err.message, 'error'); } finally { restore(); }
  });

  host.querySelector('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (form.newPassword.value !== form.confirmPassword.value) {
      toast('The new passwords do not match.', 'error');
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    const restore = loadingButton(btn, 'Updating…');
    try {
      await api.post('/api/auth/password', {
        currentPassword: form.currentPassword.value,
        newPassword: form.newPassword.value
      });
      form.reset();
      toast('Password updated. Other sessions were signed out.', 'success');
    } catch (err) { toast(err.message, 'error'); } finally { restore(); }
  });

  host.querySelector('#export-btn').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/export', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bizassist-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Export downloaded.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  host.querySelector('#delete-account').addEventListener('click', () => {
    modal({
      title: 'Delete your account?',
      subtitle: 'All workspaces data will be permanently removed. Type your password to confirm.',
      body: '<label class="field"><span>Password</span><input type="password" id="confirm-password" autocomplete="current-password" /></label>',
      confirmLabel: 'Delete everything',
      danger: true,
      onConfirm: async (scrim) => {
        const password = scrim.querySelector('#confirm-password').value;
        try {
          await api.del('/api/auth/account', { password });
          toast('Account deleted.', 'success');
          setTimeout(() => window.location.reload(), 700);
        } catch (err) {
          toast(err.message, 'error');
          return false;
        }
        return true;
      }
    });
  });

  return () => {};
}
