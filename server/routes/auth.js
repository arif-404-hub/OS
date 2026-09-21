import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { all, get, run } from '../db.js';
import { hashPassword, verifyPassword, issueToken, requireAuth, ROLES } from '../auth.js';

export const router = Router();

const OAUTH_PROVIDERS = new Set(['google', 'github']);
const oauthStates = new Map();
const appUrl = (req) => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (req && req.headers && req.headers.host) {
    const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    return `${proto}://${req.headers.host}`;
  }
  return 'http://localhost:3000';
};

function providerSettings(provider, req) {
  const settings = provider === 'google'
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scope: 'openid email profile' }
    : { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET, authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token', scope: 'read:user user:email' };
  return { ...settings, redirect: `${appUrl(req)}/api/auth/${provider}/callback` };
}

function configured(provider) {
  const settings = providerSettings(provider);
  return Boolean(settings.clientId && settings.clientSecret);
}

function oauthRedirect(params, req) {
  return `${appUrl(req)}/#${new URLSearchParams(params)}`;
}

function socialUser(provider, profile, accessToken = '') {
  const providerId = String(profile.id || profile.sub || '');
  let email = String(profile.email || '').trim().toLowerCase();
  if (!email && profile.login) {
    email = `${profile.login}@users.noreply.github.com`;
  }
  if (!providerId || !email) throw new Error('The provider did not return a verified email address.');

  const githubUsername = provider === 'github' ? String(profile.login || '').trim() : '';

  const linked = get('SELECT id, user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?', provider, providerId);
  let user = linked
    ? get('SELECT id, name, email, role, github_username, github_token FROM users WHERE id = ?', linked.user_id)
    : get('SELECT id, name, email, role, github_username, github_token FROM users WHERE email = ?', email);
  if (!user) {
    const name = String(profile.name || profile.login || email.split('@')[0]).trim().slice(0, 120) || 'EngineerOS user';
    const { lastInsertRowid } = run(
      'INSERT INTO users (name, email, password, role, github_username, github_token) VALUES (?, ?, ?, ?, ?, ?)',
      name, email, hashPassword(randomBytes(32).toString('hex')), 'DEVELOPER', githubUsername, provider === 'github' ? accessToken : ''
    );
    user = get('SELECT id, name, email, role, github_username, github_token FROM users WHERE id = ?', lastInsertRowid);
  } else if (provider === 'github') {
    run(
      'UPDATE users SET github_username = CASE WHEN COALESCE(github_username, "") = "" THEN ? ELSE github_username END, github_token = CASE WHEN ? != "" THEN ? ELSE github_token END WHERE id = ?',
      githubUsername, accessToken, accessToken, user.id
    );
    user = get('SELECT id, name, email, role, github_username, github_token FROM users WHERE id = ?', user.id);
  }
  if (!linked) {
    run('INSERT INTO oauth_accounts (user_id, provider, provider_user_id, username, access_token) VALUES (?, ?, ?, ?, ?)',
      user.id, provider, providerId, githubUsername, accessToken);
  } else if (provider === 'github' && accessToken) {
    run('UPDATE oauth_accounts SET username = ?, access_token = ? WHERE id = ?', githubUsername, accessToken, linked.id);
  }
  return user;
}

router.get('/providers', (_req, res) => res.json({ google: configured('google'), github: configured('github') }));

router.post('/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = ROLES.includes(req.body.role) ? req.body.role : 'DEVELOPER';
  const githubUsername = String(req.body.github_username || '').trim().replace(/^@/, '');

  if (name.length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (get('SELECT id FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'That email is already registered.' });

  const { lastInsertRowid } = run(
    'INSERT INTO users (name, email, password, role, github_username) VALUES (?, ?, ?, ?, ?)',
    name, email, hashPassword(password), role, githubUsername
  );
  const row = get('SELECT id, name, email, role, github_username, github_token FROM users WHERE id = ?', lastInsertRowid);
  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    github_username: row.github_username || '',
    has_github_token: Boolean(row.github_token),
  };
  res.status(201).json({ token: issueToken(user), user });
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const row = get('SELECT * FROM users WHERE email = ?', email);
  if (!row || !verifyPassword(String(req.body.password || ''), row.password)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    github_username: row.github_username || '',
    has_github_token: Boolean(row.github_token),
  };
  res.json({ token: issueToken(user), user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      github_username: req.user.github_username || '',
      has_github_token: Boolean(req.user.github_token),
    },
  });
});

