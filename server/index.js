// EngineerOS - AI-Powered Software Engineering Intelligence Platform
import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js';
import { router as authRouter } from './routes/auth.js';
import { router as projectsRouter } from './routes/projects.js';
import { router as requirementsRouter } from './routes/requirements.js';
import { router as workRouter } from './routes/work.js';
import { router as intelRouter } from './routes/intel.js';
import { router as organizationsRouter } from './routes/organizations.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(root, 'public')));
app.use('/OS', express.static(join(root, 'public')));

const apiRouter = express.Router();
apiRouter.get('/health', (_req, res) => res.json({ ok: true, service: 'EngineerOS', version: '1.0.0' }));
apiRouter.use('/auth', authRouter);
apiRouter.use('/organizations', organizationsRouter);
apiRouter.use('/projects', projectsRouter);
// Project-scoped routers each re-check membership through loadProject.
apiRouter.use('/projects/:pid/requirements', requirementsRouter);
apiRouter.use('/projects/:pid', workRouter);
apiRouter.use('/projects/:pid', intelRouter);
apiRouter.use((_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));

app.use('/api', apiRouter);
app.use('/OS/api', apiRouter);

// Any non-API path falls through to the single-page client.
app.get('*', (_req, res) => res.sendFile(join(root, 'public', 'index.html')));

app.use((err, _req, res, _next) => {
  console.error('[EngineerOS]', err);
  res.status(500).json({ error: err.message || 'Something went wrong on the server.' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`EngineerOS running at http://localhost:${port} (or http://127.0.0.1:${port})`);
});
