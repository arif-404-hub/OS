// Populates a demo account with a realistic project. Safe to re-run.
import { get, run, all, log } from './db.js';
import { hashPassword } from './auth.js';
import { analyzeRequirements } from './ai.js';

const BRIEF = `The system shall allow a project manager to upload a requirements document in PDF, DOCX or TXT format.
The system shall generate functional and non-functional requirements from an uploaded document.
The system shall produce an IEEE 830 software requirements specification that can be exported.
The system shall generate use case, class, sequence, activity and entity relationship diagrams from the requirement set.
An administrator shall be able to invite team members to an organization and assign them a role.
A project manager shall be able to plan sprints and assign story points to each task.
A tester shall be able to record defects against a task and set a severity.
The system shall trace every requirement through to the tasks and defects that implement it.
All passwords must be encrypted before they are stored in the database.
The system should respond to any page request within 400 ms under 500 concurrent users.
The platform must remain available 99.5 percent of the time during business hours.`;

const TASKS = [
  ['Design the requirements upload endpoint', 'done', 5, 0],
  ['Implement document parsing for PDF and DOCX', 'done', 8, 1],
  ['Build the requirement classification engine', 'done', 8, 1],
  ['Render the SRS document template', 'in_progress', 5, 2],
  ['Generate Mermaid source for each diagram type', 'in_progress', 8, 3],
  ['Add role-based access control to the API', 'review', 5, 4],
  ['Build the sprint board with drag and drop', 'todo', 5, 5],
  ['Add severity filters to the bug tracker', 'todo', 3, 6],
  ['Wire the traceability matrix to live data', 'backlog', 8, 7],
  ['Encrypt stored credentials with scrypt', 'done', 3, 8],
  ['Add a response time budget to CI', 'backlog', 5, 9],
];

const BUGS = [
  ['Upload fails silently for files over 10 MB', 'high', 'open', 'The request returns 200 but no requirements are created.'],
  ['Sequence diagram overflows its container on mobile', 'medium', 'open', 'The SVG is not scaled down below 480px width.'],
  ['Quality score shows NaN for empty requirements', 'low', 'resolved', 'Division by zero when the project has no requirements.'],
  ['Session token is not cleared on sign out', 'critical', 'open', 'The token stays in local storage after logging out.'],
];

function seedUser(name, email, role) {
  const existing = get('SELECT * FROM users WHERE email = ?', email);
  if (existing) return existing;
  const { lastInsertRowid } = run(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    name, email, hashPassword('demo1234'), role
  );
  return get('SELECT * FROM users WHERE id = ?', lastInsertRowid);
}

const demo = seedUser('Demo User', 'demo@engineeros.dev', 'PM');
const dev = seedUser('Md. Yeasin Arafat', 'yeasin@engineeros.dev', 'DEVELOPER');
const qa = seedUser('Purnata Choudhury', 'purnata@engineeros.dev', 'TESTER');

if (get('SELECT id FROM projects WHERE name = ? AND owner_id = ?', 'EngineerOS', demo.id)) {
  console.log('Demo project already exists - nothing to seed.');
  process.exit(0);
}

const { lastInsertRowid: pid } = run(
  'INSERT INTO projects (name, description, github_repo, owner_id) VALUES (?, ?, ?, ?)',
  'EngineerOS',
  'A unified SDLC platform that replaces disconnected tools with one AI-assisted workspace, covering requirement engineering, design, planning, development, testing and analytics.',
  'arif-404-hub/OS',
  demo.id
);

for (const u of [demo, dev, qa]) {
  run('INSERT OR IGNORE INTO members (project_id, user_id, role) VALUES (?, ?, ?)', pid, u.id, u.role);
}

const sprints = ['Sprint 1 - Foundations', 'Sprint 2 - Requirements engine', 'Sprint 3 - Delivery tooling']
  .map((name) => {
    const { lastInsertRowid } = run('INSERT INTO sprints (project_id, name, status) VALUES (?, ?, ?)', pid, name, 'active');
    return Number(lastInsertRowid);
  });
run('UPDATE sprints SET status = ? WHERE id = ?', 'completed', sprints[0]);

// Requirements, scored by the same engine the API uses.
let fi = 0;
let ni = 0;
const requirementIds = analyzeRequirements(BRIEF).map((r) => {
  const code = r.kind === 'functional'
    ? `FR-${String(++fi).padStart(3, '0')}`
    : `NFR-${String(++ni).padStart(3, '0')}`;
  const { lastInsertRowid } = run(
    `INSERT INTO requirements (project_id, code, kind, category, title, description, priority, story, acceptance, quality, issues)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    pid, code, r.kind, r.category, r.title, r.description, r.priority,
    r.story, JSON.stringify(r.acceptance), r.quality, JSON.stringify(r.issues)
  );
  return Number(lastInsertRowid);
});

const taskIds = TASKS.map(([title, status, points, reqIndex], i) => {
  const { lastInsertRowid } = run(
    `INSERT INTO tasks (project_id, sprint_id, requirement_id, title, status, points, assignee_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    pid,
    sprints[Math.min(2, Math.floor(i / 4))],
    requirementIds[reqIndex] ?? null,
    title, status, points,
    [demo.id, dev.id, qa.id][i % 3]
  );
  return Number(lastInsertRowid);
});

BUGS.forEach(([title, severity, status, detail], i) => {
  run('INSERT INTO bugs (project_id, task_id, title, detail, severity, status) VALUES (?, ?, ?, ?, ?, ?)',
    pid, taskIds[i] ?? null, title, detail, severity, status);
});

log(pid, demo.id, 'created the project "EngineerOS"');
log(pid, demo.id, `generated ${requirementIds.length} requirements from the project brief`);
log(pid, dev.id, 'completed "Implement document parsing for PDF and DOCX"');
log(pid, qa.id, 'reported bug "Session token is not cleared on sign out"');

console.log(`Seeded project #${pid} with ${requirementIds.length} requirements, ${taskIds.length} tasks and ${BUGS.length} bugs.`);
console.log('Sign in with  demo@engineeros.dev  /  demo1234');
