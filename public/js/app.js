import { api, token } from './api.js';

// ------------------------------------------------------------- helpers ----

const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

/** Escape untrusted text before putting it into innerHTML. */
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const state = { user: null, projects: [], project: null, view: 'dashboard', users: [] };

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

function openModal(title, html, onReady) {
  el('modalTitle').textContent = title;
  el('modalBody').innerHTML = html;
  el('modal').classList.remove('hidden');
  if (onReady) onReady();
}
const closeModal = () => el('modal').classList.add('hidden');

const barClass = (value) => (value >= 75 ? 'ok' : value >= 45 ? 'warn' : 'bad');
const meter = (value, cls) => `<div class="bar ${cls ?? barClass(value)}"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div>`;
const emptyState = (icon, text) => `<div class="empty"><div class="big">${icon}</div>${esc(text)}</div>`;

// ------------------------------------------------------------ sign in -----

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

  state.users = await api.get('/auth/users').catch(() => []);
  await loadProjects();
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
  openModal(first ? 'Create your first project' : 'New project', `
    <div class="field">
      <label for="pName">Project name</label>
      <input id="pName" placeholder="EngineerOS">
    </div>
    <div class="field">
      <label for="pDesc">Description</label>
      <textarea id="pDesc" rows="6" placeholder="What the system does, who uses it, the main workflows, and why it exists."></textarea>
    </div>
    <div class="field">
      <label for="pType">Project type / domain <span class="muted">(optional)</span></label>
      <input id="pType" placeholder="e.g. Smart waste management, healthcare, fintech">
    </div>
    <p class="error hidden" id="pError"></p>
    <button class="btn primary block" id="pSave">Create project</button>
  `, () => {
    el('pName').focus();
    el('pSave').addEventListener('click', async () => {
      try {
        const created = await api.post('/projects', { name: el('pName').value, description: el('pDesc').value, project_type: el('pType').value });
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
  board: ['Sprint board', 'Plan, assign and move work across the sprint'],
  bugs: ['Bug tracker', 'Defects by severity, with duplicate detection'],
  trace: ['Traceability', 'Requirement to story to task to defect, end to end'],
  review: ['AI code review', 'Static analysis for smells, security and complexity'],
  assistant: ['Assistant', 'Ask questions about this project in plain English'],
  team: ['Team', 'Members, roles and recent activity'],
};

const VIEWS = {
  dashboard: renderDashboard,
  requirements: renderRequirements,
  srs: renderSRS,
  uml: renderUML,
  board: renderBoard,
  bugs: renderBugs,
  trace: renderTrace,
  review: renderReview,
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
  openModal('Edit project description', `
    <div class="field"><label for="editName">Project name</label><input id="editName" value="${esc(state.project.name)}"></div>
    <div class="field"><label for="editDesc">Project description</label><textarea id="editDesc" rows="8">${esc(state.project.description || '')}</textarea></div>
    <div class="field"><label for="editType">Project type / domain <span class="muted">(optional)</span></label><input id="editType" value="${esc(state.project.project_type || '')}"></div>
    <p class="error hidden" id="editError"></p><button class="btn primary block" id="editSave">Save changes</button>
  `, () => {
    el('editSave').addEventListener('click', async () => {
      try {
        state.project = await api.patch(`/projects/${state.project.id}`, { name: el('editName').value, description: el('editDesc').value, project_type: el('editType').value });
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
  el('topbarActions').innerHTML = DIAGRAMS
    .map(([type, label]) => `<button class="btn small ${type === umlType ? 'primary' : ''}" data-uml="${type}">${label}</button>`)
    .join('');

  let diagramData;
  try {
    diagramData = await api.get(`${P()}/uml/${umlType}`);
  } catch (err) {
    if (err.message === 'Generate requirements first.') {
      el('view').innerHTML = `<div class="card workflow-empty"><div class="big">◇</div><h3>Generate requirements first</h3><p class="muted">UML diagrams are generated from this project's description and saved requirements.</p><button class="btn primary" id="goRequirements">Open Requirements</button></div>`;
      el('goRequirements').addEventListener('click', () => { state.view = 'requirements'; render(); });
      return;
    }
    throw err;
  }
  const { mermaid } = diagramData;
  el('view').innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin:0">${DIAGRAMS.find(([t]) => t === umlType)[1]} diagram</h3>
        <button class="btn small" id="copyMermaid">Copy Mermaid source</button>
      </div>
      <p class="muted" style="margin:0 0 12px">Generated from the selected project's actors, requirements and quality concerns.</p>
      <div class="mermaid-box" id="diagram"><span class="muted">Rendering…</span></div>
    </div>
    <div class="card">
      <h3>Mermaid source</h3>
      <pre class="code">${esc(mermaid)}</pre>
    </div>`;

  el('topbarActions').addEventListener('click', (e) => {
    const type = e.target.dataset?.uml;
    if (type) { umlType = type; render(); }
  });
  el('copyMermaid').addEventListener('click', () => {
    navigator.clipboard.writeText(mermaid).then(() => toast('Mermaid source copied.'));
  });

  const lib = await loadMermaid();
  const box = el('diagram');
  if (!lib) {
    box.innerHTML = '<span class="muted">Diagram rendering needs an internet connection. The Mermaid source below is complete and can be pasted into any Mermaid viewer.</span>';
    return;
  }
  try {
    const { svg } = await lib.render(`d${Date.now()}`, mermaid);
    box.innerHTML = svg;
  } catch (err) {
    box.innerHTML = `<span class="muted">This diagram could not be rendered: ${esc(err.message)}</span>`;
  }
}

// -------------------------------------------------------------- board -----

async function renderBoard() {
  const [tasks, { requirements }] = await Promise.all([
    api.get(`${P()}/tasks`),
    api.get(`${P()}/requirements`),
  ]);

  el('topbarActions').innerHTML = `
    <span class="muted" style="font-size:13.5px">${tasks.filter((t) => t.status === 'done').length} of ${tasks.length} done</span>
    <button class="btn primary" id="newTaskBtn">+ New task</button>`;

  el('view').innerHTML = `<div class="board">
    ${Object.entries(STATUS_LABEL).map(([status, label]) => {
      const column = tasks.filter((t) => t.status === status);
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
            sprint_id: state.project.sprints?.[0]?.id || null,
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
          <h5>Tasks (${c.tasks.length})</h5>
          ${c.tasks.length ? c.tasks.map((task) => `
            <div class="trace-item">
              <div>${esc(task.title)}</div>
              <div class="row" style="justify-content:space-between;margin-top:5px">
                <span class="pill ${task.status === 'done' ? 'green' : task.status === 'in_progress' ? 'blue' : 'grey'}">${STATUS_LABEL[task.status]}</span>
                <span class="muted" style="font-size:12px">${esc(task.assignee || 'Unassigned')} · ${task.points} pts</span>
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

// ---------------------------------------------------------- assistant -----

const chatLog = [];

async function renderAssistant() {
  el('view').innerHTML = `
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

// -------------------------------------------------------------- start -----

(async function init() {
  if (!token.get()) return;
  try {
    const { user } = await api.get('/auth/me');
    state.user = user;
    await startApp();
  } catch {
    token.clear();
  }
})();
