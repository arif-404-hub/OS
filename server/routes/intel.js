// UML generation, traceability, analytics and AI code review.
import { Router } from 'express';
import { all, get } from '../db.js';
import { requireAuth } from '../auth.js';
import { loadProject } from './projects.js';
import { generateUML, reviewCode, detectConflicts } from '../ai.js';
import { projectRequirements } from './requirements.js';
import { buildSRS, buildUniversitySRS, renderSRSHtml, renderSRSMarkdown, renderUniversitySRSHtml, renderUniversitySRSMarkdown } from '../srs.js';
import { getProjectContext } from '../project-context.js';

export const router = Router({ mergeParams: true });
router.use(requireAuth, loadProject);

export const DIAGRAM_TYPES = [
  ['usecase', 'Use case'], ['class', 'Class'], ['sequence', 'Sequence'], ['activity', 'Activity'],
  ['er', 'Entity relationship'], ['state', 'State'], ['component', 'Component'], ['deployment', 'Deployment'],
];

router.get('/uml/:type', (req, res) => {
  if (!DIAGRAM_TYPES.some(([t]) => t === req.params.type)) {
    return res.status(400).json({ error: `Unknown diagram type "${req.params.type}".` });
  }
  const context = getProjectContext(req.project);
  if (!context.generatedRequirements.length) {
    return res.status(409).json({ error: 'Generate requirements first.', context });
  }
  const mermaid = generateUML(req.params.type, req.project, context.generatedRequirements);
  res.json({ type: req.params.type, mermaid, context });
});

// Requirement -> user story -> task -> bug, end to end.
router.get('/traceability', (req, res) => {
  const requirements = projectRequirements(req.project.id);
  const tasks = all(`SELECT t.*, u.name AS assignee_name FROM tasks t
                     LEFT JOIN users u ON u.id = t.assignee_id WHERE t.project_id = ?`, req.project.id);
  const bugs = all('SELECT * FROM bugs WHERE project_id = ?', req.project.id);

  const chain = requirements.map((r) => {
    const linked = tasks.filter((t) => t.requirement_id === r.id);
    const linkedBugs = bugs.filter((b) => linked.some((t) => t.id === b.task_id));
    const done = linked.filter((t) => t.status === 'done').length;
    return {
      requirement: { id: r.id, code: r.code, title: r.title, kind: r.kind, priority: r.priority, quality: r.quality },
      story: r.story,
      tasks: linked.map((t) => ({ id: t.id, title: t.title, status: t.status, points: t.points, assignee: t.assignee_name })),
      bugs: linkedBugs.map((b) => ({ id: b.id, title: b.title, severity: b.severity, status: b.status })),
      coverage: linked.length ? Math.round((done / linked.length) * 100) : 0,
      orphaned: linked.length === 0,
    };
  });

  const orphanTasks = tasks.filter((t) => !t.requirement_id)
    .map((t) => ({ id: t.id, title: t.title, status: t.status }));

  res.json({
    chain,
    orphanTasks,
    covered: chain.filter((c) => !c.orphaned).length,
    total: chain.length,
    coveragePercent: chain.length ? Math.round((chain.filter((c) => !c.orphaned).length / chain.length) * 100) : 0,
  });
});

