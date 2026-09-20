import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { all, get, run } from '../db.js';
import { requireAuth } from '../auth.js';

export const router = Router();
router.use(requireAuth);

const organizationFor = (req, id) => get(`
  SELECT o.* FROM organizations o
  JOIN organization_members om ON om.organization_id = o.id
  WHERE o.id = ? AND om.user_id = ?`, id, req.user.id);

const canManage = (req, organization) => organization
  && (organization.owner_id === req.user.id
    || get('SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?', organization.id, req.user.id)?.role === 'ADMIN'
    || req.user.role === 'ADMIN');

router.get('/', (req, res) => res.json(all(`
  SELECT o.*, om.role,
    (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id) AS member_count,
    (SELECT COUNT(*) FROM teams t WHERE t.organization_id = o.id) AS team_count,
    (SELECT COUNT(*) FROM departments d WHERE d.organization_id = o.id) AS department_count
  FROM organizations o JOIN organization_members om ON om.organization_id = o.id
  WHERE om.user_id = ? ORDER BY o.name`, req.user.id)));

router.post('/', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Organization name must be at least 2 characters.' });
  const created = run('INSERT INTO organizations (name, owner_id) VALUES (?, ?)', name, req.user.id);
  run('INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, ?)', created.lastInsertRowid, req.user.id, 'OWNER');
  res.status(201).json(get('SELECT * FROM organizations WHERE id = ?', created.lastInsertRowid));
});

router.get('/:oid', (req, res) => {
  const organization = organizationFor(req, Number(req.params.oid));
  if (!organization) return res.status(404).json({ error: 'Organization not found.' });
  res.json({
    ...organization,
    members: all(`SELECT u.id, u.name, u.email, om.role FROM organization_members om
      JOIN users u ON u.id = om.user_id WHERE om.organization_id = ? ORDER BY u.name`, organization.id),
    departments: all('SELECT * FROM departments WHERE organization_id = ? ORDER BY name', organization.id),
    teams: all(`SELECT t.*, d.name AS department_name,
      (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count
      FROM teams t LEFT JOIN departments d ON d.id = t.department_id
      WHERE t.organization_id = ? ORDER BY t.name`, organization.id),
    invitations: canManage(req, organization)
      ? all('SELECT id, email, role, status, expires_at, created_at FROM invitations WHERE organization_id = ? ORDER BY id DESC', organization.id)
      : [],
  });
});

router.post('/:oid/departments', (req, res) => {
  const organization = organizationFor(req, Number(req.params.oid));
  if (!canManage(req, organization)) return res.status(403).json({ error: 'Only organization administrators can manage departments.' });
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Department name must be at least 2 characters.' });
  run('INSERT INTO departments (organization_id, name) VALUES (?, ?)', organization.id, name);
  res.status(201).json(all('SELECT * FROM departments WHERE organization_id = ? ORDER BY name', organization.id));
});

router.post('/:oid/teams', (req, res) => {
  const organization = organizationFor(req, Number(req.params.oid));
  if (!canManage(req, organization)) return res.status(403).json({ error: 'Only organization administrators can manage teams.' });
  const name = String(req.body.name || '').trim();
  const departmentId = req.body.department_id ? Number(req.body.department_id) : null;
  if (name.length < 2) return res.status(400).json({ error: 'Team name must be at least 2 characters.' });
  if (departmentId && !get('SELECT id FROM departments WHERE id = ? AND organization_id = ?', departmentId, organization.id)) {
    return res.status(400).json({ error: 'Department does not belong to this organization.' });
  }
  run('INSERT INTO teams (organization_id, department_id, name) VALUES (?, ?, ?)', organization.id, departmentId, name);
  res.status(201).json(all('SELECT * FROM teams WHERE organization_id = ? ORDER BY name', organization.id));
});

router.post('/:oid/teams/:tid/members', (req, res) => {
  const organization = organizationFor(req, Number(req.params.oid));
  if (!canManage(req, organization)) return res.status(403).json({ error: 'Only organization administrators can manage team members.' });
  const team = get('SELECT id FROM teams WHERE id = ? AND organization_id = ?', Number(req.params.tid), organization.id);
  const user = get('SELECT id FROM users WHERE id = ?', Number(req.body.user_id));
  if (!team || !user || !get('SELECT 1 FROM organization_members WHERE organization_id = ? AND user_id = ?', organization.id, user.id)) {
    return res.status(400).json({ error: 'The team and member must belong to this organization.' });
  }
  run('INSERT OR REPLACE INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)', team.id, user.id, String(req.body.role || 'MEMBER'));
  res.status(201).json({ ok: true });
});

router.patch('/:oid/members/:uid', (req, res) => {
  const organization = organizationFor(req, Number(req.params.oid));
  if (!canManage(req, organization)) return res.status(403).json({ error: 'Only organization administrators can change permissions.' });
  const role = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'].includes(req.body.role) ? req.body.role : null;
  if (!role || !get('SELECT 1 FROM organization_members WHERE organization_id = ? AND user_id = ?', organization.id, Number(req.params.uid))) {
    return res.status(400).json({ error: 'Invalid member or permission.' });
  }
  run('UPDATE organization_members SET role = ? WHERE organization_id = ? AND user_id = ?', role, organization.id, Number(req.params.uid));
  res.json({ ok: true });
});

router.post('/:oid/invitations', (req, res) => {
  const organization = organizationFor(req, Number(req.params.oid));
  if (!canManage(req, organization)) return res.status(403).json({ error: 'Only organization administrators can invite members.' });
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = ['ADMIN', 'MEMBER', 'VIEWER'].includes(req.body.role) ? req.body.role : 'MEMBER';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const token = randomBytes(24).toString('hex');
  const invitation = run(`INSERT INTO invitations (organization_id, email, role, token, invited_by, expires_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', '+7 days'))`, organization.id, email, role, token, req.user.id);
  res.status(201).json({ id: invitation.lastInsertRowid, email, role, token });
});

router.post('/invitations/:token/accept', (req, res) => {
  const invitation = get(`SELECT * FROM invitations WHERE token = ? AND status = 'pending'
    AND expires_at > datetime('now')`, req.params.token);
  if (!invitation) return res.status(404).json({ error: 'Invitation is invalid or expired.' });
  if (req.user.email.toLowerCase() !== invitation.email) return res.status(403).json({ error: 'Sign in with the invited email address.' });
  run('INSERT OR IGNORE INTO organization_members (organization_id, user_id, role) VALUES (?, ?, ?)', invitation.organization_id, req.user.id, invitation.role);
  run("UPDATE invitations SET status = 'accepted' WHERE id = ?", invitation.id);
  res.json({ ok: true, organization_id: invitation.organization_id });
});
