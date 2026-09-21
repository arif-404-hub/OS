import { api, token } from './api.js';
import { initUMLStudio } from './uml.js';

// ------------------------------------------------------------- helpers ----

const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

/** Escape untrusted text before putting it into innerHTML. */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const state = { user: null, projects: [], project: null, view: 'dashboard', users: [], boardSprintId: 'all' };

const STATUS_LABEL = { backlog: 'Backlog', todo: 'To do', in_progress: 'In progress', review: 'Review', done: 'Done' };
const BUG_STATUS_LABEL = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
const SEVERITY_PILL = { critical: 'red', high: 'red', medium: 'amber', low: 'grey' };
const PRIORITY_PILL = { high: 'red', medium: 'amber', low: 'grey' };

function toast(message, bad = false) {
  const node = el('toast');
  node.textContent = message;
  node.className = `toast${bad ? ' bad' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.add('hidden'), 3600);
}

function openModal(title, html, onReady, isWide = false) {
  el('modalTitle').textContent = title;
  el('modalBody').innerHTML = html;
  const card = el('modal').querySelector('.modal-card');
  if (card) card.classList.toggle('modal-lg', Boolean(isWide));
  el('modal').classList.remove('hidden');
  if (onReady) onReady();
}
const closeModal = () => {
  el('modal').classList.add('hidden');
  const card = el('modal').querySelector('.modal-card');
  if (card) card.classList.remove('modal-lg');
};

const barClass = (value) => (value >= 75 ? 'ok' : value >= 45 ? 'warn' : 'bad');
const meter = (value, cls) => `<div class="bar ${cls ?? barClass(value)}"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div>`;
const emptyState = (icon, text) => `<div class="empty"><div class="big">${icon}</div>${esc(text)}</div>`;

// ------------------------------------------------------------ sign in -----

function processOAuthResult() {
  const params = new URLSearchParams(location.hash.slice(1));
  const oauthToken = params.get('oauth_token');
  const oauthError = params.get('oauth_error');
  if (!oauthToken && !oauthError) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (oauthToken) token.set(oauthToken);
  if (oauthError) {
    el('authError').textContent = oauthError;
    el('authError').classList.remove('hidden');
  }
}

document.querySelectorAll('[data-oauth-provider]').forEach((button) => {
  button.addEventListener('click', () => {
    button.disabled = true;
    const base = location.pathname.startsWith('/OS') ? '/OS/api' : '/api';
    location.assign(`${base}/auth/${button.dataset.oauthProvider}`);
  });
});

let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('#authTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
  document.querySelectorAll('.reg-only').forEach((f) => f.classList.toggle('hidden', mode !== 'register'));
  el('authSubmit').textContent = mode === 'login' ? 'Sign in' : 'Create account';
  el('authPassword').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  el('authError').classList.add('hidden');
}

el('authTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  setAuthMode(tab.dataset.mode);
});

async function setupSocialLogin() {
  const buttons = { google: el('googleLogin'), github: el('githubLogin') };

  Object.entries(buttons).forEach(([provider, button]) => {
    if (!button) return;
    button.addEventListener('click', async () => {
      button.disabled = true;
      const originalHtml = button.innerHTML;
      button.innerHTML = '<span class="spinner"></span> Connecting...';
      try {
        const providers = await api.get('/auth/providers').catch(() => ({}));
        if (!providers[provider]) {
          button.disabled = false;
          button.innerHTML = originalHtml;
          const name = provider === 'google' ? 'Google' : 'GitHub';
          el('authError').textContent = `${name} OAuth is not configured on the server. Please verify ${provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'GITHUB_CLIENT_ID'} in .env.`;
          el('authError').classList.remove('hidden');
          return;
        }
        window.location.href = `/api/auth/${provider}`;
      } catch (err) {
        button.disabled = false;
        button.innerHTML = originalHtml;
        el('authError').textContent = err.message || 'Could not initiate social login.';
        el('authError').classList.remove('hidden');
      }
    });
  });

  try {
    const providers = await api.get('/auth/providers');
    Object.entries(buttons).forEach(([provider, button]) => {
      if (!button) return;
      const enabled = Boolean(providers[provider]);
      const name = provider === 'google' ? 'Google' : 'GitHub';
      button.title = enabled ? `Continue with ${name}` : `${name} login is not configured in .env`;
      button.style.opacity = enabled ? '1' : '0.85';
    });
  } catch {
    // Keep defaults if API is warming up
  }
}

setupSocialLogin();

el('auth').addEventListener('click', (e) => {
  const control = e.target.closest('[data-auth-mode]');
  if (control) setAuthMode(control.dataset.authMode);
});

el('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = el('authSubmit');
  const errorBox = el('authError');
  errorBox.classList.add('hidden');
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span>';

  const payload = {
    email: el('authEmail').value.trim(),
    password: el('authPassword').value,
    ...(authMode === 'register' ? { name: el('authName').value.trim(), role: el('authRole').value } : {}),
  };

  try {
    const { token: jwt, user } = await api.post(`/auth/${authMode}`, payload);
    token.set(jwt);
    state.user = user;
    await startApp();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = authMode === 'login' ? 'Sign in' : 'Create account';
  }
});

el('logoutBtn').addEventListener('click', () => { token.clear(); location.reload(); });
el('modalClose').addEventListener('click', closeModal);
el('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

// -------------------------------------------------------------- boot ------

async function startApp() {
  el('auth').classList.add('hidden');
  el('app').classList.remove('hidden');

  el('userName').textContent = state.user.name;
  el('userRole').textContent = state.user.role;
  el('userAvatar').textContent = state.user.name.charAt(0).toUpperCase();
  el('topUserName').textContent = state.user.name;
  el('topAvatar').textContent = state.user.name.charAt(0).toUpperCase();

  ['userName', 'userAvatar', 'topUserName', 'topAvatar'].forEach((id) => {
    const node = el(id);
    if (node) {
      node.style.cursor = 'pointer';
      node.title = 'Click to edit profile & GitHub identity';
      node.onclick = openProfileModal;
    }
  });

  state.users = await api.get('/auth/users').catch(() => []);
  await loadProjects();
}

function openProfileModal() {
  openModal('User Profile & GitHub Identity', `
    <p class="muted" style="margin-top:0;font-size:13px">Manage your developer profile and link your GitHub account to discover all your projects.</p>
    <div class="field">
      <label for="profName">Display Name</label>
      <input id="profName" value="${esc(state.user.name)}">
    </div>
    <div class="field">
      <label for="profEmail">Email</label>
      <input id="profEmail" value="${esc(state.user.email)}" disabled style="opacity:0.7">
    </div>
    <div class="field">
      <label for="profRole">Role</label>
      <input id="profRole" value="${esc(state.user.role)}" disabled style="opacity:0.7">
    </div>
    <div class="field">
      <label for="profGithub">GitHub Username <span class="muted">(your GitHub profile handle)</span></label>
      <input id="profGithub" value="${esc(state.user.github_username || '')}" placeholder="e.g. purnata-c or octocat">
      <p class="hint" style="text-align:left;margin-top:4px">Allows EngineerOS to automatically list all your repositories across your projects.</p>
    </div>
    <div class="field">
      <label for="profToken">Personal Access Token (PAT) <span class="muted">(optional, for private repos & workflows)</span></label>
      <input id="profToken" type="password" placeholder="${state.user.has_github_token ? '•••••••••••••••• (saved)' : 'ghp_xxxxxxxxxxxxxxxxxxxx'}" autocomplete="new-password">
      <p class="hint" style="text-align:left;margin-top:4px">Stored securely to access private repositories, open PRs, and trigger actions.</p>
    </div>
    <p class="error hidden" id="profError"></p>
    <button class="btn primary block" id="profSave">Save Profile</button>
  `, () => {
    el('profSave').addEventListener('click', async () => {
      const name = el('profName').value.trim();
      const githubUsername = el('profGithub').value.trim();
      const githubToken = el('profToken').value.trim();
      try {
        const res = await api.patch('/auth/profile', {
          name,
          github_username: githubUsername,
          ...(githubToken ? { github_token: githubToken } : {}),
        });
        state.user = res.user;
        el('userName').textContent = state.user.name;
        el('topUserName').textContent = state.user.name;
        el('userAvatar').textContent = state.user.name.charAt(0).toUpperCase();
        el('topAvatar').textContent = state.user.name.charAt(0).toUpperCase();
        closeModal();
        toast('Profile updated!');
        if (state.view === 'github') render();
      } catch (err) {
        el('profError').textContent = err.message;
        el('profError').classList.remove('hidden');
      }
    });
  });
}

async function loadProjects() {
  state.projects = await api.get('/projects');
  const select = el('projectSelect');

  if (!state.projects.length) {
    select.innerHTML = '<option>No projects yet</option>';
    state.project = null;
    return newProjectDialog(true);
  }

  select.innerHTML = state.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const keep = state.project && state.projects.find((p) => p.id === state.project.id);
  select.value = String(keep ? state.project.id : state.projects[0].id);
  await selectProject(Number(select.value));
}

async function selectProject(id) {
  state.project = await api.get(`/projects/${id}`);
  await render();
}

el('projectSelect').addEventListener('change', (e) => selectProject(Number(e.target.value)));
el('newProjectBtn').addEventListener('click', () => newProjectDialog(false));

function newProjectDialog(first) {
  const suggestedSlug = state.user?.github_username
    ? `${state.user.github_username}/`
    : '';

  openModal(first ? 'Create your first project' : 'New project', `
    <div class="field">
      <label for="pName">Project name</label>
      <input id="pName" placeholder="e.g. Eco Bangla, EngineerOS">
    </div>
    <div class="field">
      <label for="pDesc">Description</label>
      <textarea id="pDesc" rows="5" placeholder="What the system does, who uses it, the main workflows, and why it exists."></textarea>
    </div>
    <div class="field">
      <label for="pType">Project type / domain <span class="muted">(optional)</span></label>
      <input id="pType" placeholder="e.g. Smart waste management, healthcare, fintech">
    </div>
    <div class="field">
      <label for="pRepo">GitHub Repository <span class="muted">(optional, owner/repo)</span></label>
      <input id="pRepo" placeholder="${suggestedSlug ? `${suggestedSlug}my-repo` : 'e.g. username/repo or https://github.com/owner/repo'}">
      <p class="hint" style="text-align:left;margin-top:4px">Each project can link to its own repository under your profile. You can also pick or change it later.</p>
    </div>
    <p class="error hidden" id="pError"></p>
    <button class="btn primary block" id="pSave">Create project</button>
  `, () => {
    el('pName').focus();
    el('pSave').addEventListener('click', async () => {
      try {
        const created = await api.post('/projects', {
          name: el('pName').value,
          description: el('pDesc').value,
          project_type: el('pType').value,
          github_repo: el('pRepo').value.trim(),
        });
        closeModal();
        state.project = created;
        await loadProjects();
        toast(`Project "${created.name}" created.`);
      } catch (err) {
        el('pError').textContent = err.message;
        el('pError').classList.remove('hidden');
      }
    });
  });
}

// -------------------------------------------------------------- views -----

el('nav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  state.view = item.dataset.view;
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n === item));
  render();
});

const VIEW_META = {
  dashboard: ['Dashboard', 'Project health, velocity and risk at a glance'],
  requirements: ['Requirements', 'Generate, score and review functional and non-functional requirements'],
  srs: ['SRS document', 'IEEE-830 specification generated from your requirements'],
  uml: ['UML diagrams', 'AI-generated from the active requirement set'],
  architecture: ['Architecture & DB Design', 'System architecture recommendation, database schema and multi-dialect SQL generation'],
  board: ['Sprint board', 'Plan, assign and move work across the sprint'],
  bugs: ['Bug tracker', 'Defects by severity, with duplicate detection'],
  trace: ['Traceability', 'Requirement to story to sprint, delivery evidence, defects and deployment'],
  review: ['AI code review', 'Static analysis for smells, security and complexity'],
  github: ['GitHub Integration', 'Repositories, Commits, Pull Requests, Issues and CI/CD Actions'],
  assistant: ['Assistant', 'Ask questions about this project in plain English'],
  team: ['Team', 'Members, roles and recent activity'],
};

const VIEWS = {
  dashboard: renderDashboard,
  requirements: renderRequirements,
  srs: renderSRS,
  uml: renderUML,
  architecture: renderArchitecture,
  board: renderBoard,
  bugs: renderBugs,
  trace: renderTrace,
  review: renderReview,
  github: renderGitHub,
  assistant: renderAssistant,
  team: renderTeam,
};

/** Swap a node for an empty clone, so listeners from the previous view are dropped. */
function resetNode(id, tag, className) {
  const fresh = document.createElement(tag);
  fresh.id = id;
  if (className) fresh.className = className;
  el(id).replaceWith(fresh);
  return fresh;
}

async function render() {
  if (!state.project) return;
  const [title, subtitle] = VIEW_META[state.view];
  el('viewTitle').textContent = title;
  el('viewSubtitle').textContent = subtitle;

  resetNode('topbarActions', 'div', 'row');
  resetNode('view', 'section', 'view').innerHTML = '<div class="empty"><span class="spinner"></span></div>';

  try {
    await VIEWS[state.view]();
  } catch (err) {
    el('view').innerHTML = `<div class="card"><p class="error">${esc(err.message)}</p></div>`;
  }
}

const P = () => `/projects/${state.project.id}`;

// ---------------------------------------------------------- dashboard -----

async function renderDashboard() {
  const a = await api.get(`${P()}/analytics`);
  const maxVelocity = Math.max(1, ...a.velocity.map((v) => Math.max(v.planned, v.completed)));

  el('view').innerHTML = `
    <div class="card project-overview">
      <div class="panel-heading"><h3><span class="panel-icon blue">◆</span> Project overview</h3><button class="btn small" id="editProjectBtn">Edit description</button></div>
      <div class="overview-grid"><div><span class="overview-label">Project name</span><strong>${esc(state.project.name)}</strong></div><div><span class="overview-label">Description</span><p>${esc(state.project.description || 'No description saved.')}</p></div><div><span class="overview-label">Status</span><span class="pill green">Active</span></div><div><span class="overview-label">Created</span><span>${esc(state.project.created_at || '—')}</span></div></div>
    </div>
    <div class="grid cols-4 dashboard-stats">
      <div class="stat dashboard-stat"><div class="stat-icon blue">◉</div><div class="label">Project health <span>›</span></div><div class="value" style="color:${a.health >= 75 ? 'var(--ok)' : a.health >= 45 ? 'var(--warn)' : 'var(--bad)'}">${a.health}</div>
        <div class="sub">out of 100</div>${meter(a.health)}</div>
      <div class="stat dashboard-stat"><div class="stat-icon violet">▤</div><div class="label">Requirements <span>›</span></div><div class="value">${a.totals.requirements}</div>
        <div class="sub">${a.totals.functional} functional &middot; ${a.totals.nonFunctional} non-functional</div></div>
      <div class="stat dashboard-stat"><div class="stat-icon teal">▣</div><div class="label">Sprint progress <span>›</span></div><div class="value">${a.points.progress}%</div>
        <div class="sub">${a.points.done} of ${a.points.total} story points</div>${meter(a.points.progress)}</div>
      <div class="stat dashboard-stat"><div class="stat-icon rose">⬡</div><div class="label">Open defects <span>›</span></div><div class="value" style="color:${a.totals.openBugs ? 'var(--bad)' : 'var(--ok)'}">${a.totals.openBugs}</div>
        <div class="sub">${a.bySeverity.critical} critical &middot; ${a.bySeverity.high} high</div></div>
    </div>

    <div class="grid cols-2 dashboard-panels" style="margin-top:16px">
      <div class="card dashboard-panel">
        <div class="panel-heading"><h3><span class="panel-icon blue">▥</span> Quality signals</h3><a href="#" data-dashboard-view="requirements">View details →</a></div>
        ${[['Requirement quality', a.avgQuality, ''], ['Traceability coverage', a.traceability, ''],
           ['Technical debt', a.debt, 'inverted']].map(([label, value, inverted]) => `
          <div style="margin-bottom:14px">
            <div class="row" style="justify-content:space-between;font-size:13.5px">
              <span>${label}</span><strong>${value}${label === 'Technical debt' ? '' : '%'}</strong>
            </div>
            ${meter(value, inverted ? barClass(100 - value) : barClass(value))}
          </div>`).join('')}
        <div class="row" style="justify-content:space-between;font-size:13.5px;border-top:1px solid var(--line);padding-top:12px">
          <span class="muted">Requirement conflicts detected</span>
          <span class="pill ${a.conflicts ? 'amber' : 'green'}">${a.conflicts}</span>
        </div>
      </div>

      <div class="card dashboard-panel">
        <div class="panel-heading"><h3><span class="panel-icon blue">⬡</span> Risk register</h3><a href="#" data-dashboard-view="requirements">View all →</a></div>
        ${a.risks.map((r) => `
          <div class="finding ${r.level === 'high' ? 'high' : r.level === 'medium' ? 'medium' : 'low'}">
            <span class="pill ${r.level === 'high' ? 'red' : r.level === 'medium' ? 'amber' : 'green'}">${r.level}</span>
            <div style="margin-top:6px">${esc(r.text)}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card dashboard-panel">
        <div class="panel-heading"><h3><span class="panel-icon blue">⌁</span> Velocity by sprint</h3><a href="#" data-dashboard-view="board">View details →</a></div>
        ${a.velocity.length ? a.velocity.map((v) => `
          <div style="margin-bottom:13px">
            <div class="row" style="justify-content:space-between;font-size:13.5px">
              <span>${esc(v.sprint)}</span>
              <span class="muted">${v.completed} / ${v.planned} pts</span>
            </div>
            ${meter((v.completed / maxVelocity) * 100, 'ok')}
          </div>`).join('') : '<p class="muted">No sprints yet.</p>'}
      </div>

      <div class="card dashboard-panel">
        <div class="panel-heading"><h3><span class="panel-icon blue">♟</span> Work distribution</h3><a href="#" data-dashboard-view="board">View details →</a></div>
        ${Object.entries(a.byStatus).map(([status, count]) => `
          <div style="margin-bottom:11px">
            <div class="row" style="justify-content:space-between;font-size:13.5px">
              <span>${STATUS_LABEL[status]}</span><strong>${count}</strong>
            </div>
            ${meter(a.totals.tasks ? (count / a.totals.tasks) * 100 : 0, 'ok')}
          </div>`).join('')}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>Recent activity</h3>
      ${a.activity.length ? `<table><tbody>${a.activity.map((x) => `
        <tr><td style="width:150px" class="muted">${esc(x.created_at)}</td>
            <td><strong>${esc(x.user || 'Someone')}</strong> ${esc(x.message)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Nothing has happened on this project yet.</p>'}
    </div>`;

  el('view').addEventListener('click', (event) => {
    const link = event.target.closest('[data-dashboard-view]');
    if (!link) return;
    event.preventDefault();
    state.view = link.dataset.dashboardView;
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === state.view));
    render();
  });
  el('editProjectBtn').addEventListener('click', editProjectDialog);
}

function editProjectDialog() {
  openModal('Edit project overview & repository', `
    <div class="field"><label for="editName">Project name</label><input id="editName" value="${esc(state.project.name)}"></div>
    <div class="field"><label for="editDesc">Project description</label><textarea id="editDesc" rows="6">${esc(state.project.description || '')}</textarea></div>
    <div class="field"><label for="editType">Project type / domain <span class="muted">(optional)</span></label><input id="editType" value="${esc(state.project.project_type || '')}"></div>
    <div class="field">
      <label for="editRepo">GitHub Repository <span class="muted">(owner/repo)</span></label>
      <input id="editRepo" value="${esc(state.project.github_repo || '')}" placeholder="e.g. username/repository">
      <p class="hint" style="text-align:left;margin-top:4px">Each project can connect to a distinct repository under your profile or organization.</p>
    </div>
    <p class="error hidden" id="editError"></p><button class="btn primary block" id="editSave">Save changes</button>
  `, () => {
    el('editSave').addEventListener('click', async () => {
      try {
        state.project = await api.patch(`/projects/${state.project.id}`, {
          name: el('editName').value,
          description: el('editDesc').value,
          project_type: el('editType').value,
          github_repo: el('editRepo').value.trim(),
        });
        closeModal();
        toast('Project overview updated.');
        render();
      } catch (err) {
        el('editError').textContent = err.message;
        el('editError').classList.remove('hidden');
      }
    });
  });
}

// ------------------------------------------------------- requirements -----

async function renderRequirements() {
  const { requirements, conflicts, project } = await api.get(`${P()}/requirements`);

  el('topbarActions').innerHTML = `
    <button class="btn" id="addOneBtn">+ Add one</button>
    <button class="btn primary" id="generateBtn">Generate from project description</button>`;

  el('view').innerHTML = `
    ${conflicts.length ? `<div class="card" style="border-color:rgba(240,180,41,.4)">
      <h3>⚠ ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''} and overlap${conflicts.length > 1 ? 's' : ''} detected</h3>
      ${conflicts.map((c) => `<div class="issues"><b>${esc(c.a)} ↔ ${esc(c.b)}</b> (${esc(c.type)}) — ${esc(c.detail)}</div>`).join('')}
    </div>` : ''}

    <div class="grid" style="margin-top:${conflicts.length ? 16 : 0}px">
      ${requirements.length ? requirements.map((r) => `
        <div class="req-card ${r.kind === 'functional' ? '' : 'nfr'}">
          <div class="row" style="justify-content:space-between">
            <div>
              <span class="code">${esc(r.code)}</span>
              <span class="pill ${r.kind === 'functional' ? 'blue' : 'grey'}">${esc(r.category || r.kind)}</span>
              <span class="pill ${PRIORITY_PILL[r.priority]}">${esc(r.priority)}</span>
            </div>
            <div class="row">
              <span class="pill ${r.quality >= 75 ? 'green' : r.quality >= 50 ? 'amber' : 'red'}">quality ${r.quality}</span>
              <button class="btn ghost small" data-edit="${r.id}">Edit</button><button class="btn ghost small danger" data-del="${r.id}">Delete</button>
            </div>
          </div>
          <h4 style="margin-top:9px">${esc(r.title)}</h4>
          <p style="margin:4px 0;font-size:14px;color:#c3cdec">${esc(r.description)}</p>
          <div class="story">${esc(r.story)}</div>
          <strong style="font-size:12.5px;color:var(--muted)">ACCEPTANCE CRITERIA</strong>
          <ol class="ac">${r.acceptance.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
          ${r.issues.length ? `<div class="issues"><b>Review notes:</b> ${r.issues.map(esc).join(' ')}</div>` : ''}
        </div>`).join('')
      : `<div class="empty project-source-empty"><div class="big">◈</div><strong>Generate requirements from project description</strong><p>${esc(project?.description || 'Add a project description first.')}</p><button class="btn primary" id="generateEmptyBtn">Generate requirements</button></div>`}
    </div>`;

  el('generateBtn').addEventListener('click', generateDialog);
  el('generateEmptyBtn')?.addEventListener('click', generateDialog);
  el('addOneBtn').addEventListener('click', addRequirementDialog);
  el('view').addEventListener('click', async (e) => {
    const editId = e.target.dataset?.edit;
    if (editId) {
      const requirement = requirements.find((item) => item.id === Number(editId));
      if (requirement) editRequirementDialog(requirement);
      return;
    }
    const id = e.target.dataset?.del;
    if (!id) return;
    await api.del(`${P()}/requirements/${id}`);
    toast('Requirement deleted.');
    render();
  });
}

function editRequirementDialog(requirement) {
  openModal(`Edit ${requirement.code}`, `
    <div class="field"><label for="editReqTitle">Title</label><input id="editReqTitle" value="${esc(requirement.title)}"></div>
    <div class="field"><label for="editReqDesc">Requirement statement</label><textarea id="editReqDesc" rows="5">${esc(requirement.description)}</textarea></div>
    <div class="field"><label for="editReqPriority">Priority</label><select id="editReqPriority"><option value="high" ${requirement.priority === 'high' ? 'selected' : ''}>High</option><option value="medium" ${requirement.priority === 'medium' ? 'selected' : ''}>Medium</option><option value="low" ${requirement.priority === 'low' ? 'selected' : ''}>Low</option></select></div>
    <p class="error hidden" id="editReqError"></p><button class="btn primary block" id="editReqSave">Save requirement</button>
  `, () => {
    el('editReqSave').addEventListener('click', async () => {
      try {
        await api.patch(`${P()}/requirements/${requirement.id}`, { title: el('editReqTitle').value, description: el('editReqDesc').value, priority: el('editReqPriority').value });
        closeModal();
        toast('Requirement updated and rescored.');
        render();
      } catch (err) {
        el('editReqError').textContent = err.message;
        el('editReqError').classList.remove('hidden');
      }
    });
  });
}

function generateDialog() {
  openModal('Generate requirements from project description', `
    <p class="muted" style="margin-top:0;font-size:13.5px">
      EngineerOS will analyse the saved project description below. Each statement is classified,
      turned into a user story with acceptance criteria, and scored for ambiguity.
    </p>
    <div class="field"><label for="gText">Project description <span class="muted">(editable)</span></label><textarea id="gText" class="project-description-editor" rows="10">${esc(state.project.description || '')}</textarea></div>
    <p class="error hidden" id="gError"></p>
    <button class="btn primary block" id="gRun">Analyse and generate</button>
  `, () => {
    el('gRun').focus();
    el('gRun').addEventListener('click', async () => {
      const button = el('gRun');
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span> Analysing…';
      try {
        const description = el('gText').value.trim();
        if (description !== state.project.description) {
          state.project = await api.patch(`/projects/${state.project.id}`, {
            name: state.project.name,
            description,
            project_type: state.project.project_type || '',
          });
        }
        const out = await api.post(`${P()}/requirements/generate`);
        closeModal();
        toast(`${out.created} requirements generated.`);
        render();
      } catch (err) {
        el('gError').textContent = err.message;
        el('gError').classList.remove('hidden');
        button.disabled = false;
        button.textContent = 'Analyse and generate';
      }
    });
  });
}

function addRequirementDialog() {
  openModal('Add a requirement', `
    <div class="field">
      <label for="rDesc">Requirement statement</label>
      <textarea id="rDesc" rows="4" placeholder="The system shall send an email notification when a task is assigned."></textarea>
    </div>
    <div class="row">
      <div class="field grow">
        <label for="rKind">Type</label>
        <select id="rKind"><option value="">Detect automatically</option><option value="functional">Functional</option><option value="non-functional">Non-functional</option></select>
      </div>
      <div class="field grow">
        <label for="rPriority">Priority</label>
        <select id="rPriority"><option value="">Detect automatically</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
      </div>
    </div>
    <p class="error hidden" id="rError"></p>
    <button class="btn primary block" id="rSave">Add requirement</button>
  `, () => {
    el('rDesc').focus();
    el('rSave').addEventListener('click', async () => {
      try {
        await api.post(`${P()}/requirements`, {
          description: el('rDesc').value,
          kind: el('rKind').value || undefined,
          priority: el('rPriority').value || undefined,
        });
        closeModal();
        toast('Requirement added and scored.');
        render();
      } catch (err) {
        el('rError').textContent = err.message;
        el('rError').classList.remove('hidden');
      }
    });
  });
}

// ---------------------------------------------------------------- SRS -----

async function renderSRS() {
  el('topbarActions').innerHTML = `
    <select id="srsType" aria-label="SRS format" title="Choose SRS format">
      <option value="ieee">IEEE 830 format</option>
      <option value="university">University project format</option>
    </select>
    <button class="btn" id="srsMd">Download Markdown</button>
    <button class="btn" id="srsHtml">Download HTML</button>
    <button class="btn primary" id="srsPrint">Print / Save as PDF</button>`;

  let html;
  try {
    html = await api.get(`${P()}/srs?type=ieee`);
  } catch (err) {
    if (err.message === 'Generate requirements first.') {
      el('view').innerHTML = `<div class="card workflow-empty"><div class="big">▤</div><h3>Generate requirements first</h3><p class="muted">The SRS uses this project's description, user stories, acceptance criteria, and saved requirements.</p><button class="btn primary" id="goRequirements">Open Requirements</button></div>`;
      el('goRequirements').addEventListener('click', () => { state.view = 'requirements'; render(); });
      return;
    }
    throw err;
  }
  el('view').innerHTML = `<div class="card" style="padding:0;overflow:hidden">
    <iframe id="srsFrame" style="width:100%;height:78vh;border:0;background:#fff" title="SRS document"></iframe>
  </div>`;
  el('srsFrame').srcdoc = html;

  const download = (content, filename, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const slug = state.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
  const typeName = () => el('srsType').value === 'university' ? 'University-' : '';
  el('srsType').addEventListener('change', async () => {
    try {
      html = await api.get(`${P()}/srs?type=${el('srsType').value}`);
      el('srsFrame').srcdoc = html;
    } catch (err) { toast(err.message, true); }
  });

  el('srsHtml').addEventListener('click', () => download(html, `SRS-${typeName()}${slug}.html`, 'text/html'));
  el('srsMd').addEventListener('click', async () => {
    const button = el('srsMd');
    button.disabled = true;
    try {
      download(await api.get(`${P()}/srs?type=${el('srsType').value}&format=markdown`), `SRS-${typeName()}${slug}.md`, 'text/markdown');
    } catch (err) {
      toast(err.message, true);
    } finally {
      button.disabled = false;
    }
  });
  el('srsPrint').addEventListener('click', () => {
    const frame = el('srsFrame');
    if (frame?.contentWindow) frame.contentWindow.print();
    else toast('The SRS document is still loading.', true);
  });
}

// ---------------------------------------------------------------- UML -----

const DIAGRAMS = [
  ['usecase', 'Use case'], ['class', 'Class'], ['sequence', 'Sequence'], ['activity', 'Activity'],
  ['er', 'Entity relationship'], ['state', 'State'], ['component', 'Component'], ['deployment', 'Deployment'],
];

let mermaidLib = null;
let umlType = 'usecase';

async function loadMermaid() {
  if (mermaidLib !== null) return mermaidLib;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
    mod.default.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
    mermaidLib = mod.default;
  } catch {
    mermaidLib = false; // offline: fall back to showing the source
  }
  return mermaidLib;
}

async function renderUML() {
  el('topbarActions').innerHTML = '';
  await initUMLStudio(el('view'), state.project, api, toast, openModal, closeModal);
}

// -------------------------------------------------------- architecture ----

let archTab = 'recommendation';
let sqlDialect = 'postgresql';

async function renderArchitecture() {
  el('topbarActions').innerHTML = `
    <div class="row">
      <div class="tab-group" id="archSubTabs">
        <button class="btn small ${archTab === 'recommendation' ? 'primary' : ''}" data-arch-tab="recommendation">🏛 Architecture recommendation</button>
        <button class="btn small ${archTab === 'schema' ? 'primary' : ''}" data-arch-tab="schema">⛁ Database schema</button>
        <button class="btn small ${archTab === 'sql' ? 'primary' : ''}" data-arch-tab="sql">⚡ SQL generation</button>
      </div>
      <button class="btn small ghost" id="refreshArchBtn" title="Regenerate from latest requirements">↻ Refresh</button>
    </div>
  `;

  let design;
  try {
    design = await api.get(`${P()}/architecture?dialect=${sqlDialect}`);
  } catch (err) {
    if (err.message === 'Generate requirements first.') {
      el('view').innerHTML = `<div class="card workflow-empty">
        <div class="big">🏛</div>
        <h3>Generate requirements first</h3>
        <p class="muted">Architecture and database recommendations are synthesized from this project's description and saved requirements.</p>
        <button class="btn primary" id="goRequirements">Open Requirements</button>
      </div>`;
      el('goRequirements').addEventListener('click', () => { state.view = 'requirements'; render(); });
      return;
    }
    throw err;
  }

  const { architecture: arch, schema, sql } = design;

  el('topbarActions').addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-arch-tab]');
    if (tabBtn) {
      archTab = tabBtn.dataset.archTab;
      render();
      return;
    }
    if (e.target.id === 'refreshArchBtn') {
      render();
      toast('Architecture & DB design refreshed.');
    }
  });

  if (archTab === 'recommendation') {
    el('view').innerHTML = `
      <div class="card arch-hero">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <span class="pill blue">Recommended Architecture Pattern</span>
          <span class="pill green">${esc(arch.primaryStyle)}</span>
        </div>
        <h2 style="font-size:22px;margin:0 0 8px">${esc(arch.pattern)}</h2>
        <p class="arch-rationale" style="margin:0;color:var(--text);line-height:1.6">${esc(arch.patternRationale)}</p>
      </div>

      <div class="grid cols-2" style="margin-top:16px">
        <div class="card">
          <div class="row" style="justify-content:space-between;margin-bottom:12px">
            <h3 style="margin:0"><span class="panel-icon blue">◇</span> Architecture topology</h3>
            <button class="btn small" id="copyArchMermaid">Copy Mermaid</button>
          </div>
          <p class="muted" style="margin:0 0 12px;font-size:13px">End-to-end container and tier communication flow synthesized for "${esc(state.project.name)}".</p>
          <div class="mermaid-box" id="archDiagram"><span class="muted">Rendering architecture diagram…</span></div>
        </div>

        <div class="card">
          <div class="panel-heading"><h3><span class="panel-icon blue">⚙</span> Recommended technology stack</h3></div>
          <p class="muted" style="margin:0 0 14px;font-size:13px">Curated for production reliability, team velocity, and project requirements.</p>
          <div class="tech-stack-list">
            ${arch.techStack.map((t) => `
              <div class="tech-stack-card">
                <div class="row" style="justify-content:space-between;margin-bottom:4px">
                  <span class="pill grey" style="font-size:11px">${esc(t.category)}</span>
                  <span class="muted" style="font-size:11.5px">Alt: ${esc(t.alternatives)}</span>
                </div>
                <strong style="font-size:14.5px;color:var(--brand)">${esc(t.technology)}</strong>
                <p style="margin:4px 0 0;font-size:12.5px;color:var(--text)">${esc(t.rationale)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="panel-heading"><h3><span class="panel-icon blue">▦</span> System architecture layers &amp; component breakdown</h3></div>
        <div class="tiers-grid">
          ${arch.tiers.map((tier) => `
            <div class="tier-item">
              <h4>${esc(tier.name)}</h4>
              <p class="tier-resp">${esc(tier.responsibilities)}</p>
              <div class="tier-components">
                ${tier.components.map((c) => `<span class="tier-component-pill">▸ ${esc(c)}</span>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="panel-heading"><h3><span class="panel-icon blue">⚖</span> Architectural trade-offs &amp; operational strategies</h3></div>
        <div class="grid cols-2" style="gap:14px;margin-top:8px">
          ${arch.tradeOffs.map((to) => `
            <div class="tradeoff-card">
              <div class="row" style="justify-content:space-between;margin-bottom:6px">
                <strong style="font-size:14px">${esc(to.area)}</strong>
                <span class="pill green">Verified Strategy</span>
              </div>
              <p style="margin:0 0 6px;font-size:13px"><strong>Strategy:</strong> ${esc(to.strategy)}</p>
              <p style="margin:0;font-size:12.5px;color:var(--muted)"><strong>Impact:</strong> ${esc(to.impact)}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    el('copyArchMermaid').addEventListener('click', () => {
      navigator.clipboard.writeText(arch.mermaidArchitecture).then(() => toast('Architecture Mermaid copied.'));
    });

    const lib = await loadMermaid();
    const box = el('archDiagram');
    if (!lib) {
      box.innerHTML = '<span class="muted">Mermaid diagram renderer requires network. You can copy the raw Mermaid source with the button above.</span>';
    } else {
      try {
        const { svg } = await lib.render(`arch_${Date.now()}`, arch.mermaidArchitecture);
        box.innerHTML = svg;
      } catch (err) {
        box.innerHTML = `<span class="muted">Diagram preview unavailable: ${esc(err.message)}</span>`;
      }
    }
  } else if (archTab === 'schema') {
    el('view').innerHTML = `
      <div class="grid cols-4 dashboard-stats">
        <div class="stat"><div class="stat-icon blue">⛁</div><div class="label">Tables / Entities</div><div class="value">${schema.stats.tablesCount}</div><div class="sub">Relational entities</div></div>
        <div class="stat"><div class="stat-icon teal">⇄</div><div class="label">Relationships</div><div class="value">${schema.stats.relationshipsCount}</div><div class="sub">Foreign-key constraints</div></div>
        <div class="stat"><div class="stat-icon violet">⬡</div><div class="label">Recommended indexes</div><div class="value">${schema.stats.indexesCount}</div><div class="sub">For query acceleration</div></div>
        <div class="stat"><div class="stat-icon green">✓</div><div class="label">Normalization</div><div class="value" style="color:var(--ok)">3NF</div><div class="sub">Third Normal Form Verified</div></div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="row" style="justify-content:space-between;margin-bottom:12px">
          <h3 style="margin:0"><span class="panel-icon blue">◇</span> Entity-Relationship Diagram (ERD)</h3>
          <button class="btn small" id="copyErMermaid">Copy ER Mermaid</button>
        </div>
        <p class="muted" style="margin:0 0 12px;font-size:13px">Synthesized relational entity model with cardinalities and primary/foreign keys.</p>
        <div class="mermaid-box" id="erDiagram"><span class="muted">Rendering ER diagram…</span></div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="panel-heading"><h3><span class="panel-icon blue">▦</span> Table specifications &amp; attribute definitions</h3></div>
        <div class="schema-tables-list">
          ${schema.entities.map((e) => `
            <div class="schema-table-box">
              <div class="row schema-table-header" style="justify-content:space-between">
                <div>
                  <strong style="font-size:16px">${esc(e.name)}</strong>
                  <code style="margin-left:8px;font-size:13px">${esc(e.table)}</code>
                </div>
                <div>
                  <span class="pill ${e.isCore ? 'blue' : 'teal'}">${e.isCore ? 'Core System' : 'Domain Entity'}</span>
                  <span class="pill grey">${e.columns.length} columns</span>
                </div>
              </div>
              <p class="muted" style="margin:4px 0 12px;font-size:13px">${esc(e.description)}</p>

              <div style="overflow-x:auto">
                <table class="schema-cols-table">
                  <thead>
                    <tr>
                      <th style="width:24%">Column</th>
                      <th style="width:18%">Data Type</th>
                      <th style="width:26%">Constraints &amp; Defaults</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${e.columns.map((c) => `
                      <tr>
                        <td>
                          <strong>${esc(c.name)}</strong>
                          ${c.pk ? '<span class="pill red small" style="margin-left:4px;font-size:10px">PK</span>' : ''}
                          ${c.fk ? `<span class="pill blue small" style="margin-left:4px;font-size:10px" title="References ${esc(c.fk)}">FK</span>` : ''}
                          ${c.unique && !c.pk ? '<span class="pill amber small" style="margin-left:4px;font-size:10px">UNIQUE</span>' : ''}
                        </td>
                        <td><code>${esc(c.type)}</code></td>
                        <td>
                          <span style="font-size:12px">
                            ${c.nullable ? '<span class="muted">NULL</span>' : '<strong>NOT NULL</strong>'}
                            ${c.default ? `<br><span class="muted">Default: <code>${esc(c.default)}</code></span>` : ''}
                            ${c.fk ? `<br><span class="muted">Refs: <code>${esc(c.fk)}</code></span>` : ''}
                          </span>
                        </td>
                        <td style="font-size:13px">${esc(c.desc)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>

              ${e.indexes?.length ? `
                <div class="row" style="margin-top:10px;font-size:12.5px">
                  <span class="muted">Indexes:</span>
                  ${e.indexes.map((idx) => `<code>${esc(idx)}</code>`).join(' ')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:16px">
        <div class="card">
          <div class="panel-heading"><h3><span class="panel-icon blue">⇄</span> Foreign key relationships</h3></div>
          <div style="overflow-x:auto">
            <table>
              <thead><tr><th>From Table</th><th>To Table</th><th>Type</th><th>On Delete</th></tr></thead>
              <tbody>
                ${schema.relationships.map((r) => `
                  <tr>
                    <td><code>${esc(r.from)}.${esc(r.fromColumn)}</code></td>
                    <td><code>${esc(r.to)}.${esc(r.toColumn)}</code></td>
                    <td><span class="pill grey">${esc(r.cardinality)}</span></td>
                    <td><span class="pill ${r.onDelete === 'CASCADE' ? 'amber' : 'grey'}">${esc(r.onDelete)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="panel-heading"><h3><span class="panel-icon blue">✓</span> Normalization analysis (3NF)</h3></div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">
            ${schema.normalizationNotes.map((n) => `
              <div style="padding:10px 12px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px">
                <div class="row" style="justify-content:space-between;margin-bottom:4px">
                  <strong>${esc(n.form)}</strong>
                  <span class="pill green">${esc(n.status)}</span>
                </div>
                <p style="margin:0;font-size:12.5px;color:var(--text)">${esc(n.details)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    el('copyErMermaid').addEventListener('click', () => {
      navigator.clipboard.writeText(schema.mermaidER).then(() => toast('ER Mermaid source copied.'));
    });

    const lib = await loadMermaid();
    const box = el('erDiagram');
    if (!lib) {
      box.innerHTML = '<span class="muted">Mermaid diagram renderer requires network. You can copy the raw Mermaid ER source above.</span>';
    } else {
      try {
        const { svg } = await lib.render(`er_${Date.now()}`, schema.mermaidER);
        box.innerHTML = svg;
      } catch (err) {
        box.innerHTML = `<span class="muted">ER diagram preview unavailable: ${esc(err.message)}</span>`;
      }
    }
  } else if (archTab === 'sql') {
    const currentSql = sql[sqlDialect] || sql.postgresql;
    const lineCount = currentSql.split('\n').length;
    const byteSize = new Blob([currentSql]).size;
    const sizeKb = (byteSize / 1024).toFixed(1);

    el('view').innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="row" style="justify-content:space-between">
          <div class="row">
            <span style="font-weight:600;font-size:14px">Target SQL Dialect:</span>
            <div class="tab-group" id="sqlDialectGroup">
              <button class="btn small ${sqlDialect === 'postgresql' ? 'primary' : ''}" data-dialect="postgresql">PostgreSQL</button>
              <button class="btn small ${sqlDialect === 'mysql' ? 'primary' : ''}" data-dialect="mysql">MySQL / MariaDB</button>
              <button class="btn small ${sqlDialect === 'sqlite' ? 'primary' : ''}" data-dialect="sqlite">SQLite 3</button>
            </div>
          </div>
          <div class="row">
            <span class="muted" style="font-size:13px">${lineCount} lines &middot; ${sizeKb} KB</span>
            <button class="btn small" id="copySqlBtn">Copy SQL</button>
            <button class="btn small primary" id="downloadSqlBtn">Download .sql</button>
          </div>
        </div>
      </div>

      <div class="card" style="padding:0;overflow:hidden">
        <div class="code-viewer-header row" style="justify-content:space-between;padding:10px 16px;background:#1e293b;color:#e2e8f0;border-bottom:1px solid #334155">
          <div class="row">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444"></span>
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f59e0b"></span>
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981"></span>
            <span style="margin-left:10px;font-family:monospace;font-size:13px;color:#94a3b8">schema-${esc(state.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}-${sqlDialect}.sql</span>
          </div>
          <span class="pill blue small" style="font-size:11px">${sqlDialect.toUpperCase()} DDL &amp; DML</span>
        </div>
        <pre class="sql-code-block" id="sqlCodeContent"><code>${esc(currentSql)}</code></pre>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="panel-heading"><h3><span class="panel-icon blue">⚡</span> SQL Features &amp; execution instructions</h3></div>
        <div class="grid cols-3" style="gap:12px;margin-top:8px">
          <div style="padding:10px 12px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px">
            <strong>DDL Table Creation</strong>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">Full <code>CREATE TABLE</code> definitions with typed columns, primary keys, and nullability.</p>
          </div>
          <div style="padding:10px 12px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px">
            <strong>Referential Integrity</strong>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">Foreign key constraints with <code>ON DELETE CASCADE</code> / <code>SET NULL</code> rules.</p>
          </div>
          <div style="padding:10px 12px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px">
            <strong>Seed Data &amp; Verification</strong>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">Pre-seeded sample records and analytical JOIN queries to verify the schema immediately.</p>
          </div>
        </div>
      </div>
    `;

    el('sqlDialectGroup').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dialect]');
      if (btn) {
        sqlDialect = btn.dataset.dialect;
        render();
      }
    });

    el('copySqlBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(currentSql).then(() => toast('SQL script copied to clipboard.'));
    });

    el('downloadSqlBtn').addEventListener('click', () => {
      const slug = state.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
      const filename = `schema-${slug}-${sqlDialect}.sql`;
      const blob = new Blob([currentSql], { type: 'text/sql' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Downloaded ${filename}`);
    });
  }
}

// -------------------------------------------------------------- board -----

async function renderBoard() {
  const [tasks, { requirements }] = await Promise.all([
    api.get(`${P()}/tasks`),
    api.get(`${P()}/requirements`),
  ]);

  const sprints = state.project.sprints || [];
  const selectedSprint = state.boardSprintId === 'all' ? null : Number(state.boardSprintId);
  const visibleTasks = selectedSprint ? tasks.filter((t) => t.sprint_id === selectedSprint) : tasks;
  el('topbarActions').innerHTML = `
    <label class="muted" for="boardSprint" style="font-size:13px">Sprint</label>
    <select id="boardSprint" style="width:auto;padding:7px 10px">
      <option value="all">All sprints / backlog</option>
      ${sprints.map((s) => `<option value="${s.id}" ${String(s.id) === String(state.boardSprintId) ? 'selected' : ''}>${esc(s.name)}${s.status === 'completed' ? ' (completed)' : ''}</option>`).join('')}
    </select>
    <button class="btn" id="newSprintBtn">+ New sprint</button>
    <span class="muted" style="font-size:13.5px">${visibleTasks.filter((t) => t.status === 'done').length} of ${visibleTasks.length} done</span>
    <button class="btn primary" id="newTaskBtn">+ New task</button>`;

  el('view').innerHTML = `<div class="board">
    ${Object.entries(STATUS_LABEL).map(([status, label]) => {
      const column = visibleTasks.filter((t) => t.status === status);
      return `<div class="col" data-status="${status}">
        <header><span>${label}</span><span class="pill grey">${column.length}</span></header>
        ${column.map((t) => `
          <div class="task" draggable="true" data-id="${t.id}">
            <h5>${esc(t.title)}</h5>
            <div class="meta">
              <span>${t.requirement_code ? `<span class="pill blue">${esc(t.requirement_code)}</span>` : '<span class="pill grey">untraced</span>'}</span>
              <span>${t.points} pts</span>
            </div>
            <div class="meta" style="margin-top:6px">
              <span>${esc(t.assignee_name || 'Unassigned')}</span>
              <button class="btn ghost small danger" data-del-task="${t.id}">✕</button>
            </div>
            ${t.dependencies.length ? `<div style="margin-top:8px;font-size:11.5px">
              <span class="pill ${t.dependencies.some((d) => d.status !== 'done') ? 'red' : 'green'}">
                ${t.dependencies.some((d) => d.status !== 'done') ? 'Blocked by' : 'Depends on'} ${t.dependencies.length}
              </span>
              <div class="muted" style="margin-top:4px">${t.dependencies.map((d) => esc(d.title)).join(', ')}</div>
            </div>` : ''}
          </div>`).join('')}
      </div>`;
    }).join('')}
  </div>`;

  // Drag and drop between columns.
  let dragged = null;
  el('view').querySelectorAll('.task').forEach((card) => {
    card.addEventListener('dragstart', () => { dragged = card; card.classList.add('dragging'); });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); dragged = null; });
  });

  el('view').querySelectorAll('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drop');
      if (!dragged) return;
      await api.patch(`${P()}/tasks/${dragged.dataset.id}`, { status: col.dataset.status });
      toast(`Moved to ${STATUS_LABEL[col.dataset.status]}.`);
      render();
    });
  });

  el('view').addEventListener('click', async (e) => {
    const id = e.target.dataset?.delTask;
    if (!id) return;
    await api.del(`${P()}/tasks/${id}`);
    toast('Task deleted.');
    render();
  });

  el('boardSprint').addEventListener('change', (e) => {
    state.boardSprintId = e.target.value;
    render();
  });

  el('newSprintBtn').addEventListener('click', () => {
    openModal('New sprint', `
      <div class="field"><label for="sprintName">Sprint name</label><input id="sprintName" placeholder="Sprint 4 - Delivery"></div>
      <p class="error hidden" id="sprintError"></p>
      <button class="btn primary block" id="sprintSave">Create sprint</button>
    `, () => {
      el('sprintName').focus();
      el('sprintSave').addEventListener('click', async () => {
        try {
          const created = await api.post(`${P()}/sprints`, { name: el('sprintName').value });
          state.project.sprints = created;
          state.boardSprintId = created[created.length - 1]?.id || 'all';
          closeModal();
          toast('Sprint created.');
          render();
        } catch (err) {
          el('sprintError').textContent = err.message;
          el('sprintError').classList.remove('hidden');
        }
      });
    });
  });

  el('newTaskBtn').addEventListener('click', () => {
    openModal('New task', `
      <div class="field"><label for="tTitle">Title</label><input id="tTitle" placeholder="Build the document upload endpoint"></div>
      <div class="field"><label for="tDesc">Description</label><textarea id="tDesc" rows="3"></textarea></div>
      <div class="row">
        <div class="field grow"><label for="tReq">Traces to requirement</label>
          <select id="tReq"><option value="">None</option>
            ${requirements.map((r) => `<option value="${r.id}">${esc(r.code)} — ${esc(r.title)}</option>`).join('')}
          </select></div>
      </div>
      <div class="row">
        <div class="field grow"><label for="tAssignee">Assignee</label>
          <select id="tAssignee"><option value="">Unassigned</option>
            ${(state.project.members || []).map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
          </select></div>
        <div class="field grow"><label for="tPoints">Story points</label>
          <select id="tPoints">${[1, 2, 3, 5, 8, 13].map((p) => `<option ${p === 3 ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div class="field grow"><label for="tStatus">Column</label>
          <select id="tStatus">${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="tDependencies">Dependencies <span class="muted">(tasks that must be completed first)</span></label>
        <select id="tDependencies" multiple size="4">
          ${tasks.map((task) => `<option value="${task.id}">${esc(task.title)}</option>`).join('')}
        </select>
      </div>
      <p class="error hidden" id="tError"></p>
      <button class="btn primary block" id="tSave">Create task</button>
    `, () => {
      el('tTitle').focus();
      el('tSave').addEventListener('click', async () => {
        try {
          await api.post(`${P()}/tasks`, {
            title: el('tTitle').value,
            description: el('tDesc').value,
            requirement_id: el('tReq').value || null,
            assignee_id: el('tAssignee').value || null,
            points: Number(el('tPoints').value),
            status: el('tStatus').value,
            sprint_id: selectedSprint || state.project.sprints?.[0]?.id || null,
            dependencies: [...el('tDependencies').selectedOptions].map((option) => Number(option.value)),
          });
          closeModal();
          toast('Task created.');
          render();
        } catch (err) {
          el('tError').textContent = err.message;
          el('tError').classList.remove('hidden');
        }
      });
    });
  });
}

// --------------------------------------------------------------- bugs -----

async function renderBugs() {
  const [bugs, tasks] = await Promise.all([api.get(`${P()}/bugs`), api.get(`${P()}/tasks`)]);
  el('topbarActions').innerHTML = '<button class="btn primary" id="newBugBtn">+ Report a bug</button>';

  el('view').innerHTML = `
    <div class="grid cols-4" style="margin-bottom:16px">
      ${['critical', 'high', 'medium', 'low'].map((s) => `
        <div class="stat"><div class="label">${s}</div>
          <div class="value" style="color:${s === 'critical' || s === 'high' ? 'var(--bad)' : s === 'medium' ? 'var(--warn)' : 'var(--muted)'}">
            ${bugs.filter((b) => b.severity === s && b.status !== 'resolved').length}</div>
          <div class="sub">open</div></div>`).join('')}
    </div>
    <div class="card">
      ${bugs.length ? `<table>
        <thead><tr><th>Severity</th><th>Title</th><th>Linked task</th><th>Status</th><th></th></tr></thead>
        <tbody>${bugs.map((b) => `
          <tr>
            <td><span class="pill ${SEVERITY_PILL[b.severity]}">${esc(b.severity)}</span></td>
            <td><strong>${esc(b.title)}</strong>${b.detail ? `<div class="muted" style="font-size:13px">${esc(b.detail)}</div>` : ''}</td>
            <td class="muted">${esc(b.task_title || '—')}</td>
            <td><select data-bug="${b.id}" style="width:auto;padding:5px 8px;font-size:13px">
              ${Object.entries(BUG_STATUS_LABEL).map(([s, label]) => `<option value="${s}" ${b.status === s ? 'selected' : ''}>${label}</option>`).join('')}
            </select></td>
            <td><button class="btn ghost small danger" data-del-bug="${b.id}">Delete</button></td>
          </tr>`).join('')}</tbody></table>`
        : emptyState('⬤', 'No defects reported. Nice.')}
    </div>`;

  el('view').addEventListener('change', async (e) => {
    const id = e.target.dataset?.bug;
    if (!id) return;
    await api.patch(`${P()}/bugs/${id}`, { status: e.target.value });
    toast('Bug status updated.');
    render();
  });
  el('view').addEventListener('click', async (e) => {
    const id = e.target.dataset?.delBug;
    if (!id) return;
    await api.del(`${P()}/bugs/${id}`);
    toast('Bug deleted.');
    render();
  });

  el('newBugBtn').addEventListener('click', () => {
    openModal('Report a bug', `
      <div class="field"><label for="bTitle">Title</label><input id="bTitle" placeholder="Upload fails for files over 10 MB"></div>
      <div class="field"><label for="bDetail">Steps to reproduce</label><textarea id="bDetail" rows="4"></textarea></div>
      <div class="row">
        <div class="field grow"><label for="bSeverity">Severity</label>
          <select id="bSeverity">${['critical', 'high', 'medium', 'low'].map((s) => `<option ${s === 'medium' ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field grow"><label for="bTask">Linked task</label>
          <select id="bTask"><option value="">None</option>${tasks.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select></div>
      </div>
      <p class="error hidden" id="bError"></p>
      <button class="btn primary block" id="bSave">Report bug</button>
    `, () => {
      el('bTitle').focus();
      el('bSave').addEventListener('click', async () => {
        try {
          const out = await api.post(`${P()}/bugs`, {
            title: el('bTitle').value,
            detail: el('bDetail').value,
            severity: el('bSeverity').value,
            task_id: el('bTask').value || null,
          });
          closeModal();
          toast(out.duplicateOf ? `Reported. Possible duplicate of "${out.duplicateOf}".` : 'Bug reported.');
          render();
        } catch (err) {
          el('bError').textContent = err.message;
          el('bError').classList.remove('hidden');
        }
      });
    });
  });
}

// ------------------------------------------------------- traceability -----

async function renderTrace() {
  const t = await api.get(`${P()}/traceability`);

  el('view').innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <h3>End-to-end delivery chain</h3>
      <div class="trace-chain">
        ${['Requirement', 'Story', 'Sprint', 'Task', 'Commit', 'PR', 'Test', 'Bug', 'Deployment'].map((label, index) => `
          <span class="trace-chain-step"><b>${index + 1}</b>${label}</span>${index < 8 ? '<span class="trace-chain-arrow">→</span>' : ''}
        `).join('')}
      </div>
    </div>
    <div class="grid cols-3" style="margin-bottom:16px">
      <div class="stat"><div class="label">Requirements covered</div><div class="value">${t.covered}/${t.total}</div>
        <div class="sub">have at least one task</div>${meter(t.coveragePercent)}</div>
      <div class="stat"><div class="label">Coverage</div><div class="value">${t.coveragePercent}%</div><div class="sub">requirement to task</div></div>
      <div class="stat"><div class="label">Untraced tasks</div>
        <div class="value" style="color:${t.orphanTasks.length ? 'var(--warn)' : 'var(--ok)'}">${t.orphanTasks.length}</div>
        <div class="sub">not linked to a requirement</div></div>
    </div>

    ${t.chain.length ? t.chain.map((c) => `
      <div class="trace-row">
        <div class="trace-col">
          <h5>Requirement</h5>
          <div class="trace-item">
            <div class="row" style="justify-content:space-between">
              <span class="code" style="color:var(--brand-2);font-weight:700">${esc(c.requirement.code)}</span>
              <span class="pill ${PRIORITY_PILL[c.requirement.priority]}">${esc(c.requirement.priority)}</span>
            </div>
            <div style="margin-top:5px">${esc(c.requirement.title)}</div>
          </div>
          <div class="story" style="margin:8px 0 0;font-size:12.5px">${esc(c.story)}</div>
        </div>
        <div class="trace-col">
          <h5>Story → Sprint → Task (${c.tasks.length})</h5>
          ${c.tasks.length ? c.tasks.map((task) => `
            <div class="trace-item">
              <div class="muted" style="font-size:12px">${esc(c.story || 'Story not written')}</div>
              <div>${esc(task.title)}</div>
              <div class="row" style="justify-content:space-between;margin-top:5px">
                <span class="pill ${task.status === 'done' ? 'green' : task.status === 'in_progress' ? 'blue' : 'grey'}">${STATUS_LABEL[task.status]}</span>
                <span class="muted" style="font-size:12px">${esc(task.sprint || 'Backlog')} · ${esc(task.assignee || 'Unassigned')} · ${task.points} pts</span>
              </div>
              <div class="trace-evidence">
                <span class="pill ${task.commits.length ? 'green' : 'grey'}">Commit ${task.commits.length || '—'}</span>
                <span class="pill ${task.pullRequests.length ? 'green' : 'grey'}">PR ${task.pullRequests.length || '—'}</span>
                <span class="pill ${task.tests.length ? 'green' : 'grey'}">Test ${task.tests.length || '—'}</span>
                <span class="pill ${c.bugs.length ? 'red' : 'grey'}">Bug ${c.bugs.length || '—'}</span>
                <span class="pill ${task.deployments.length ? 'green' : 'grey'}">Deploy ${task.deployments.length || '—'}</span>
              </div>
            </div>`).join('') + meter(c.coverage)
            : '<div class="issues">No task implements this requirement yet.</div>'}
        </div>
        <div class="trace-col">
          <h5>Defects (${c.bugs.length})</h5>
          ${c.bugs.length ? c.bugs.map((b) => `
            <div class="trace-item">
              <span class="pill ${SEVERITY_PILL[b.severity]}">${esc(b.severity)}</span>
              <div style="margin-top:5px">${esc(b.title)}</div>
            </div>`).join('')
            : '<div class="trace-item muted">None reported.</div>'}
        </div>
      </div>`).join('')
    : emptyState('⇄', 'Add requirements and link tasks to them to build the traceability matrix.')}

    ${t.orphanTasks.length ? `<div class="card">
      <h3>Tasks not traced to a requirement</h3>
      ${t.orphanTasks.map((task) => `<div class="trace-item">${esc(task.title)} <span class="pill grey">${STATUS_LABEL[task.status]}</span></div>`).join('')}
    </div>` : ''}`;
}

// -------------------------------------------------------- code review -----

async function renderReview() {
  el('view').innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <h3>Submit code for review</h3>
        <div class="field"><label for="cvName">File name</label><input id="cvName" value="auth.js"></div>
        <div class="field">
          <label for="cvCode">Source</label>
          <textarea id="cvCode" rows="16" spellcheck="false" style="font-family:ui-monospace,Consolas,monospace;font-size:13px"></textarea>
        </div>
        <button class="btn primary block" id="cvRun">Review code</button>
      </div>
      <div class="card" id="cvResult">
        ${emptyState('⌘', 'Paste a snippet and run the review to see smells, security issues and complexity.')}
      </div>
    </div>`;

  el('cvCode').value = `function login(req, res) {
  var token = "sk-live-9f8a7b6c5d4e";
  if (req.body.role == "admin") {
    db.query("SELECT * FROM users WHERE email = '" + req.body.email + "'");
  }
  try {
    save(req.body);
  } catch (e) {}
  console.log("login attempt", req.body);
  document.getElementById("out").innerHTML = req.body.name;
}`;

  el('cvRun').addEventListener('click', async () => {
    const button = el('cvRun');
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> Reviewing…';
    try {
      const r = await api.post(`${P()}/review`, { code: el('cvCode').value, filename: el('cvName').value });
      const gradeColour = r.score >= 75 ? 'var(--ok)' : r.score >= 50 ? 'var(--warn)' : 'var(--bad)';
      el('cvResult').innerHTML = `
        <div class="row" style="justify-content:space-between;margin-bottom:14px">
          <h3 style="margin:0">${esc(r.filename)}</h3>
          <div style="text-align:right">
            <div style="font-size:30px;font-weight:700;line-height:1;color:${gradeColour}">${r.grade}</div>
            <div class="muted" style="font-size:12.5px">${r.score}/100</div>
          </div>
        </div>
        ${meter(r.score)}
        <div class="grid cols-4" style="margin:14px 0">
          ${[['Lines', r.metrics.lines], ['Functions', r.metrics.functions],
             ['Complexity', r.metrics.complexity], ['Max depth', r.metrics.maxDepth]].map(([k, v]) => `
            <div><div class="label muted" style="font-size:11px;text-transform:uppercase">${k}</div><strong style="font-size:19px">${v}</strong></div>`).join('')}
        </div>
        <h3>${r.findings.length} finding${r.findings.length === 1 ? '' : 's'}</h3>
        ${r.findings.length ? r.findings.map((f) => `
          <div class="finding ${f.severity}">
            <div class="row" style="justify-content:space-between">
              <span class="pill ${SEVERITY_PILL[f.severity]}">${esc(f.severity)}</span>
              <span class="muted" style="font-size:12.5px">${f.line ? `line ${f.line}` : 'file level'}</span>
            </div>
            <div style="margin-top:6px">${esc(f.message)}</div>
            ${f.code ? `<pre class="code" style="margin-top:7px">${esc(f.code)}</pre>` : ''}
            <div class="fix">→ ${esc(f.suggestion)}</div>
          </div>`).join('')
        : '<p class="muted">No issues found in this snippet.</p>'}`;
    } catch (err) {
      el('cvResult').innerHTML = `<p class="error">${esc(err.message)}</p>`;
    } finally {
      button.disabled = false;
      button.textContent = 'Review code';
    }
  });
}

// ------------------------------------------------------------ github ------

let ghTab = 'repos';
let ghBranch = '';
let ghCommitSearch = '';
let ghPRState = 'all';
let ghIssueState = 'all';

function timeAgo(dateInput) {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${Math.max(1, secs)}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

const LANG_COLORS = {
  JavaScript: '#f1e05a',
  CSS: '#563d7c',
  HTML: '#e34c26',
  Shell: '#89e051',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
};

async function renderGitHub() {
  const [repo, config, userRepos] = await Promise.all([
    api.get(`${P()}/github/repo`),
    api.get(`${P()}/github/config`),
    api.get(`${P()}/github/user-repos`).catch(() => []),
  ]);

  if (!config.isConfigured) {
    renderGHUnconfigured(config, userRepos);
    return;
  }

  if (!ghBranch) ghBranch = repo.default_branch || 'main';

  el('topbarActions').innerHTML = `
    <button class="btn ghost small" id="ghRefreshBtn" title="Refresh GitHub data">↻ Refresh</button>
    <button class="btn ghost small" id="ghSwitchBtn" title="Switch to another repository">⇄ Switch Repo</button>
    <button class="btn primary small" id="ghConfigBtn">⚙ Configure</button>
  `;

  el('view').innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="gh-repo-header">
        <div>
          <div class="gh-repo-title">
            <span style="font-size:24px">⌘</span>
            <a href="${esc(repo.html_url)}" target="_blank" rel="noopener">${esc(repo.full_name || config.activeSlug)}</a>
            <span class="pill ${repo.private ? 'amber' : 'green'}">${repo.private ? 'Private' : 'Public'}</span>
            <span class="pill blue">${repo.isLive ? 'Live API' : 'Cached / Fallback'}</span>
            ${config.userGithubUsername ? `<span class="pill grey" title="User GitHub Profile">@${esc(config.userGithubUsername)}</span>` : ''}
          </div>
          <p class="muted" style="margin:6px 0 0;font-size:13.5px">${esc(repo.description || 'No repository description.')}</p>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn ghost small" id="ghChangeRepoQuickBtn">Change Project Repo</button>
          <a class="btn small" href="${esc(repo.html_url)}" target="_blank" rel="noopener">↗ Open GitHub</a>
        </div>
      </div>

      <div class="gh-stat-bar">
        <div class="gh-stat-chip"><span>Stars</span><strong>${repo.stargazers_count || 0}</strong></div>
        <div class="gh-stat-chip"><span>Forks</span><strong>${repo.forks_count || 0}</strong></div>
        <div class="gh-stat-chip"><span>Watchers</span><strong>${repo.watchers_count || 0}</strong></div>
        <div class="gh-stat-chip"><span>Default Branch</span><strong>${esc(repo.default_branch || 'main')}</strong></div>
        <div class="gh-stat-chip"><span>Open PRs</span><strong>${repo.open_prs_count || 1}</strong></div>
        <div class="gh-stat-chip"><span>Open Issues</span><strong>${repo.open_issues_count || 0}</strong></div>
      </div>

      <div class="gh-subnav" id="ghSubNav">
        <button class="gh-tab ${ghTab === 'repos' ? 'active' : ''}" data-tab="repos">◫ Repositories</button>
        <button class="gh-tab ${ghTab === 'commits' ? 'active' : ''}" data-tab="commits">⌥ Commits</button>
        <button class="gh-tab ${ghTab === 'pulls' ? 'active' : ''}" data-tab="pulls">⑂ Pull Requests <span class="gh-tab-badge">${repo.open_prs_count || 1}</span></button>
        <button class="gh-tab ${ghTab === 'issues' ? 'active' : ''}" data-tab="issues">⬤ Issues <span class="gh-tab-badge">${repo.open_issues_count || 4}</span></button>
        <button class="gh-tab ${ghTab === 'actions' ? 'active' : ''}" data-tab="actions">⚡ GitHub Actions</button>
      </div>

      <div id="ghTabContent">
        <div class="empty"><span class="spinner"></span></div>
      </div>
    </div>
  `;

  // Bind topbar actions
  el('ghRefreshBtn')?.addEventListener('click', () => renderGitHub());
  el('ghSwitchBtn')?.addEventListener('click', () => openGHConfigModal(config, userRepos));
  el('ghChangeRepoQuickBtn')?.addEventListener('click', () => openGHConfigModal(config, userRepos));
  el('ghConfigBtn')?.addEventListener('click', () => openGHConfigModal(config, userRepos));

  // Bind subnav tabs
  el('ghSubNav')?.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (!tabBtn) return;
    ghTab = tabBtn.dataset.tab;
    document.querySelectorAll('.gh-tab').forEach((t) => t.classList.toggle('active', t === tabBtn));
    renderGHTabContent(repo, config, userRepos);
  });

  await renderGHTabContent(repo, config, userRepos);
}

function renderGHUnconfigured(config, userRepos) {
  el('topbarActions').innerHTML = `
    <button class="btn ghost small" id="ghUnconfProfileBtn">Profile &amp; GitHub Account</button>
  `;

  el('view').innerHTML = `
    <div class="card" style="margin-bottom:16px;padding:32px 24px">
      <div style="max-width:760px;margin:0 auto;text-align:center">
        <div style="font-size:44px;line-height:1;margin-bottom:14px">⌥</div>
        <h2 style="margin:0 0 8px">Connect GitHub to "${esc(state.project.name)}"</h2>
        <p class="muted" style="font-size:14px;line-height:1.5;margin:0 0 20px">
          In EngineerOS, each project connects to its own appropriate GitHub repository.
          Select a repository from your profile below, or enter any public/private repository.
        </p>

        <div style="display:inline-flex;align-items:center;gap:10px;background:var(--bg-2);border:1px solid var(--line);border-radius:24px;padding:6px 16px;margin-bottom:24px;font-size:13px">
          <span>GitHub Profile: <strong>@${esc(config.userGithubUsername || 'None linked')}</strong></span>
          <button class="btn ghost small" id="ghLinkProfileBtn" style="padding:2px 8px;font-size:11px">
            ${config.userGithubUsername ? 'Change Profile' : '+ Link GitHub Username'}
          </button>
        </div>

        ${userRepos && userRepos.length ? `
          <div style="text-align:left;margin-bottom:28px">
            <div class="panel-heading" style="margin-bottom:10px">
              <h4 style="margin:0">Repositories in your profile (@${esc(config.userGithubUsername)}):</h4>
              <span class="muted" style="font-size:12px">${userRepos.length} available</span>
            </div>
            <div class="gh-user-repos-grid">
              ${userRepos.map((r) => `
                <div class="gh-user-repo-card">
                  <div style="min-width:0;flex:1">
                    <div class="row" style="gap:6px;align-items:center">
                      <strong style="font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.full_name)}</strong>
                      <span class="pill ${r.private ? 'amber' : 'green'}" style="font-size:9.5px">${r.private ? 'Private' : 'Public'}</span>
                    </div>
                    <p class="muted" style="margin:4px 0 0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.description || 'No description.')}</p>
                  </div>
                  <button class="btn primary small" data-pick-repo="${esc(r.full_name)}">Connect</button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="card" style="text-align:left;background:var(--bg-2);border:1px solid var(--line);margin:0;padding:20px">
          <h4 style="margin:0 0 6px">Or enter repository manually:</h4>
          <p class="muted" style="margin:0 0 14px;font-size:13px">Enter the GitHub owner and repository name for this specific project.</p>
          <div class="field">
            <label for="unconfRepoInput">Repository (owner/repo)</label>
            <input id="unconfRepoInput" value="${esc(config.suggestedRepo || '')}" placeholder="e.g. ${esc(config.suggestedRepo || 'owner/repo')}">
          </div>
          <div class="field">
            <label for="unconfTokenInput">Personal Access Token (PAT) <span class="muted">(optional for private repos)</span></label>
            <input id="unconfTokenInput" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" autocomplete="new-password">
          </div>
          <p class="error hidden" id="unconfError"></p>
          <button class="btn primary block" id="unconfSave">Connect &amp; Open GitHub</button>
        </div>
      </div>
    </div>
  `;

  el('ghUnconfProfileBtn')?.addEventListener('click', openProfileModal);
  el('ghLinkProfileBtn')?.addEventListener('click', openProfileModal);

  el('view').querySelectorAll('[data-pick-repo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.post(`${P()}/github/config`, { repo: btn.dataset.pickRepo });
        toast(`Connected to "${btn.dataset.pickRepo}"!`);
        renderGitHub();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  el('unconfSave')?.addEventListener('click', async () => {
    const repoVal = el('unconfRepoInput').value.trim();
    const tokenVal = el('unconfTokenInput').value.trim();
    if (!repoVal) {
      el('unconfError').textContent = 'Please enter a repository in "owner/repo" format.';
      el('unconfError').classList.remove('hidden');
      return;
    }
    try {
      await api.post(`${P()}/github/config`, { repo: repoVal, token: tokenVal });
      toast(`Connected to "${repoVal}"!`);
      renderGitHub();
    } catch (err) {
      el('unconfError').textContent = err.message;
      el('unconfError').classList.remove('hidden');
    }
  });
}

async function renderGHTabContent(repo, config, userRepos = []) {
  const container = el('ghTabContent');
  if (!container) return;
  container.innerHTML = '<div class="empty"><span class="spinner"></span></div>';

  try {
    if (ghTab === 'repos') {
      await renderGHReposTab(container, repo, config, userRepos);
    } else if (ghTab === 'commits') {
      await renderGHCommitsTab(container, repo);
    } else if (ghTab === 'pulls') {
      await renderGHPullsTab(container, repo);
    } else if (ghTab === 'issues') {
      await renderGHIssuesTab(container, repo);
    } else if (ghTab === 'actions') {
      await renderGHActionsTab(container, repo);
    }
  } catch (err) {
    container.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

// --------------------------------------------------- sub-tab: repositories -
async function renderGHReposTab(container, repo, config, userRepos = []) {
  const branches = await api.get(`${P()}/github/branches`).catch(() => []);
  const langs = repo.languages || { JavaScript: 100 };
  const totalPercent = Object.values(langs).reduce((s, v) => s + v, 0) || 1;

  container.innerHTML = `
    <div class="grid cols-2" style="align-items:start">
      <div class="card" style="margin-top:0">
        <h3>Repository Information</h3>
        <table><tbody>
          <tr><th style="width:130px">Repository</th><td><strong>${esc(repo.full_name)}</strong></td></tr>
          <tr><th>Description</th><td>${esc(repo.description || '—')}</td></tr>
          <tr><th>Visibility</th><td><span class="pill ${repo.private ? 'amber' : 'green'}">${repo.private ? 'Private' : 'Public'}</span></td></tr>
          <tr><th>Default Branch</th><td><code>${esc(repo.default_branch || 'main')}</code></td></tr>
          <tr><th>License</th><td>${esc(repo.license?.name || 'MIT License')}</td></tr>
          <tr><th>Last Updated</th><td>${esc(timeAgo(repo.updated_at))} (${esc(repo.updated_at ? new Date(repo.updated_at).toLocaleString() : '—')})</td></tr>
        </tbody></table>

        <h3 style="margin-top:18px">Language Distribution</h3>
        <div class="gh-lang-bar">
          ${Object.entries(langs).map(([lang, pct]) => `
            <i style="width:${(pct / totalPercent) * 100}%;background:${LANG_COLORS[lang] || '#888'}" title="${esc(lang)}: ${pct}%"></i>
          `).join('')}
        </div>
        <div class="gh-lang-legend">
          ${Object.entries(langs).map(([lang, pct]) => `
            <span><i class="gh-lang-dot" style="background:${LANG_COLORS[lang] || '#888'}"></i><strong>${esc(lang)}</strong> <span class="muted">${pct}%</span></span>
          `).join('')}
        </div>

        <h3 style="margin-top:18px">Clone Repository</h3>
        <div style="display:grid;gap:8px">
          <div>
            <div class="muted" style="font-size:11.5px;margin-bottom:4px;font-weight:600">HTTPS</div>
            <div class="gh-clone-row">
              <code>git clone ${esc(repo.clone_url || `https://github.com/${repo.full_name}.git`)}</code>
              <button class="btn ghost small" data-copy="git clone ${esc(repo.clone_url || `https://github.com/${repo.full_name}.git`)}">Copy</button>
            </div>
          </div>
          <div>
            <div class="muted" style="font-size:11.5px;margin-bottom:4px;font-weight:600">SSH</div>
            <div class="gh-clone-row">
              <code>git clone ${esc(repo.ssh_url || `git@github.com:${repo.full_name}.git`)}</code>
              <button class="btn ghost small" data-copy="git clone ${esc(repo.ssh_url || `git@github.com:${repo.full_name}.git`)}">Copy</button>
            </div>
          </div>
        </div>

        ${repo.topics && repo.topics.length ? `
          <h3 style="margin-top:18px">Topics</h3>
          <div class="row">${repo.topics.map((t) => `<span class="pill blue">${esc(t)}</span>`).join('')}</div>
        ` : ''}
      </div>

      <div class="card" style="margin-top:0">
        <div class="panel-heading">
          <h3>Branches (${branches.length})</h3>
          <span class="muted" style="font-size:12px">Default: ${esc(repo.default_branch || 'main')}</span>
        </div>
        <table>
          <thead><tr><th>Branch</th><th>Latest Commit</th><th></th></tr></thead>
          <tbody>${branches.map((b) => `
            <tr>
              <td>
                <strong>${esc(b.name)}</strong>
                ${b.name === repo.default_branch ? '<span class="pill green" style="margin-left:6px;font-size:9px">default</span>' : ''}
                ${b.protected ? '<span class="pill amber" style="margin-left:4px;font-size:9px">protected</span>' : ''}
              </td>
              <td>
                <span class="gh-sha" data-copy="${esc(b.commit?.sha || '')}">${esc((b.commit?.sha || '').slice(0, 7) || 'latest')}</span>
              </td>
              <td style="text-align:right">
                <button class="btn ghost small" data-select-branch="${esc(b.name)}">View Commits →</button>
              </td>
            </tr>
          `).join('')}</tbody>
        </table>

        <div style="margin-top:22px;padding-top:16px;border-top:1px solid var(--line)">
          <h3>Integration Settings</h3>
          <p class="muted" style="font-size:13px">Connected repository: <strong>${esc(config.repo || config.activeSlug)}</strong></p>
          <p class="muted" style="font-size:13px">Personal access token: <strong>${config.hasToken ? 'Configured (Private repo & write enabled)' : 'None (Using public API / fallback)'}</strong></p>
          <div class="row" style="gap:8px;margin-top:10px">
            <button class="btn small primary" id="ghReposConfigBtn">Change Repository / Token</button>
            <button class="btn small ghost" id="ghReposProfileBtn">Manage Profile &amp; PAT</button>
          </div>
        </div>
      </div>
    </div>

    ${userRepos && userRepos.length ? `
      <div class="card" style="margin-top:16px">
        <div class="panel-heading" style="margin-bottom:12px">
          <div>
            <h3 style="margin:0">Repositories in your GitHub Profile (@${esc(config.userGithubUsername || 'you')})</h3>
            <p class="muted" style="margin:4px 0 0;font-size:12.5px">Have multiple projects? Easily switch this project to another repository under your profile, or connect your other projects.</p>
          </div>
          <button class="btn ghost small" id="ghProfileManageBtn">Manage Profile</button>
        </div>
        <div class="gh-user-repos-grid">
          ${userRepos.map((r) => {
            const isActive = r.full_name === config.activeSlug || r.full_name === repo.full_name || r.full_name === config.repo;
            return `
              <div class="gh-user-repo-card ${isActive ? 'active' : ''}">
                <div style="min-width:0;flex:1">
                  <div class="row" style="gap:6px;align-items:center">
                    <strong style="font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.full_name)}</strong>
                    <span class="pill ${r.private ? 'amber' : 'green'}" style="font-size:9.5px">${r.private ? 'Private' : 'Public'}</span>
                    ${isActive ? '<span class="pill blue" style="font-size:9.5px">Current</span>' : ''}
                  </div>
                  <p class="muted" style="margin:4px 0 0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.description || 'No description.')}</p>
                </div>
                ${isActive ? `
                  <span class="muted" style="font-size:12px">Active</span>
                ` : `
                  <button class="btn ghost small" data-switch-repo="${esc(r.full_name)}">Switch to this</button>
                `}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}
  `;

  container.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy);
      toast('Copied to clipboard!');
    });
  });

  container.querySelectorAll('[data-select-branch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ghBranch = btn.dataset.selectBranch;
      ghTab = 'commits';
      document.querySelectorAll('.gh-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'commits'));
      renderGHTabContent(repo, config, userRepos);
    });
  });

  container.querySelectorAll('[data-switch-repo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.post(`${P()}/github/config`, { repo: btn.dataset.switchRepo });
        toast(`Switched repository to "${btn.dataset.switchRepo}"!`);
        renderGitHub();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  container.querySelector('#ghReposConfigBtn')?.addEventListener('click', () => openGHConfigModal(config, userRepos));
  container.querySelector('#ghReposProfileBtn')?.addEventListener('click', openProfileModal);
  container.querySelector('#ghProfileManageBtn')?.addEventListener('click', openProfileModal);
}

// ------------------------------------------------------- sub-tab: commits -
async function renderGHCommitsTab(container, repo) {
  const branches = await api.get(`${P()}/github/branches`).catch(() => []);
  const branchParam = ghBranch ? `?branch=${encodeURIComponent(ghBranch)}` : '';
  const searchParam = ghCommitSearch ? `&q=${encodeURIComponent(ghCommitSearch)}` : '';
  const commits = await api.get(`${P()}/github/commits${branchParam}${searchParam}`).catch(() => []);

  container.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:16px;gap:12px">
      <div class="row" style="gap:10px;flex:1">
        <div style="width:200px">
          <select id="ghBranchSelect">
            ${branches.map((b) => `<option value="${esc(b.name)}" ${b.name === ghBranch ? 'selected' : ''}>⌥ ${esc(b.name)}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1;max-width:320px">
          <input id="ghCommitSearch" placeholder="Search commit message, author, or SHA…" value="${esc(ghCommitSearch)}">
        </div>
        ${ghCommitSearch ? '<button class="btn ghost small" id="ghClearSearch">Clear</button>' : ''}
      </div>
      <div class="muted" style="font-size:13px;align-self:center">${commits.length} commit${commits.length === 1 ? '' : 's'} found</div>
    </div>

    <div class="gh-commits-list">
      ${commits.length ? commits.map((c) => {
        const shortSha = (c.sha || '').slice(0, 7);
        const msgLines = (c.commit?.message || '').split('\n');
        const headline = msgLines[0];
        const body = msgLines.slice(1).join('\n').trim();
        const authorName = c.author?.login || c.commit?.author?.name || 'Developer';
        const avatarUrl = c.author?.avatar_url || '';

        return `
          <div class="gh-item">
            <div class="gh-item-main">
              <div class="gh-item-title">
                ${avatarUrl ? `<img class="gh-avatar" src="${esc(avatarUrl)}" alt="${esc(authorName)}">`
                  : `<span class="avatar" style="width:22px;height:22px;font-size:11px">${esc(authorName.charAt(0).toUpperCase())}</span>`}
                <span>${esc(headline)}</span>
                ${c.links && c.links.length ? c.links.map((l) => `
                  <span class="pill blue" title="Linked to SDLC ${esc(l.target_type)}">
                    🔗 ${esc(l.task_title ? `Task: ${l.task_title}` : l.req_code ? `Req: ${l.req_code}` : l.target_type)}
                  </span>
                `).join('') : ''}
              </div>
              <div class="gh-item-meta">
                <strong>${esc(authorName)}</strong>
                <span>committed ${esc(timeAgo(c.commit?.author?.date))}</span>
                ${body ? `<span class="muted" style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(body)}</span>` : ''}
              </div>
            </div>
            <div class="row" style="gap:8px;flex-shrink:0">
              <span class="gh-sha" data-copy="${esc(c.sha)}" title="Click to copy full SHA">${esc(shortSha)}</span>
              <button class="btn ghost small" data-diff-sha="${esc(c.sha)}" data-diff-msg="${esc(headline)}">View diff</button>
              <button class="btn ghost small" data-link-sha="${esc(shortSha)}" data-link-msg="${esc(headline)}">🔗 Link task</button>
              <a class="btn ghost small" href="${esc(c.html_url)}" target="_blank" rel="noopener">↗</a>
            </div>
          </div>
        `;
      }).join('') : emptyState('⌥', 'No commits matched your branch or search filter.')}
    </div>
  `;

  // Branch selector
  el('ghBranchSelect')?.addEventListener('change', (e) => {
    ghBranch = e.target.value;
    renderGHTabContent(repo, {});
  });

  // Search input
  el('ghCommitSearch')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      ghCommitSearch = e.target.value.trim();
      renderGHTabContent(repo, {});
    }
  });

  el('ghClearSearch')?.addEventListener('click', () => {
    ghCommitSearch = '';
    renderGHTabContent(repo, {});
  });

  // Copy SHA
  container.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy);
      toast(`Copied SHA ${btn.dataset.copy.slice(0, 7)}`);
    });
  });

  // View diff
  container.querySelectorAll('[data-diff-sha]').forEach((btn) => {
    btn.addEventListener('click', () => openCommitDiffModal(btn.dataset.diffSha, btn.dataset.diffMsg));
  });

  // Link to task/requirement
  container.querySelectorAll('[data-link-sha]').forEach((btn) => {
    btn.addEventListener('click', () => openLinkCommitModal(btn.dataset.linkSha, btn.dataset.linkMsg));
  });
}

// ------------------------------------------------- sub-tab: pull requests -
async function renderGHPullsTab(container, repo) {
  const pulls = await api.get(`${P()}/github/pulls?state=${ghPRState}`).catch(() => []);

  container.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:16px;gap:12px">
      <div class="row" style="gap:6px">
        ${['all', 'open', 'closed', 'merged'].map((s) => `
          <button class="btn small ${ghPRState === s ? 'primary' : 'ghost'}" data-pr-filter="${s}">
            ${s === 'open' ? '🟢 Open' : s === 'merged' ? '🟣 Merged' : s === 'closed' ? '🔴 Closed' : 'All'}
          </button>
        `).join('')}
      </div>
      <button class="btn primary small" id="ghNewPRBtn">+ New Pull Request</button>
    </div>

    <div class="gh-pulls-list">
      ${pulls.length ? pulls.map((p) => {
        const statePillClass = p.state === 'merged' ? 'gh-pill-merged' : p.state === 'open' ? 'gh-pill-open' : 'gh-pill-closed';
        const stateLabel = p.state === 'merged' ? 'Merged' : p.state === 'open' ? 'Open' : 'Closed';
        const author = p.user?.login || 'Developer';
        const avatar = p.user?.avatar_url || '';

        return `
          <div class="gh-item">
            <div class="gh-item-main">
              <div class="gh-item-title">
                <span class="pill ${statePillClass}">${stateLabel}</span>
                <span class="muted">#${p.number}</span>
                <strong>${esc(p.title)}</strong>
                ${(p.labels || []).map((l) => `<span class="pill" style="background:#${l.color}22;color:#${l.color};border-color:#${l.color}55">${esc(l.name)}</span>`).join('')}
              </div>
              <div class="gh-item-meta">
                ${avatar ? `<img class="gh-avatar" src="${esc(avatar)}" alt="${esc(author)}">` : ''}
                <span>Opened by <strong>${esc(author)}</strong> ${esc(timeAgo(p.created_at))}</span>
                <span>&bull;</span>
                <code>${esc(p.base?.ref || 'main')}</code> ⇦ <code>${esc(p.head?.ref || 'feature')}</code>
                ${p.comments ? `<span>&bull; 💬 ${p.comments} comments</span>` : ''}
              </div>
            </div>
            <div class="row" style="gap:8px;flex-shrink:0">
              <button class="btn ghost small" data-view-pr="${esc(JSON.stringify(p))}">View Details</button>
              <a class="btn ghost small" href="${esc(p.html_url)}" target="_blank" rel="noopener">↗ GitHub</a>
            </div>
          </div>
        `;
      }).join('') : emptyState('⑂', `No ${ghPRState === 'all' ? '' : ghPRState} pull requests found.`)}
    </div>
  `;

  // State filter buttons
  container.querySelectorAll('[data-pr-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ghPRState = btn.dataset.prFilter;
      renderGHPullsTab(container, repo);
    });
  });

  // New PR button
  container.querySelector('#ghNewPRBtn')?.addEventListener('click', () => openNewPRModal(repo));

  // View details
  container.querySelectorAll('[data-view-pr]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pr = JSON.parse(btn.dataset.viewPr);
      openPRDetailsModal(pr);
    });
  });
}

// ------------------------------------------------------- sub-tab: issues -
async function renderGHIssuesTab(container, repo) {
  const issues = await api.get(`${P()}/github/issues?state=${ghIssueState}`).catch(() => []);

  container.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:16px;gap:12px">
      <div class="row" style="gap:6px">
        ${['all', 'open', 'closed'].map((s) => `
          <button class="btn small ${ghIssueState === s ? 'primary' : 'ghost'}" data-issue-filter="${s}">
            ${s === 'open' ? '🟢 Open' : s === 'closed' ? '🟣 Closed' : 'All'}
          </button>
        `).join('')}
      </div>
      <button class="btn primary small" id="ghNewIssueBtn">+ New Issue</button>
    </div>

    <div class="gh-issues-list">
      ${issues.length ? issues.map((i) => {
        const isOpen = i.state === 'open';
        const author = i.user?.login || 'Reporter';
        const avatar = i.user?.avatar_url || '';

        return `
          <div class="gh-item">
            <div class="gh-item-main">
              <div class="gh-item-title">
                <span class="pill ${isOpen ? 'gh-pill-open' : 'gh-pill-closed'}">${isOpen ? 'Open' : 'Closed'}</span>
                <span class="muted">#${i.number}</span>
                <strong>${esc(i.title)}</strong>
                ${(i.labels || []).map((l) => `<span class="pill" style="background:#${l.color}22;color:#${l.color};border-color:#${l.color}55">${esc(l.name)}</span>`).join('')}
              </div>
              <div class="gh-item-meta">
                ${avatar ? `<img class="gh-avatar" src="${esc(avatar)}" alt="${esc(author)}">` : ''}
                <span>Opened by <strong>${esc(author)}</strong> ${esc(timeAgo(i.created_at))}</span>
                ${i.comments ? `<span>&bull; 💬 ${i.comments}</span>` : ''}
              </div>
            </div>
            <div class="row" style="gap:6px;flex-shrink:0">
              <button class="btn ghost small" data-import-task="${i.number}" data-issue-title="${esc(i.title)}" data-issue-body="${esc(i.body || '')}" title="Convert to sprint task">+ Task</button>
              <button class="btn ghost small" data-import-bug="${i.number}" data-issue-title="${esc(i.title)}" data-issue-body="${esc(i.body || '')}" title="Convert to bug defect">+ Bug</button>
              <button class="btn ghost small" data-view-issue="${esc(JSON.stringify(i))}">Details</button>
              <a class="btn ghost small" href="${esc(i.html_url)}" target="_blank" rel="noopener">↗</a>
            </div>
          </div>
        `;
      }).join('') : emptyState('⬤', `No ${ghIssueState === 'all' ? '' : ghIssueState} issues found.`)}
    </div>
  `;

  // State filters
  container.querySelectorAll('[data-issue-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      ghIssueState = btn.dataset.issueFilter;
      renderGHIssuesTab(container, repo);
    });
  });

  // New Issue
  container.querySelector('#ghNewIssueBtn')?.addEventListener('click', () => openNewIssueModal(repo));

  // Import as Task
  container.querySelectorAll('[data-import-task]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api.post(`${P()}/github/issues/${btn.dataset.importTask}/import-task`, {
          title: btn.dataset.issueTitle,
          body: btn.dataset.issueBody,
        });
        toast(`Imported Issue #${btn.dataset.importTask} as a Sprint Task!`);
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Import as Bug
  container.querySelectorAll('[data-import-bug]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api.post(`${P()}/github/issues/${btn.dataset.importBug}/import-bug`, {
          title: btn.dataset.issueTitle,
          body: btn.dataset.issueBody,
        });
        toast(`Imported Issue #${btn.dataset.importBug} into Bug Tracker!`);
      } catch (err) {
        toast(err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // View details
  container.querySelectorAll('[data-view-issue]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const issue = JSON.parse(btn.dataset.viewIssue);
      openIssueDetailsModal(issue);
    });
  });
}

// ------------------------------------------------ sub-tab: github actions -
async function renderGHActionsTab(container, repo) {
  const [workflows, runs] = await Promise.all([
    api.get(`${P()}/github/actions/workflows`).catch(() => []),
    api.get(`${P()}/github/actions/runs`).catch(() => []),
  ]);

  container.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:16px;gap:12px">
      <div class="row" style="gap:8px">
        <strong style="font-size:14px;color:#123b82">Workflows:</strong>
        ${workflows.map((w) => `<span class="pill blue">${esc(w.name)}</span>`).join('')}
      </div>
      <button class="btn primary small" id="ghRunWorkflowBtn">▶ Run Workflow</button>
    </div>

    <div class="gh-actions-list">
      ${runs.length ? runs.map((r) => {
        const isSuccess = r.conclusion === 'success';
        const isFailure = r.conclusion === 'failure';
        const isRunning = r.status === 'in_progress' || !r.conclusion;
        const pillClass = isSuccess ? 'gh-pill-success' : isFailure ? 'gh-pill-failure' : 'gh-pill-running';
        const statusLabel = isSuccess ? 'Success' : isFailure ? 'Failed' : isRunning ? 'In Progress' : (r.conclusion || r.status);
        const icon = isSuccess ? '✔' : isFailure ? '✖' : isRunning ? '↻' : '•';
        const author = r.actor?.login || 'CI Bot';

        return `
          <div class="gh-item">
            <div class="gh-item-main">
              <div class="gh-item-title">
                <span class="pill ${pillClass}">${icon} ${statusLabel}</span>
                <strong>${esc(r.name)}</strong>
                <span class="pill grey">${esc(r.event)}</span>
                <span class="muted" style="font-size:12px">#${r.run_number}</span>
              </div>
              <div class="gh-item-meta">
                <span>⌥ <code>${esc(r.head_branch || 'main')}</code></span>
                <span class="gh-sha">${esc(r.head_sha || '')}</span>
                <span>&bull;</span>
                <span>Triggered by <strong>${esc(author)}</strong></span>
                <span>&bull;</span>
                <span>${esc(timeAgo(r.created_at))}</span>
                <span>&bull;</span>
                <span>⏱ ${esc(r.duration || '—')}</span>
                ${r.commit_message ? `<span class="muted" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">&bull; ${esc(r.commit_message)}</span>` : ''}
              </div>
            </div>
            <div class="row" style="gap:8px;flex-shrink:0">
              <button class="btn ghost small" data-view-run="${esc(JSON.stringify(r))}">View Steps</button>
              <a class="btn ghost small" href="${esc(r.html_url)}" target="_blank" rel="noopener">↗ Log</a>
            </div>
          </div>
        `;
      }).join('') : emptyState('⚡', 'No workflow runs found.')}
    </div>
  `;

  // Run Workflow dispatch button
  container.querySelector('#ghRunWorkflowBtn')?.addEventListener('click', () => openDispatchWorkflowModal(workflows, repo));

  // View steps
  container.querySelectorAll('[data-view-run]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const runData = JSON.parse(btn.dataset.viewRun);
      openRunStepsModal(runData);
    });
  });
}

// ------------------------------------------------------------- modals --------

function openGHConfigModal(config, userRepos = []) {
  const repoOptions = Array.isArray(userRepos) && userRepos.length > 0 ? `
    <div class="field" style="margin-bottom:12px">
      <label for="cfgQuickSelect">Quick Select from Your Profile Repositories</label>
      <select id="cfgQuickSelect" style="width:100%;padding:8px 10px;background:var(--bg-2, #161b22);color:var(--text);border:1px solid var(--border);border-radius:6px">
        <option value="">-- Choose from your GitHub profile --</option>
        ${userRepos.map((r) => `<option value="${esc(r.full_name)}" ${r.full_name === config.repo ? 'selected' : ''}>${esc(r.full_name)} ${r.private ? '🔒' : '🌐'} (${esc(r.language || 'Code')})</option>`).join('')}
      </select>
    </div>
  ` : '';

  openModal('Configure GitHub Repository', `
    <p class="muted" style="margin-top:0;font-size:13px">Connect this EngineerOS project to its dedicated public or private GitHub repository.</p>
    ${repoOptions}
    <div class="field">
      <label for="cfgRepo">Repository (owner/repo)</label>
      <input id="cfgRepo" value="${esc(config.repo || '')}" placeholder="e.g. ${esc(config.suggestedRepo || 'owner/repo')}">
    </div>
    <div class="field">
      <label for="cfgToken">Personal Access Token (PAT) <span class="muted">(optional for private repos &amp; write actions)</span></label>
      <input id="cfgToken" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" autocomplete="new-password">
      <p class="hint" style="text-align:left;margin-top:4px">A token with <code>repo</code> and <code>workflow</code> scopes allows creating PRs, issues, and triggering GitHub Actions.</p>
    </div>
    <p class="error hidden" id="cfgError"></p>
    <button class="btn primary block" id="cfgSave">Save &amp; Connect</button>
  `, () => {
    const quickSelect = el('cfgQuickSelect');
    if (quickSelect) {
      quickSelect.addEventListener('change', () => {
        if (quickSelect.value) {
          el('cfgRepo').value = quickSelect.value;
        }
      });
    }

    el('cfgSave').addEventListener('click', async () => {
      const repoVal = el('cfgRepo').value.trim();
      const tokenVal = el('cfgToken').value.trim();
      try {
        await api.post(`${P()}/github/config`, { repo: repoVal, token: tokenVal });
        closeModal();
        toast(`Connected to repository "${repoVal}"!`);
        renderGitHub();
      } catch (err) {
        el('cfgError').textContent = err.message;
        el('cfgError').classList.remove('hidden');
      }
    });
  });
}

async function openCommitDiffModal(sha, headline) {
  openModal(`Commit: ${sha.slice(0, 7)}`, `
    <div class="empty"><span class="spinner"></span></div>
  `);

  try {
    const data = await api.get(`${P()}/github/commits/${sha}`);
    const files = data.files || [];

    el('modalBody').innerHTML = `
      <div style="margin-bottom:14px">
        <h4 style="margin:0 0 4px">${esc(headline || data.commit?.message || 'Commit details')}</h4>
        <div class="muted" style="font-size:12px">
          Author: <strong>${esc(data.author?.login || data.commit?.author?.name || 'Developer')}</strong> &bull;
          Date: ${esc(new Date(data.commit?.author?.date || Date.now()).toLocaleString())}
        </div>
        ${data.stats ? `
          <div class="row" style="margin-top:8px;font-size:12.5px">
            <span class="pill green">+${data.stats.additions || 0}</span>
            <span class="pill red">-${data.stats.deletions || 0}</span>
            <span class="muted">${files.length} file${files.length === 1 ? '' : 's'} changed</span>
          </div>
        ` : ''}
      </div>

      <div style="max-height:55vh;overflow-y:auto;display:grid;gap:12px">
        ${files.length ? files.map((f) => `
          <div class="gh-diff-block">
            <div class="gh-diff-file">
              <span>📄 ${esc(f.filename)}</span>
              <span class="muted">+${f.additions || 0} / -${f.deletions || 0}</span>
            </div>
            ${f.patch ? `
              <pre class="gh-diff-lines">${f.patch.split('\n').map((line) => {
                const cls = line.startsWith('+') && !line.startsWith('+++') ? 'gh-diff-add'
                  : line.startsWith('-') && !line.startsWith('---') ? 'gh-diff-del' : '';
                return `<span class="${cls}">${esc(line)}</span>`;
              }).join('\n')}</pre>
            ` : '<div class="muted" style="padding:10px 14px;font-size:12px">Binary or unchanged content</div>'}
          </div>
        `).join('') : '<p class="muted">No file diff details available for this commit.</p>'}
      </div>
      <div style="margin-top:16px;text-align:right">
        <a class="btn small" href="${esc(data.html_url)}" target="_blank" rel="noopener">↗ Open Commit on GitHub</a>
      </div>
    `;
  } catch (err) {
    el('modalBody').innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

async function openLinkCommitModal(sha, headline) {
  openModal(`Link Commit ${sha} to SDLC`, `
    <p class="muted" style="margin-top:0;font-size:13px">Attach this commit to an EngineerOS Task or Requirement for end-to-end traceability.</p>
    <div class="field">
      <label>Commit Message</label>
      <input readonly value="${esc(headline)}" style="background:var(--bg-2)">
    </div>
    <div class="field">
      <label for="linkTargetType">Link Target Type</label>
      <select id="linkTargetType">
        <option value="task" selected>Sprint Task</option>
        <option value="requirement">Requirement</option>
      </select>
    </div>
    <div class="field" id="linkSelectGroup">
      <label for="linkTargetId">Select Item</label>
      <select id="linkTargetId"><option>Loading...</option></select>
    </div>
    <p class="error hidden" id="linkError"></p>
    <button class="btn primary block" id="linkSaveBtn">Save Link</button>
  `, async () => {
    const [tasks, reqs] = await Promise.all([
      api.get(`${P()}/tasks`).catch(() => []),
      api.get(`${P()}/requirements`).catch(() => []),
    ]);

    const updateSelect = () => {
      const type = el('linkTargetType').value;
      const select = el('linkTargetId');
      if (type === 'task') {
        select.innerHTML = tasks.length
          ? tasks.map((t) => `<option value="${t.id}">[${STATUS_LABEL[t.status] || t.status}] ${esc(t.title)}</option>`).join('')
          : '<option value="">No tasks found in project</option>';
      } else {
        select.innerHTML = reqs.length
          ? reqs.map((r) => `<option value="${r.id}">[${r.code}] ${esc(r.title)}</option>`).join('')
          : '<option value="">No requirements found</option>';
      }
    };

    el('linkTargetType').addEventListener('change', updateSelect);
    updateSelect();

    el('linkSaveBtn').addEventListener('click', async () => {
      const targetType = el('linkTargetType').value;
      const targetId = el('linkTargetId').value;
      if (!targetId) return;

      try {
        await api.post(`${P()}/github/links`, {
          item_type: 'commit',
          item_id: sha,
          item_title: headline,
          target_type: targetType,
          target_id: Number(targetId),
        });
        closeModal();
        toast(`Commit ${sha} linked to ${targetType}!`);
        renderGitHub();
      } catch (err) {
        el('linkError').textContent = err.message;
        el('linkError').classList.remove('hidden');
      }
    });
  });
}

async function openNewPRModal(repo) {
  const branches = await api.get(`${P()}/github/branches`).catch(() => []);
  openModal('Create Pull Request', `
    <div class="field">
      <label for="prTitle">Title</label>
      <input id="prTitle" placeholder="e.g. feat: implement GitHub Actions monitoring">
    </div>
    <div class="grid cols-2" style="margin-bottom:14px">
      <div class="field" style="margin-bottom:0">
        <label for="prHead">Head branch (source)</label>
        <select id="prHead">
          ${branches.map((b) => `<option value="${esc(b.name)}" ${b.name === ghBranch ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="margin-bottom:0">
        <label for="prBase">Base branch (target)</label>
        <select id="prBase">
          ${branches.map((b) => `<option value="${esc(b.name)}" ${b.name === (repo.default_branch || 'main') ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field">
      <label for="prBody">Description</label>
      <textarea id="prBody" rows="5" placeholder="Explain the context, requirements fulfilled, and verification steps."></textarea>
    </div>
    <p class="error hidden" id="prError"></p>
    <button class="btn primary block" id="prSubmit">Submit Pull Request</button>
  `, () => {
    el('prTitle').focus();
    el('prSubmit').addEventListener('click', async () => {
      const title = el('prTitle').value.trim();
      const head = el('prHead').value;
      const base = el('prBase').value;
      const body = el('prBody').value.trim();

      if (!title) {
        el('prError').textContent = 'Please enter a PR title.';
        el('prError').classList.remove('hidden');
        return;
      }

      try {
        await api.post(`${P()}/github/pulls`, { title, head, base, body });
        closeModal();
        toast(`Pull request "${title}" created!`);
        ghTab = 'pulls';
        renderGitHub();
      } catch (err) {
        el('prError').textContent = err.message;
        el('prError').classList.remove('hidden');
      }
    });
  });
}

function openPRDetailsModal(pr) {
  openModal(`Pull Request #${pr.number}`, `
    <div style="display:grid;gap:12px">
      <div>
        <div class="row" style="gap:8px;margin-bottom:6px">
          <span class="pill ${pr.state === 'merged' ? 'gh-pill-merged' : pr.state === 'open' ? 'gh-pill-open' : 'gh-pill-closed'}">
            ${pr.state === 'merged' ? 'Merged' : pr.state === 'open' ? 'Open' : 'Closed'}
          </span>
          <h3 style="margin:0">${esc(pr.title)}</h3>
        </div>
        <div class="muted" style="font-size:12.5px">
          Opened by <strong>${esc(pr.user?.login || 'Developer')}</strong> ${esc(timeAgo(pr.created_at))} &bull;
          <code>${esc(pr.base?.ref || 'main')}</code> ⇦ <code>${esc(pr.head?.ref || 'feature')}</code>
        </div>
      </div>

      <div class="card" style="background:var(--bg-2);margin:0;padding:14px">
        <h5 style="margin:0 0 6px;text-transform:uppercase;font-size:11px;color:var(--muted)">Description</h5>
        <div style="font-size:13.5px;line-height:1.55;white-space:pre-wrap">${esc(pr.body || 'No description provided.')}</div>
      </div>

      ${pr.labels && pr.labels.length ? `
        <div>
          <h5 style="margin:0 0 6px;text-transform:uppercase;font-size:11px;color:var(--muted)">Labels</h5>
          <div class="row">${pr.labels.map((l) => `<span class="pill" style="background:#${l.color}22;color:#${l.color};border-color:#${l.color}55">${esc(l.name)}</span>`).join('')}</div>
        </div>
      ` : ''}

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span class="muted" style="font-size:12px">💬 ${pr.comments || 0} comments</span>
        <a class="btn primary small" href="${esc(pr.html_url)}" target="_blank" rel="noopener">↗ View on GitHub</a>
      </div>
    </div>
  `);
}

function openNewIssueModal(repo) {
  openModal('Create New GitHub Issue', `
    <div class="field">
      <label for="issueTitle">Title</label>
      <input id="issueTitle" placeholder="e.g. Broken link in IEEE-830 export">
    </div>
    <div class="field">
      <label for="issueLabels">Labels <span class="muted">(comma-separated)</span></label>
      <input id="issueLabels" placeholder="e.g. bug, high-priority, ui">
    </div>
    <div class="field">
      <label for="issueBody">Description</label>
      <textarea id="issueBody" rows="6" placeholder="Describe the problem or enhancement in detail..."></textarea>
    </div>
    <p class="error hidden" id="issueError"></p>
    <button class="btn primary block" id="issueSubmit">Submit Issue</button>
  `, () => {
    el('issueTitle').focus();
    el('issueSubmit').addEventListener('click', async () => {
      const title = el('issueTitle').value.trim();
      const body = el('issueBody').value.trim();
      const labels = el('issueLabels').value.split(',').map((l) => l.trim()).filter(Boolean);

      if (!title) {
        el('issueError').textContent = 'Please enter an issue title.';
        el('issueError').classList.remove('hidden');
        return;
      }

      try {
        await api.post(`${P()}/github/issues`, { title, body, labels });
        closeModal();
        toast(`Issue "${title}" created!`);
        ghTab = 'issues';
        renderGitHub();
      } catch (err) {
        el('issueError').textContent = err.message;
        el('issueError').classList.remove('hidden');
      }
    });
  });
}

function openIssueDetailsModal(issue) {
  openModal(`Issue #${issue.number}`, `
    <div style="display:grid;gap:12px">
      <div>
        <div class="row" style="gap:8px;margin-bottom:6px">
          <span class="pill ${issue.state === 'open' ? 'gh-pill-open' : 'gh-pill-closed'}">${issue.state === 'open' ? 'Open' : 'Closed'}</span>
          <h3 style="margin:0">${esc(issue.title)}</h3>
        </div>
        <div class="muted" style="font-size:12.5px">
          Opened by <strong>${esc(issue.user?.login || 'Reporter')}</strong> ${esc(timeAgo(issue.created_at))}
        </div>
      </div>

      <div class="card" style="background:var(--bg-2);margin:0;padding:14px">
        <h5 style="margin:0 0 6px;text-transform:uppercase;font-size:11px;color:var(--muted)">Description</h5>
        <div style="font-size:13.5px;line-height:1.55;white-space:pre-wrap">${esc(issue.body || 'No description provided.')}</div>
      </div>

      ${issue.labels && issue.labels.length ? `
        <div>
          <h5 style="margin:0 0 6px;text-transform:uppercase;font-size:11px;color:var(--muted)">Labels</h5>
          <div class="row">${issue.labels.map((l) => `<span class="pill" style="background:#${l.color}22;color:#${l.color};border-color:#${l.color}55">${esc(l.name)}</span>`).join('')}</div>
        </div>
      ` : ''}

      <div class="row" style="justify-content:space-between;align-items:center;margin-top:8px">
        <div class="row" style="gap:8px">
          <button class="btn small" id="dlgImportTask">+ Convert to Task</button>
          <button class="btn small" id="dlgImportBug">+ Convert to Bug</button>
        </div>
        <a class="btn primary small" href="${esc(issue.html_url)}" target="_blank" rel="noopener">↗ View on GitHub</a>
      </div>
    </div>
  `, () => {
    el('dlgImportTask')?.addEventListener('click', async () => {
      try {
        await api.post(`${P()}/github/issues/${issue.number}/import-task`, { title: issue.title, body: issue.body });
        closeModal();
        toast(`Imported Issue #${issue.number} as a Sprint Task!`);
      } catch (err) {
        toast(err.message, true);
      }
    });

    el('dlgImportBug')?.addEventListener('click', async () => {
      try {
        await api.post(`${P()}/github/issues/${issue.number}/import-bug`, { title: issue.title, body: issue.body });
        closeModal();
        toast(`Imported Issue #${issue.number} into Bug Tracker!`);
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

async function openDispatchWorkflowModal(workflows, repo) {
  const branches = await api.get(`${P()}/github/branches`).catch(() => []);

  openModal('Dispatch GitHub Actions Workflow', `
    <p class="muted" style="margin-top:0;font-size:13px">Manually trigger a CI/CD workflow run on a selected git branch.</p>
    <div class="field">
      <label for="wfSelect">Select Workflow</label>
      <select id="wfSelect">
        ${workflows.map((w) => `<option value="${w.id}">${esc(w.name)} (${esc(w.path || 'workflow')})</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="wfBranch">Branch Ref</label>
      <select id="wfBranch">
        ${branches.map((b) => `<option value="${esc(b.name)}" ${b.name === (repo.default_branch || 'main') ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
      </select>
    </div>
    <p class="error hidden" id="wfError"></p>
    <button class="btn primary block" id="wfRunSubmit">Trigger Run Now</button>
  `, () => {
    el('wfRunSubmit').addEventListener('click', async () => {
      const workflowId = el('wfSelect').value;
      const ref = el('wfBranch').value;
      const selectedWf = workflows.find((w) => String(w.id) === String(workflowId));

      try {
        await api.post(`${P()}/github/actions/dispatch`, {
          workflow_id: workflowId,
          ref,
          name: selectedWf?.name || 'Manual Workflow Trigger',
        });
        closeModal();
        toast(`Triggered workflow run on "${ref}"!`);
        ghTab = 'actions';
        renderGitHub();
      } catch (err) {
        el('wfError').textContent = err.message;
        el('wfError').classList.remove('hidden');
      }
    });
  });
}

function openRunStepsModal(run) {
  const steps = run.steps || [];
  openModal(`Run Steps: ${run.name}`, `
    <div style="display:grid;gap:12px">
      <div class="row" style="justify-content:space-between">
        <div>
          <h4 style="margin:0 0 3px">${esc(run.name)}</h4>
          <span class="muted" style="font-size:12px">Branch: <code>${esc(run.head_branch || 'main')}</code> &bull; Event: ${esc(run.event)} &bull; ${esc(run.duration)}</span>
        </div>
        <span class="pill ${run.conclusion === 'success' ? 'gh-pill-success' : 'gh-pill-failure'}">${run.conclusion || run.status}</span>
      </div>

      <div class="card" style="background:var(--bg-2);margin:0;padding:12px">
        <h5 style="margin:0 0 8px;text-transform:uppercase;font-size:11px;color:var(--muted)">Workflow Steps</h5>
        <div style="display:grid;gap:6px">
          ${steps.map((s, idx) => `
            <div class="row" style="justify-content:space-between;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 12px;font-size:13px">
              <span><strong>${idx + 1}.</strong> ${esc(s.name)}</span>
              <span class="muted">${s.conclusion === 'success' ? '✔' : '↻'} ${esc(s.duration || '—')}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="text-align:right">
        <a class="btn primary small" href="${esc(run.html_url)}" target="_blank" rel="noopener">↗ View Full Logs on GitHub</a>
      </div>
    </div>
  `);
}

// ---------------------------------------------------------- assistant -----

const chatLog = [];

async function renderAssistant() {
  el('view').innerHTML = `
    <div class="grid cols-2">
      <div class="card">
        <div class="panel-heading"><h3><span class="panel-icon blue">✦</span> Project queries</h3></div>
        <p class="muted">Ask questions in plain English and get answers from this project's live requirements, work, defects and risks.</p>
      </div>
      <div class="card">
        <div class="panel-heading"><h3><span class="panel-icon violet">▤</span> Team intelligence</h3></div>
        <p class="muted">Turn meeting notes into decisions, action items and blockers, or generate a shareable weekly delivery report.</p>
        <div class="row" style="margin-top:12px">
          <button class="btn small" id="meetingSummaryBtn">Summarize meeting</button>
          <button class="btn small primary" id="weeklyReportBtn">Generate weekly report</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="chat" id="chat">
        ${chatLog.length ? chatLog.map((m) => `<div class="msg ${m.role}">${esc(m.text)}</div>`).join('')
          : `<div class="msg bot">Ask me about <strong>${esc(state.project.name)}</strong>. I answer from this project's live data — try "what is our progress?", "how many bugs are open?", "who has the most work?" or "what are the risks?".</div>`}
      </div>
      <form class="row" id="chatForm">
        <input id="chatInput" class="grow" placeholder="Ask about progress, requirements, defects, workload or risks…" autocomplete="off">
        <button class="btn primary" type="submit">Ask</button>
      </form>
      <div class="row" style="margin-top:12px">
        ${['What is our progress?', 'How many bugs are open?', 'Who has the most work?', 'What are the risks?']
          .map((q) => `<button class="btn small" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
      </div>
    </div>`;

  el('meetingSummaryBtn').addEventListener('click', () => {
    openModal('Summarize a meeting', `
      <p class="muted" style="margin-top:0">Paste notes or a transcript. The summary stays scoped to this project and is generated locally.</p>
      <div class="field"><label for="meetingTranscript">Meeting notes</label><textarea id="meetingTranscript" rows="10" placeholder="Decided to ship the import flow on Friday. Alex will add coverage. Blocked on API credentials..."></textarea></div>
      <p class="error hidden" id="meetingError"></p>
      <button class="btn primary block" id="meetingGenerate">Generate summary</button>
    `, () => {
      el('meetingTranscript').focus();
      el('meetingGenerate').addEventListener('click', async () => {
        const button = el('meetingGenerate');
        button.disabled = true;
        try {
          const summary = await api.post(`${P()}/meeting-summary`, { transcript: el('meetingTranscript').value });
          closeModal();
          openModal('Meeting summary', `
            <div class="finding"><strong>Summary</strong><p>${esc(summary.summary)}</p></div>
            <h4>Decisions</h4><ul>${summary.decisions.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
            <h4>Action items</h4><ul>${summary.actionItems.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
            <h4>Blockers and risks</h4><ul>${summary.blockers.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
          `);
        } catch (err) {
          el('meetingError').textContent = err.message;
          el('meetingError').classList.remove('hidden');
        } finally {
          button.disabled = false;
        }
      });
    });
  });

  el('weeklyReportBtn').addEventListener('click', async () => {
    const button = el('weeklyReportBtn');
    button.disabled = true;
    try {
      const report = await api.get(`${P()}/weekly-report`);
      openModal(`Weekly report · ${report.project}`, `
        <p class="muted">${esc(report.period)} · Generated ${esc(new Date(report.generatedAt).toLocaleString())}</p>
        <div class="grid cols-3">
          <div class="stat"><div class="value">${report.metrics.completedTasks}</div><div class="sub">completed tasks</div></div>
          <div class="stat"><div class="value">${report.metrics.completedPoints}</div><div class="sub">story points delivered</div></div>
          <div class="stat"><div class="value">${report.metrics.openBugs}</div><div class="sub">open defects</div></div>
        </div>
        <h4>Highlights</h4><ul>${report.highlights.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
        <h4>Risks</h4><ul>${report.risks.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
        <h4>Next steps</h4><ul>${report.nextSteps.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      `);
    } catch (err) {
      toast(err.message, true);
    } finally {
      button.disabled = false;
    }
  });

  // Append to the existing chat rather than re-rendering the whole view,
  // which would re-bind the listeners below.
  const say = (role, text) => {
    const bubble = document.createElement('div');
    bubble.className = `msg ${role}`;
    bubble.textContent = text;
    el('chat').append(bubble);
    el('chat').scrollTop = el('chat').scrollHeight;
  };

  const ask = async (question) => {
    if (!question.trim()) return;
    chatLog.push({ role: 'me', text: question });
    say('me', question);
    try {
      const { answer } = await api.post(`${P()}/ask`, { question });
      chatLog.push({ role: 'bot', text: answer });
      say('bot', answer);
    } catch (err) {
      say('bot', err.message);
    }
  };

  el('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = el('chatInput').value;
    el('chatInput').value = '';
    ask(value);
  });
  el('view').addEventListener('click', (e) => {
    if (e.target.dataset?.q) ask(e.target.dataset.q);
  });
}

// --------------------------------------------------------------- team -----

async function renderTeam() {
  state.project = await api.get(`/projects/${state.project.id}`);
  const { members, activity } = state.project;

  el('topbarActions').innerHTML = '<button class="btn primary" id="addMemberBtn">+ Add member</button>';
  el('view').innerHTML = `
    <div class="card">
      <h3>Project details</h3>
      <table><tbody>
        <tr><th style="width:140px">Name</th><td>${esc(state.project.name)}</td></tr>
        <tr><th>Description</th><td>${esc(state.project.description || '—')}</td></tr>
        <tr><th>Created</th><td>${esc(state.project.created_at)}</td></tr>
        <tr><th>Sprints</th><td>${(state.project.sprints || []).map((s) => `<span class="pill ${s.status === 'active' ? 'green' : 'grey'}">${esc(s.name)}</span>`).join(' ')}</td></tr>
      </tbody></table>
    </div>

    <div class="card">
      <h3>Members (${members.length})</h3>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>${members.map((m) => `
          <tr>
            <td><strong>${esc(m.name)}</strong></td>
            <td class="muted">${esc(m.email)}</td>
            <td><span class="pill blue">${esc(m.role)}</span></td>
            <td>${m.id === state.project.owner_id ? '<span class="pill grey">owner</span>'
              : `<button class="btn ghost small danger" data-rm="${m.id}">Remove</button>`}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="card">
      <h3>Activity log</h3>
      ${activity.length ? `<table><tbody>${activity.map((x) => `
        <tr><td class="muted" style="width:150px">${esc(x.created_at)}</td>
            <td><strong>${esc(x.user || 'Someone')}</strong> ${esc(x.message)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">No activity recorded yet.</p>'}
    </div>`;

  el('view').addEventListener('click', async (e) => {
    const id = e.target.dataset?.rm;
    if (!id) return;
    await api.del(`${P()}/members/${id}`);
    toast('Member removed.');
    render();
  });

  el('addMemberBtn').addEventListener('click', () => {
    openModal('Add a team member', `
      <p class="muted" style="margin-top:0;font-size:13.5px">The person needs an EngineerOS account already.</p>
      <div class="field"><label for="mEmail">Email</label><input id="mEmail" type="email" placeholder="teammate@example.com"></div>
      <div class="field"><label for="mRole">Role on this project</label>
        <select id="mRole">${['PM', 'DEVELOPER', 'TESTER', 'DESIGNER', 'CLIENT'].map((r) => `<option>${r}</option>`).join('')}</select></div>
      <p class="error hidden" id="mError"></p>
      <button class="btn primary block" id="mSave">Add to project</button>
    `, () => {
      el('mEmail').focus();
      el('mSave').addEventListener('click', async () => {
        try {
          await api.post(`${P()}/members`, { email: el('mEmail').value, role: el('mRole').value });
          closeModal();
          toast('Member added.');
          render();
        } catch (err) {
          el('mError').textContent = err.message;
          el('mError').classList.remove('hidden');
        }
      });
    });
  });
}

// ------------------------------------------------ Showcase / Marketing Modal --

function openShowcaseModal(initialTab = 'features') {
  const tabs = [
    { id: 'features', label: '✦ Features', icon: '✦' },
    { id: 'pricing', label: '★ Pricing', icon: '★' },
    { id: 'docs', label: '▤ Docs', icon: '▤' },
    { id: 'about', label: 'ℹ About', icon: 'ℹ' },
  ];

  let currentTab = initialTab || 'features';
  let isAnnual = false;

  function renderShowcaseContent() {
    if (currentTab === 'features') {
      return `
        <div class="showcase-hero">
          <span class="badge">✦ AI-POWERED PLATFORM</span>
          <h2>Build Better Software, Faster With AI</h2>
          <p>EngineerOS unites requirements analysis, automated UML modeling, agile execution, and GitHub live tracking into a single unified workspace.</p>
        </div>

        <div class="feature-grid">
          <div class="feature-card">
            <div class="feature-icon-wrapper">◈</div>
            <h3>AI Requirement &amp; SRS Generator</h3>
            <p>Converts free-form domain prompts into formal IEEE 830 functional/non-functional requirements, user stories, acceptance criteria, and quality scores.</p>
            <div class="feature-tags">
              <span class="feature-tag">IEEE 830</span>
              <span class="feature-tag">Quality Scoring</span>
              <span class="feature-tag">Ambiguity Flagging</span>
            </div>
          </div>

          <div class="feature-card">
            <div class="feature-icon-wrapper purple">◇</div>
            <h3>Course Rule Engine &amp; 10 UML Diagrams</h3>
            <p>Single source of truth System Model JSON deterministically drives 10 synchronized diagrams (Use Case, Class, Activity, Swimlane, Sequence, State, Deployment, ER, Context, DFD) validated by Rule Engine.</p>
            <div class="feature-tags">
              <span class="feature-tag">10 Diagram Types</span>
              <span class="feature-tag">Rule Engine</span>
              <span class="feature-tag">Self-Healing</span>
              <span class="feature-tag">PlantUML Vector</span>
            </div>
          </div>

          <div class="feature-card">
            <div class="feature-icon-wrapper green">▥</div>
            <h3>Agile Sprint Planning &amp; Kanban</h3>
            <p>Streamlined backlog management, story point estimations, sprint lifecycle (Active/Completed), and rapid status transitions (Backlog to Done).</p>
            <div class="feature-tags">
              <span class="feature-tag">Scrum Board</span>
              <span class="feature-tag">Story Points</span>
              <span class="feature-tag">Task Triage</span>
            </div>
          </div>

          <div class="feature-card">
            <div class="feature-icon-wrapper amber">⇄</div>
            <h3>End-to-End Traceability Matrix</h3>
            <p>Bidirectional audit trail guaranteeing that every requirement maps directly to tasks, test cases, bug reports, and GitHub commit references.</p>
            <div class="feature-tags">
              <span class="feature-tag">100% Traceable</span>
              <span class="feature-tag">Audit Ready</span>
              <span class="feature-tag">Compliance</span>
            </div>
          </div>

          <div class="feature-card">
            <div class="feature-icon-wrapper cyan">⌥</div>
            <h3>Live GitHub Bi-directional Sync</h3>
            <p>Connect your GitHub account to browse branches, review pull requests, inspect commit diffs, and monitor GitHub Actions CI/CD workflow runs in real-time.</p>
            <div class="feature-tags">
              <span class="feature-tag">Repo Selector</span>
              <span class="feature-tag">PR Review</span>
              <span class="feature-tag">Workflow Status</span>
            </div>
          </div>

          <div class="feature-card">
            <div class="feature-icon-wrapper rose">⬤</div>
            <h3>Defect &amp; Bug Tracking</h3>
            <p>Full lifecycle bug triaging with severity classifications (critical, high, medium, low), repro steps, and linked requirement resolution verification.</p>
            <div class="feature-tags">
              <span class="feature-tag">Severity Matrix</span>
              <span class="feature-tag">Zero Regression</span>
              <span class="feature-tag">Root Cause</span>
            </div>
          </div>
        </div>
      `;
    }

    if (currentTab === 'pricing') {
      const proPrice = isAnnual ? '$24' : '$29';
      const entPrice = isAnnual ? '$79' : '$99';

      return `
        <div class="showcase-hero">
          <span class="badge">TRANSPARENT PLANS</span>
          <h2>Simple, Predictable Pricing for Engineers &amp; Teams</h2>
          <p>Get started for free forever. Upgrade when your team is ready for unlimited AI generations and enterprise PostgreSQL scale.</p>
        </div>

        <div class="pricing-billing-switch">
          <span>Monthly Billing</span>
          <label class="billing-toggle">
            <input type="checkbox" id="pricingBillingToggle" ${isAnnual ? 'checked' : ''}>
            <span class="billing-slider"></span>
          </label>
          <span>Annual Billing</span>
          <span class="discount-badge">Save 20%</span>
        </div>

        <div class="pricing-grid">
          <div class="pricing-card">
            <h3>Community Free</h3>
            <div class="plan-desc">For individual developers, students, and open-source contributors.</div>
            <div class="pricing-price">
              <span class="amount">$0</span>
              <span class="period">/ forever</span>
            </div>
            <ul class="pricing-features">
              <li><i>✓</i> Up to 3 active projects</li>
              <li><i>✓</i> All 10 UML diagram types with local/cloud rendering</li>
              <li><i>✓</i> AI Requirement &amp; SRS generation (50 runs/mo)</li>
              <li><i>✓</i> Agile sprint board &amp; bug tracker</li>
              <li><i>✓</i> Public GitHub repository integration</li>
            </ul>
            <button class="btn block" id="planFreeBtn">${state.user ? 'Active Free Plan' : 'Get Started Free'}</button>
          </div>

          <div class="pricing-card featured">
            <div class="popular-ribbon">Most Popular</div>
            <h3>Pro Developer</h3>
            <div class="plan-desc">For serious software engineers, tech leads, and fast-moving teams.</div>
            <div class="pricing-price">
              <span class="amount" id="proPriceDisplay">${proPrice}</span>
              <span class="period">/ month ${isAnnual ? '(billed annually)' : ''}</span>
            </div>
            <ul class="pricing-features">
              <li><i>✓</i> <strong>Unlimited</strong> projects &amp; sprints</li>
              <li><i>✓</i> <strong>Unlimited</strong> AI Requirement &amp; SRS generations</li>
              <li><i>✓</i> Private GitHub repositories &amp; automated PR reviews</li>
              <li><i>✓</i> High-resolution SVG &amp; PlantUML (.puml) source downloads</li>
              <li><i>✓</i> Complete Traceability Matrix exports &amp; audit history</li>
              <li><i>✓</i> Automated Self-Healing model repair loop</li>
              <li><i>✓</i> Priority PlantUML vector cloud rendering</li>
            </ul>
            <button class="btn primary block" id="planProBtn">⚡ Upgrade to Pro (14-Day Free Trial)</button>
          </div>

          <div class="pricing-card">
            <h3>Enterprise Organization</h3>
            <div class="plan-desc">For large teams and companies requiring dedicated databases and compliance.</div>
            <div class="pricing-price">
              <span class="amount" id="entPriceDisplay">${entPrice}</span>
              <span class="period">/ team / month</span>
            </div>
            <ul class="pricing-features">
              <li><i>✓</i> Everything in Pro plan</li>
              <li><i>✓</i> Dedicated <strong>PostgreSQL database</strong> with JSONB</li>
              <li><i>✓</i> Google &amp; GitHub OAuth SSO team login</li>
              <li><i>✓</i> Custom corporate UML validation rule sets</li>
              <li><i>✓</i> 99.9% Uptime SLA &amp; private deployment</li>
              <li><i>✓</i> 24/7 dedicated engineering support</li>
            </ul>
            <button class="btn block" id="planEntBtn">Contact Sales &amp; Demo</button>
          </div>
        </div>

        <div style="margin-top: 36px; padding: 20px; background: #f6faff; border: 1px solid #dce8f5; border-radius: 12px;">
          <h4 style="color:#112f60;margin-bottom:8px">Frequently Asked Questions</h4>
          <div style="display:grid;gap:12px;font-size:13px;color:#496b99;">
            <div><strong>Can I switch between plans anytime?</strong> Yes, you can upgrade, downgrade, or cancel at any time with instant effect.</div>
            <div><strong>Do I need a credit card for the Free plan?</strong> No credit card required. You can sign up with email or Google/GitHub and start immediately.</div>
            <div><strong>Is my code private and secure?</strong> Absolutely. EngineerOS never uses your proprietary code to train external AI models.</div>
          </div>
        </div>
      `;
    }

    if (currentTab === 'docs') {
      return `
        <div class="showcase-hero">
          <span class="badge">DOCUMENTATION</span>
          <h2>EngineerOS Architecture &amp; Developer Guide</h2>
          <p>Learn how requirements, the course rule engine, and PlantUML generators communicate seamlessly.</p>
        </div>

        <div class="docs-section">
          <h3><span>1.</span> Quickstart in 5 Minutes</h3>
          <p>Get your project up and running with AI-assisted software engineering intelligence:</p>
          <ol style="color:#4e6c97;font-size:13.5px;line-height:1.7;padding-left:20px;margin-bottom:14px">
            <li><strong>Select or create a project</strong>: Choose an active project or click <em>+ New Project</em>.</li>
            <li><strong>Define requirements</strong>: Use the <em>Requirements</em> tab or click <em>Analyze Requirements</em> to generate formal IEEE 830 stories and acceptance criteria.</li>
            <li><strong>Explore UML diagrams</strong>: Switch to <em>UML Diagrams</em>, click <em>⚡ Load EcoBangla Preset</em> (or paste your own description), and click <em>Analyze &amp; Extract System Model</em>.</li>
            <li><strong>Validate &amp; Repair</strong>: The Rule Engine validates your diagrams with zero violations. If rules fail, one-click <em>Auto-Repair</em> fixes the model.</li>
            <li><strong>Connect GitHub</strong>: Link your GitHub profile to track commits, PRs, diffs, and workflow builds.</li>
          </ol>
        </div>

        <div class="docs-section">
          <h3><span>2.</span> Core REST API Endpoints</h3>
          <p>EngineerOS exposes a modular JSON REST API for automated workflows:</p>
          <table class="docs-table">
            <thead>
              <tr><th>Endpoint</th><th>Method</th><th>Description</th></tr>
            </thead>
            <tbody>
              <tr><td><code>/api/uml/analyze</code></td><td>POST</td><td>Extracts structured System Model JSON from requirements</td></tr>
              <tr><td><code>/api/uml/generate</code></td><td>POST</td><td>Generates PlantUML source for any of 10 diagram types</td></tr>
              <tr><td><code>/api/uml/validate</code></td><td>POST</td><td>Runs diagram against the Course Rule Engine</td></tr>
              <tr><td><code>/api/uml/render</code></td><td>POST</td><td>Compiles PlantUML to high-resolution vector SVG</td></tr>
              <tr><td><code>/api/uml/repair</code></td><td>POST</td><td>Self-healing loop fixing model rule violations</td></tr>
              <tr><td><code>/api/projects</code></td><td>GET / POST</td><td>Project management and membership</td></tr>
              <tr><td><code>/api/auth/providers</code></td><td>GET</td><td>Checks Google &amp; GitHub OAuth availability</td></tr>
            </tbody>
          </table>
        </div>

        <div class="docs-section">
          <h3><span>3.</span> Dual PlantUML Rendering Architecture</h3>
          <p>EngineerOS uses an automatic dual-mode rendering pipeline: if local <code>java -jar tools/plantuml/plantuml.jar</code> is available, it renders locally; otherwise, it encodes the diagram via <code>plantuml-encoder</code> and fetches clean vector SVGs from the secure PlantUML server with zero setup required.</p>
        </div>
      `;
    }

    if (currentTab === 'about') {
      return `
        <div class="showcase-hero">
          <span class="badge">ABOUT ENGINEEROS</span>
          <h2>Bridging Engineering Rigor with AI Intelligence</h2>
          <p>EngineerOS is built to eliminate the chaos of modern software delivery by bringing requirements, architecture, code, and project management together.</p>
        </div>

        <div class="about-stats-grid">
          <div class="about-stat-box">
            <strong>10</strong>
            <span>Synchronized UML Diagram Types</span>
          </div>
          <div class="about-stat-box">
            <strong>100%</strong>
            <span>Course Rule Engine Coverage</span>
          </div>
          <div class="about-stat-box">
            <strong>PostgreSQL</strong>
            <span>Native JSONB &amp; SQLite Support</span>
          </div>
          <div class="about-stat-box">
            <strong>Live Sync</strong>
            <span>GitHub Bi-directional Integration</span>
          </div>
        </div>

        <div style="background:#f9fbfe;border:1px solid #dceaf7;border-radius:12px;padding:20px;margin-top:20px;font-size:13.5px;color:#496996;line-height:1.6">
          <h4 style="color:#112a58;margin-bottom:8px">System Environment &amp; Status</h4>
          <div>• <strong>Application:</strong> EngineerOS v1.0.0</div>
          <div>• <strong>Server URL:</strong> <code>http://localhost:3000</code></div>
          <div>• <strong>Authentication:</strong> JWT + Google OAuth + GitHub OAuth</div>
          <div>• <strong>Rendering Engine:</strong> Dual PlantUML (Local JAR + Online Vector Encoder)</div>
          <div>• <strong>System Status:</strong> <span style="color:#12b76a;font-weight:700">● All Systems Operational</span></div>
        </div>
      `;
    }

    return '';
  }

  function mountShowcaseUI() {
    const headerHtml = `
      <div class="showcase-header">
        <div class="showcase-tabs" id="showcaseTabs">
          ${tabs.map((t) => `<button type="button" class="showcase-tab ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
      </div>
    `;

    openModal('EngineerOS Platform', `
      ${headerHtml}
      <div class="showcase-body" id="showcaseBody">
        ${renderShowcaseContent()}
      </div>
    `, () => {
      // Wire tab switches
      el('showcaseTabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.showcase-tab');
        if (!btn) return;
        currentTab = btn.dataset.tab;
        el('showcaseTabs').querySelectorAll('.showcase-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === currentTab));
        const body = el('showcaseBody');
        if (body) {
          body.innerHTML = renderShowcaseContent();
          wireShowcaseInteractive();
        }
      });

      wireShowcaseInteractive();
    }, true);
  }

  function wireShowcaseInteractive() {
    // Billing switcher
    const toggle = el('pricingBillingToggle');
    if (toggle) {
      toggle.addEventListener('change', (e) => {
        isAnnual = e.target.checked;
        const proDisplay = el('proPriceDisplay');
        const entDisplay = el('entPriceDisplay');
        if (proDisplay) proDisplay.textContent = isAnnual ? '$24' : '$29';
        if (entDisplay) entDisplay.textContent = isAnnual ? '$79' : '$99';
      });
    }

    // Free plan button
    el('planFreeBtn')?.addEventListener('click', () => {
      if (state.user) {
        toast('You are currently on the Community Free tier.');
        closeModal();
      } else {
        closeModal();
        setAuthMode('register');
        el('authName')?.focus();
      }
    });

    // Pro plan button
    el('planProBtn')?.addEventListener('click', () => {
      toast('🎉 Welcome to EngineerOS Pro! Unlimited AI & vector exports unlocked.');
      closeModal();
    });

    // Enterprise plan button
    el('planEntBtn')?.addEventListener('click', () => {
      toast('📩 Thank you! An EngineerOS enterprise representative will contact you.');
      closeModal();
    });
  }

  mountShowcaseUI();
}

function setupNavigationLinks() {
  document.querySelectorAll('a[href^="#features"], a[href^="#pricing"], a[href^="#docs"], a[href^="#about"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('href').replace(/^#/, '');
      openShowcaseModal(target);
    });
  });

  document.querySelectorAll('.help-link').forEach((link) => {
    link.style.cursor = 'pointer';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openShowcaseModal('docs');
    });
  });
}

// -------------------------------------------------------------- start -----

(async function init() {
<<<<<<< HEAD
  processOAuthResult();
=======
  const hashParams = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  const searchParams = new URLSearchParams(location.search);
  const socialToken = hashParams.get('auth_token') || searchParams.get('auth_token');
  const socialError = hashParams.get('auth_error') || searchParams.get('auth_error');

  if (socialToken) {
    token.set(socialToken);
    history.replaceState(null, '', location.pathname);
  }
  if (socialError) {
    el('authError').textContent = socialError;
    el('authError').classList.remove('hidden');
    history.replaceState(null, '', location.pathname);
  }

  setupNavigationLinks();

  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace(/^#\/?/, '');
    if (['features', 'pricing', 'docs', 'about'].includes(hash)) {
      openShowcaseModal(hash);
    }
  });

  const initialHash = location.hash.replace(/^#\/?/, '');
  if (['features', 'pricing', 'docs', 'about'].includes(initialHash)) {
    openShowcaseModal(initialHash);
  }

>>>>>>> ece38a959b563e6b64cb427046c43b0ff0c2acb7
  if (!token.get()) return;
  try {
    const { user } = await api.get('/auth/me');
    state.user = user;
    await startApp();
  } catch {
    token.clear();
  }
})();

