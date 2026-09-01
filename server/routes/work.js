// Sprint planning, the kanban board and bug tracking.
import { Router } from 'express';
import { all, get, run, log } from '../db.js';
import { requireAuth } from '../auth.js';
import { loadProject } from './projects.js';

export const router = Router({ mergeParams: true });
router.use(requireAuth, loadProject);

const STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const BUG_STATUSES = ['open', 'in_progress', 'resolved'];

const taskQuery = `
  SELECT t.*, u.name AS assignee_name, r.code AS requirement_code, s.name AS sprint_name
  FROM tasks t
  LEFT JOIN users u        ON u.id = t.assignee_id
  LEFT JOIN requirements r ON r.id = t.requirement_id
  LEFT JOIN sprints s      ON s.id = t.sprint_id
  WHERE t.project_id = ?
  ORDER BY t.id`;

const listTasks = (pid) => all(taskQuery, pid);
const listBugs = (pid) => all(`
  SELECT b.*, t.title AS task_title FROM bugs b
  LEFT JOIN tasks t ON t.id = b.task_id
  WHERE b.project_id = ? ORDER BY
    CASE b.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, b.id DESC`, pid);

// ---------------------------------------------------------------- tasks ----

router.get('/tasks', (req, res) => res.json(listTasks(req.project.id)));

router.post('/tasks', (req, res) => {
  const title = String(req.body.title || '').trim();
  if (title.length < 3) return res.status(400).json({ error: 'Give the task a title of at least 3 characters.' });

  const status = STATUSES.includes(req.body.status) ? req.body.status : 'backlog';
  const points = Math.max(0, Math.min(21, Number(req.body.points) || 3));

  run(`INSERT INTO tasks (project_id, sprint_id, requirement_id, title, description, status, points, assignee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    req.project.id,
    req.body.sprint_id ? Number(req.body.sprint_id) : null,
    req.body.requirement_id ? Number(req.body.requirement_id) : null,
    title, String(req.body.description || '').trim(), status, points,
    req.body.assignee_id ? Number(req.body.assignee_id) : null);

  log(req.project.id, req.user.id, `created task "${title}"`);
  res.status(201).json(listTasks(req.project.id));
});

router.patch('/tasks/:tid', (req, res) => {
  const task = get('SELECT * FROM tasks WHERE id = ? AND project_id = ?', Number(req.params.tid), req.project.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const status = STATUSES.includes(req.body.status) ? req.body.status : task.status;
  run(`UPDATE tasks SET title = ?, description = ?, status = ?, points = ?, assignee_id = ?, requirement_id = ?, sprint_id = ?
       WHERE id = ?`,
    String(req.body.title ?? task.title).trim(),
    String(req.body.description ?? task.description).trim(),
    status,
    Math.max(0, Math.min(21, Number(req.body.points ?? task.points))),
    req.body.assignee_id === undefined ? task.assignee_id : (req.body.assignee_id ? Number(req.body.assignee_id) : null),
    req.body.requirement_id === undefined ? task.requirement_id : (req.body.requirement_id ? Number(req.body.requirement_id) : null),
    req.body.sprint_id === undefined ? task.sprint_id : (req.body.sprint_id ? Number(req.body.sprint_id) : null),
    task.id);

  if (status !== task.status) log(req.project.id, req.user.id, `moved "${task.title}" to ${status.replace('_', ' ')}`);
  res.json(listTasks(req.project.id));
});

router.delete('/tasks/:tid', (req, res) => {
  run('DELETE FROM tasks WHERE id = ? AND project_id = ?', Number(req.params.tid), req.project.id);
  res.json(listTasks(req.project.id));
});

// -------------------------------------------------------------- sprints ----

router.post('/sprints', (req, res) => {
  const name = String(req.body.name || '').trim() || `Sprint ${all('SELECT id FROM sprints WHERE project_id = ?', req.project.id).length + 1}`;
  run('INSERT INTO sprints (project_id, name) VALUES (?, ?)', req.project.id, name);
  res.status(201).json(all('SELECT * FROM sprints WHERE project_id = ? ORDER BY id', req.project.id));
});

router.patch('/sprints/:sid', (req, res) => {
  const status = req.body.status === 'completed' ? 'completed' : 'active';
  run('UPDATE sprints SET status = ? WHERE id = ? AND project_id = ?', status, Number(req.params.sid), req.project.id);
  res.json(all('SELECT * FROM sprints WHERE project_id = ? ORDER BY id', req.project.id));
});

// ----------------------------------------------------------------- bugs ----

router.get('/bugs', (req, res) => res.json(listBugs(req.project.id)));

router.post('/bugs', (req, res) => {
  const title = String(req.body.title || '').trim();
  if (title.length < 3) return res.status(400).json({ error: 'Give the bug a title of at least 3 characters.' });

  // Flag likely duplicates rather than blocking the report.
  const words = new Set(title.toLowerCase().match(/[a-z]{4,}/g) || []);
  const duplicate = listBugs(req.project.id).find((b) => {
    const other = new Set(b.title.toLowerCase().match(/[a-z]{4,}/g) || []);
    const shared = [...words].filter((w) => other.has(w)).length;
    return shared / Math.max(1, Math.min(words.size, other.size)) > 0.7;
  });

  run('INSERT INTO bugs (project_id, task_id, title, detail, severity, status) VALUES (?, ?, ?, ?, ?, ?)',
    req.project.id,
    req.body.task_id ? Number(req.body.task_id) : null,
    title, String(req.body.detail || '').trim(),
    SEVERITIES.includes(req.body.severity) ? req.body.severity : 'medium',
    'open');

  log(req.project.id, req.user.id, `reported bug "${title}"`);
  res.status(201).json({ bugs: listBugs(req.project.id), duplicateOf: duplicate ? duplicate.title : null });
});

router.patch('/bugs/:bid', (req, res) => {
  const bug = get('SELECT * FROM bugs WHERE id = ? AND project_id = ?', Number(req.params.bid), req.project.id);
  if (!bug) return res.status(404).json({ error: 'Bug not found.' });

  run('UPDATE bugs SET status = ?, severity = ? WHERE id = ?',
    BUG_STATUSES.includes(req.body.status) ? req.body.status : bug.status,
    SEVERITIES.includes(req.body.severity) ? req.body.severity : bug.severity,
    bug.id);
  res.json(listBugs(req.project.id));
});

router.delete('/bugs/:bid', (req, res) => {
  run('DELETE FROM bugs WHERE id = ? AND project_id = ?', Number(req.params.bid), req.project.id);
  res.json(listBugs(req.project.id));
});
