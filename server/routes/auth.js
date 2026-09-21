import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { all, get, run } from '../db.js';
import {
  hashPassword, verifyPassword, issueToken, requireAuth, ROLES, issueOAuthState, readOAuthState,
} from '../auth.js';

export const router = Router();

const oauthProviders = {
  google: {
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
  },
  github: {
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
  },
};

function appUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function callbackUrl(provider) {
  return `${appUrl()}/api/auth/${provider}/callback`;
}

function redirectWithOAuthError(message) {
  const url = new URL(appUrl());
  url.hash = `oauth_error=${encodeURIComponent(message)}`;
  return url.toString();
}

function parseCookies(header) {
  return Object.fromEntries(String(header || '').split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter((entry) => entry.length));
}

function oauthRedirect(provider, res) {
  const config = oauthProviders[provider];
  if (!config.clientId() || !config.clientSecret()) {
    return res.redirect(redirectWithOAuthError(`${provider} login is not configured on the server.`));
  }

  const state = issueOAuthState(provider);
  const query = new URLSearchParams({
    client_id: config.clientId(),
    redirect_uri: callbackUrl(provider),
    response_type: 'code',
    scope: config.scope,
    state,
  });
  if (provider === 'google') query.set('access_type', 'online');
  res.setHeader('Set-Cookie', `oauth_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`);
  return res.redirect(`${config.authorizationUrl}?${query}`);
}

function oauthUser(provider, profile, emails = []) {
  const email = provider === 'google'
    ? String(profile.email || '').trim().toLowerCase()
    : String(emails.find((entry) => entry.primary && entry.verified)?.email || emails.find((entry) => entry.verified)?.email || '').trim().toLowerCase();
  if (!email) throw new Error('The OAuth provider did not return a verified email address.');

  const name = String(provider === 'google' ? profile.name : profile.name || profile.login || '').trim() || email.split('@')[0];
  let user = get('SELECT id, name, email, role FROM users WHERE email = ?', email);
  if (!user) {
    const created = run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      name, email, hashPassword(randomBytes(32).toString('hex')), 'DEVELOPER'
    );
    user = get('SELECT id, name, email, role FROM users WHERE id = ?', created.lastInsertRowid);
    const organization = run('INSERT INTO organizations (name, owner_id) VALUES (?, ?)', `${name}'s Organization`, user.id);
    run('INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, ?)', organization.lastInsertRowid, user.id, 'OWNER');
  }
  return user;
}

router.get('/:provider', (req, res) => {
  const { provider } = req.params;
  if (!oauthProviders[provider]) return res.status(404).json({ error: 'Unsupported OAuth provider.' });
  return oauthRedirect(provider, res);
});

router.get('/:provider/callback', async (req, res) => {
  const { provider } = req.params;
  const config = oauthProviders[provider];
  const state = readOAuthState(req.query.state, provider);
  const cookies = parseCookies(req.headers.cookie);
  if (!config || !state || !cookies.oauth_state || cookies.oauth_state !== req.query.state) {
    return res.redirect(redirectWithOAuthError('OAuth verification failed. Please try again.'));
  }
  if (req.query.error) return res.redirect(redirectWithOAuthError(String(req.query.error)));

  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId(),
        client_secret: config.clientSecret(),
        code: String(req.query.code || ''),
        redirect_uri: callbackUrl(provider),
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error('OAuth token exchange failed.');

    const profileResponse = await fetch(
      provider === 'google' ? 'https://openidconnect.googleapis.com/v1/userinfo' : 'https://api.github.com/user',
      { headers: { Accept: 'application/json', Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'EngineerOS' } }
    );
    const profile = await profileResponse.json();
    if (!profileResponse.ok) throw new Error('Could not retrieve your OAuth profile.');
    const emails = provider === 'github'
      ? await (await fetch('https://api.github.com/user/emails', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'EngineerOS' },
      })).json()
      : [];
    const user = oauthUser(provider, profile, emails);
    const redirect = new URL(appUrl());
    redirect.hash = `oauth_token=${encodeURIComponent(issueToken(user))}`;
    res.setHeader('Set-Cookie', 'oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return res.redirect(redirect.toString());
  } catch (error) {
    console.error(`[EngineerOS] ${provider} OAuth login failed`, error);
    return res.redirect(redirectWithOAuthError('OAuth login failed. Please try again.'));
  }
});

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
  const organization = run('INSERT INTO organizations (name, owner_id) VALUES (?, ?)', `${name}'s Organization`, user.id);
  run('INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, ?)', organization.lastInsertRowid, user.id, 'OWNER');
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