router.get('/analytics', (req, res) => {
  const pid = req.project.id;
  const requirements = projectRequirements(pid);
  const tasks = all('SELECT * FROM tasks WHERE project_id = ?', pid);
  const bugs = all('SELECT * FROM bugs WHERE project_id = ?', pid);
  const sprints = all('SELECT * FROM sprints WHERE project_id = ? ORDER BY id', pid);

  const byStatus = Object.fromEntries(
    ['backlog', 'todo', 'in_progress', 'review', 'done'].map((s) => [s, tasks.filter((t) => t.status === s).length])
  );
  const bySeverity = Object.fromEntries(
    ['critical', 'high', 'medium', 'low'].map((s) => [s, bugs.filter((b) => b.severity === s && b.status !== 'resolved').length])
  );

  const totalPoints = tasks.reduce((s, t) => s + t.points, 0);
  const donePoints = tasks.filter((t) => t.status === 'done').reduce((s, t) => s + t.points, 0);
  const openBugs = bugs.filter((b) => b.status !== 'resolved');
  const avgQuality = requirements.length
    ? Math.round(requirements.reduce((s, r) => s + r.quality, 0) / requirements.length) : 0;

  // Velocity: completed points per sprint, plus an unassigned bucket.
  const velocity = sprints.map((s) => ({
    sprint: s.name,
    planned: tasks.filter((t) => t.sprint_id === s.id).reduce((sum, t) => sum + t.points, 0),
    completed: tasks.filter((t) => t.sprint_id === s.id && t.status === 'done').reduce((sum, t) => sum + t.points, 0),
  }));

  // Technical debt proxy: unresolved defects and low-quality requirements, weighted.
  const debt = Math.min(100,
    openBugs.filter((b) => b.severity === 'critical').length * 15 +
    openBugs.filter((b) => b.severity === 'high').length * 8 +
    openBugs.filter((b) => b.severity === 'medium').length * 3 +
    requirements.filter((r) => r.quality < 60).length * 5);

  const conflicts = detectConflicts(requirements);
  const traced = tasks.filter((t) => t.requirement_id).length;
  const traceability = tasks.length ? Math.round((traced / tasks.length) * 100) : 0;
  const progress = totalPoints ? Math.round((donePoints / totalPoints) * 100) : 0;

  // Overall health blends delivery progress, requirement quality, debt and traceability.
  const health = Math.max(0, Math.min(100, Math.round(
    progress * 0.3 + avgQuality * 0.3 + (100 - debt) * 0.25 + traceability * 0.15
  )));

  const risks = [];
  if (openBugs.some((b) => b.severity === 'critical')) risks.push({ level: 'high', text: `${openBugs.filter((b) => b.severity === 'critical').length} critical defect(s) are still open.` });
  if (avgQuality && avgQuality < 70) risks.push({ level: 'high', text: `Average requirement quality is ${avgQuality}/100 - several statements are ambiguous.` });
  if (conflicts.length) risks.push({ level: 'medium', text: `${conflicts.length} requirement conflict(s) or overlap(s) need review.` });
  if (tasks.length && traceability < 60) risks.push({ level: 'medium', text: `Only ${traceability}% of tasks are linked to a requirement.` });
  if (byStatus.review > byStatus.in_progress + byStatus.todo && byStatus.review > 2) risks.push({ level: 'medium', text: 'Work is piling up in review - the team is blocked on approvals.' });
  if (!requirements.length) risks.push({ level: 'medium', text: 'No requirements captured yet - start with the Requirements tab.' });
  if (!risks.length) risks.push({ level: 'low', text: 'No significant risks detected. The project is on track.' });

  res.json({
    totals: {
      requirements: requirements.length,
      functional: requirements.filter((r) => r.kind === 'functional').length,
      nonFunctional: requirements.filter((r) => r.kind !== 'functional').length,
      tasks: tasks.length,
      bugs: bugs.length,
      openBugs: openBugs.length,
      sprints: sprints.length,
      members: get('SELECT COUNT(*) c FROM members WHERE project_id = ?', pid).c,
    },
    byStatus,
    bySeverity,
    points: { total: totalPoints, done: donePoints, progress },
    velocity,
    avgQuality,
    debt,
    traceability,
    conflicts: conflicts.length,
    health,
    risks,
    activity: all(`SELECT a.message, a.created_at, u.name AS user FROM activity a
                   LEFT JOIN users u ON u.id = a.user_id
                   WHERE a.project_id = ? ORDER BY a.id DESC LIMIT 12`, pid),
  });
});

router.post('/review', (req, res) => {
  const code = String(req.body.code || '');
  if (code.trim().length < 10) return res.status(400).json({ error: 'Paste at least a few lines of code to review.' });
  res.json(reviewCode(code, String(req.body.filename || 'snippet.js')));
});

