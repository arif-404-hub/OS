import { Router } from 'express';
import { all, run, log } from '../db.js';
import { requireAuth } from '../auth.js';
import { loadProject } from './projects.js';
import { analyzeRequirements, detectConflicts } from '../ai.js';

export const router = Router({ mergeParams: true });
router.use(requireAuth, loadProject);

/** Requirements for a project, ready for the UI. */
export function projectRequirements(projectId) {
  return all('SELECT * FROM requirements WHERE project_id = ? ORDER BY kind DESC, id', projectId)
    .map((r) => ({ ...r, acceptance: JSON.parse(r.acceptance || '[]'), issues: JSON.parse(r.issues || '[]') }));
}

router.get('/', (req, res) => {
  const requirements = projectRequirements(req.project.id);
  res.json({ requirements, conflicts: detectConflicts(requirements) });
});

// Analyse a free-form brief and store the extracted requirements.
router.post('/generate', (req, res) => {
  const text = String(req.body.text || '').trim();
  if (text.length < 20) return res.status(400).json({ error: 'Provide at least a couple of sentences to analyse.' });

  const existing = projectRequirements(req.project.id);
  const startF = existing.filter((r) => r.kind === 'functional').length + 1;
  const startN = existing.filter((r) => r.kind !== 'functional').length + 1;

  let fi = 0;
  let ni = 0;
  const created = analyzeRequirements(text).map((r) => {
    const code = r.kind === 'functional'
      ? `FR-${String(startF + fi++).padStart(3, '0')}`
      : `NFR-${String(startN + ni++).padStart(3, '0')}`;

    const { lastInsertRowid } = run(
      `INSERT INTO requirements (project_id, code, kind, category, title, description, priority, story, acceptance, quality, issues)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      req.project.id, code, r.kind, r.category, r.title, r.description, r.priority,
      r.story, JSON.stringify(r.acceptance), r.quality, JSON.stringify(r.issues)
    );
    return { ...r, code, id: Number(lastInsertRowid), project_id: req.project.id };
  });

  if (!created.length) return res.status(400).json({ error: 'No requirement statements could be extracted from that text.' });
  log(req.project.id, req.user.id, `generated ${created.length} requirements from a brief`);

  const requirements = projectRequirements(req.project.id);
  res.status(201).json({ created: created.length, requirements, conflicts: detectConflicts(requirements) });
});

// Add one requirement by hand; it is still scored and checked for ambiguity.
router.post('/', (req, res) => {
  const description = String(req.body.description || '').trim();
  if (description.length < 12) return res.status(400).json({ error: 'Describe the requirement in a full sentence.' });

  const [analysed] = analyzeRequirements(description);
  if (!analysed) return res.status(400).json({ error: 'That statement could not be parsed as a requirement.' });

  const existing = projectRequirements(req.project.id);
  const kind = req.body.kind === 'non-functional' ? 'non-functional' : analysed.kind;
  const n = existing.filter((r) => r.kind === kind).length + 1;
  const code = `${kind === 'functional' ? 'FR' : 'NFR'}-${String(n).padStart(3, '0')}`;

  run(`INSERT INTO requirements (project_id, code, kind, category, title, description, priority, story, acceptance, quality, issues)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    req.project.id, code, kind, analysed.category, String(req.body.title || analysed.title),
    description, req.body.priority || analysed.priority, analysed.story,
    JSON.stringify(analysed.acceptance), analysed.quality, JSON.stringify(analysed.issues));

  log(req.project.id, req.user.id, `added requirement ${code}`);
  const requirements = projectRequirements(req.project.id);
  res.status(201).json({ requirements, conflicts: detectConflicts(requirements) });
});

router.delete('/:rid', (req, res) => {
  run('DELETE FROM requirements WHERE id = ? AND project_id = ?', Number(req.params.rid), req.project.id);
  const requirements = projectRequirements(req.project.id);
  res.json({ requirements, conflicts: detectConflicts(requirements) });
});