/** PATCH /api/auth/profile - Update user profile and GitHub identity */
router.patch('/profile', requireAuth, (req, res) => {
  const name = req.body.name !== undefined ? String(req.body.name).trim() : req.user.name;
  const githubUsername = req.body.github_username !== undefined ? String(req.body.github_username).trim().replace(/^@/, '') : (req.user.github_username || '');
  const githubToken = req.body.github_token !== undefined ? String(req.body.github_token).trim() : (req.user.github_token || '');

  if (name && name.length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters.' });
  }

  run('UPDATE users SET name = ?, github_username = ?, github_token = ? WHERE id = ?',
    name || req.user.name, githubUsername, githubToken, req.user.id);

  const updated = get('SELECT id, name, email, role, github_username, github_token FROM users WHERE id = ?', req.user.id);
  res.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      github_username: updated.github_username || '',
      has_github_token: Boolean(updated.github_token),
    },
  });
});

// Used to populate assignee pickers.
router.get('/users', requireAuth, (_req, res) =>
  res.json(all('SELECT id, name, email, role, github_username FROM users ORDER BY name')));

router.get('/:provider', (req, res) => {
  const provider = req.params.provider;
  if (!OAUTH_PROVIDERS.has(provider)) return res.status(404).json({ error: 'Unknown authentication provider.' });
  if (!configured(provider)) return res.status(503).json({ error: `${provider} login is not configured on this server.` });
  const state = randomBytes(24).toString('hex');
  oauthStates.set(state, { provider, expires: Date.now() + 10 * 60 * 1000 });
  const settings = providerSettings(provider, req);
  const params = { client_id: settings.clientId, redirect_uri: settings.redirect, response_type: 'code', scope: settings.scope, state };
  res.redirect(`${settings.authorize}?${new URLSearchParams(params)}`);
});

router.get('/:provider/callback', async (req, res) => {
  const provider = req.params.provider;
  const saved = oauthStates.get(req.query.state);
  oauthStates.delete(req.query.state);
  if (!OAUTH_PROVIDERS.has(provider) || !saved || saved.provider !== provider || saved.expires < Date.now()) {
    return res.redirect(oauthRedirect({ auth_error: 'Invalid or expired social login session.' }, req));
  }
  if (req.query.error) {
    const desc = req.query.error_description || req.query.error;
    return res.redirect(oauthRedirect({ auth_error: `Social login was cancelled: ${desc}` }, req));
  }

  try {
    const settings = providerSettings(provider, req);
    const tokenBody = {
      grant_type: 'authorization_code',
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      code: req.query.code,
      redirect_uri: settings.redirect,
    };
    const tokenResponse = await fetch(settings.token, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenBody).toString(),
      signal: AbortSignal.timeout(15000),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'The provider did not issue an access token.');
    }
    const headers = { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json', 'User-Agent': 'EngineerOS' };
    const profileResponse = await fetch(provider === 'google' ? 'https://openidconnect.googleapis.com/v1/userinfo' : 'https://api.github.com/user', { headers, signal: AbortSignal.timeout(15000) });
    const profile = await profileResponse.json();
    if (!profileResponse.ok) throw new Error(profile.message || 'Could not read the social account profile.');
    if (provider === 'google' && profile.email_verified !== true && profile.email_verified !== 'true') {
      throw new Error('Google did not verify this email address.');
    }
    if (provider === 'github') {
      const emailsResponse = await fetch('https://api.github.com/user/emails', { headers, signal: AbortSignal.timeout(15000) });
      if (emailsResponse.ok) {
        const emails = await emailsResponse.json();
        if (Array.isArray(emails)) {
          profile.email = emails.find((email) => email.primary && email.verified)?.email 
            || emails.find((email) => email.verified)?.email
            || emails[0]?.email;
        }
      }
      if (!profile.email && profile.login) {
        profile.email = `${profile.login}@users.noreply.github.com`;
      }
    }
    const user = socialUser(provider, profile, tokenData.access_token);
    return res.redirect(oauthRedirect({ auth_token: issueToken(user) }, req));
  } catch (error) {
    return res.redirect(oauthRedirect({ auth_error: error.message || 'Social login failed.' }, req));
  }
});
