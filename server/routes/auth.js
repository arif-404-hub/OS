import { Router } from 'express';
import { all, get, run } from '../db.js';
import { hashPassword, verifyPassword, issueToken, requireAuth, ROLES } from '../auth.js';

export const router = Router();

router.post('/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = ROLES.includes(req.body.role) ? req.body.role : 'DEVELOPER';

  if (name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (get('SELECT id FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'That email is already registered.' });

  const { lastInsertRowid } = run(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    name, email, hashPassword(password), role
  );
  const user = get('SELECT id, name, email, role FROM users WHERE id = ?', lastInsertRowid);
  res.status(201).json({ token: issueToken(user), user });
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const row = get('SELECT * FROM users WHERE email = ?', email);
  if (!row || !verifyPassword(String(req.body.password || ''), row.password)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  res.json({ token: issueToken(user), user });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

// Used to populate assignee pickers.
router.get('/users', requireAuth, (_req, res) =>
  res.json(all('SELECT id, name, email, role FROM users ORDER BY name')));