// Natural-language questions answered from the project's own data.
router.post('/ask', (req, res) => {
  const q = String(req.body.question || '').toLowerCase();
  const pid = req.project.id;
  const tasks = all('SELECT * FROM tasks WHERE project_id = ?', pid);
  const bugs = all('SELECT * FROM bugs WHERE project_id = ?', pid);
  const requirements = projectRequirements(pid);
  const match = (...words) => words.some((w) => q.includes(w));
  // "1 defect" / "2 defects"
  const plural = (n, word, suffix = 's') => `${n} ${word}${n === 1 ? '' : suffix}`;

  let answer;
  if (match('bug', 'defect', 'issue')) {
    const open = bugs.filter((b) => b.status !== 'resolved');
    answer = open.length
      ? `There ${open.length === 1 ? 'is' : 'are'} ${plural(open.length, 'unresolved defect')}: ${Object.entries(
          open.reduce((acc, b) => ({ ...acc, [b.severity]: (acc[b.severity] || 0) + 1 }), {})
        ).map(([s, n]) => `${n} ${s}`).join(', ')}. The oldest is "${open[0].title}".`
      : 'There are no unresolved defects on this project.';
  } else if (match('progress', 'status', 'how far', 'done', 'complete')) {
    const total = tasks.reduce((s, t) => s + t.points, 0);
    const done = tasks.filter((t) => t.status === 'done').reduce((s, t) => s + t.points, 0);
    answer = tasks.length
      ? `${tasks.filter((t) => t.status === 'done').length} of ${plural(tasks.length, 'task')} are done (${done} of ${total} story points, ${total ? Math.round((done / total) * 100) : 0}%). ${tasks.filter((t) => t.status === 'in_progress').length} are in progress.`
      : 'No tasks have been created yet, so there is no progress to report.';
  } else if (match('requirement', 'scope', 'feature')) {
    answer = requirements.length
      ? `The project has ${requirements.length} requirements: ${requirements.filter((r) => r.kind === 'functional').length} functional and ${requirements.filter((r) => r.kind !== 'functional').length} non-functional. Average quality score is ${Math.round(requirements.reduce((s, r) => s + r.quality, 0) / requirements.length)}/100, and ${requirements.filter((r) => r.issues.length).length} have review notes.`
      : 'No requirements have been captured yet. Use the Requirements tab to generate them from a brief.';
  } else if (match('who', 'assign', 'team', 'workload')) {
    const load = new Map();
    for (const t of tasks.filter((t) => t.status !== 'done')) {
      const who = all('SELECT name FROM users WHERE id = ?', t.assignee_id)[0]?.name || 'Unassigned';
      load.set(who, (load.get(who) || 0) + t.points);
    }
    answer = load.size
      ? `Open workload by person: ${[...load.entries()].sort((a, b) => b[1] - a[1]).map(([n, p]) => `${n} (${p} pts)`).join(', ')}.`
      : 'No open tasks are currently assigned.';
  } else if (match('risk', 'blocked', 'concern')) {
    const critical = bugs.filter((b) => b.severity === 'critical' && b.status !== 'resolved').length;
    const lowQuality = requirements.filter((r) => r.quality < 60).length;
    answer = `Main risks: ${plural(critical, 'critical defect')} open, ${plural(lowQuality, 'requirement')} below a quality score of 60, and ${plural(tasks.filter((t) => t.status === 'review').length, 'task')} waiting in review.`;
  } else {
    answer = `I can answer questions about progress, requirements, defects, workload and risks on "${req.project.name}". Try asking "what is our progress?" or "how many bugs are open?".`;
  }

  res.json({ question: req.body.question, answer });
});

// ------------------------------------------------------------------ SRS ----

router.get('/srs', (req, res) => {
  const context = getProjectContext(req.project);
  if (!context.generatedRequirements.length) {
    return res.status(409).json({ error: 'Generate requirements first.', context });
  }
  const owner = get('SELECT name, email FROM users WHERE id = ?', req.project.owner_id);
  const isUniversity = req.query.type === 'university';
  const team = all('SELECT u.name, m.role FROM members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? ORDER BY u.name', req.project.id);
  const srs = isUniversity
    ? buildUniversitySRS(req.project, context.generatedRequirements, owner, team)
    : buildSRS(req.project, context.generatedRequirements, owner);
  const slug = req.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

  if (req.query.format === 'markdown') {
    res.type('text/markdown; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="SRS-${isUniversity ? 'University-' : ''}${slug}.md"`)
      .send(isUniversity ? renderUniversitySRSMarkdown(srs) : renderSRSMarkdown(srs));
    return;
  }

  const html = isUniversity ? renderUniversitySRSHtml(srs) : renderSRSHtml(srs);
  if (req.query.download === '1') {
    res.set('Content-Disposition', `attachment; filename="SRS-${isUniversity ? 'University-' : ''}${slug}.html"`);
  }
  res.type('html').send(html);
});
