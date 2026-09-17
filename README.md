# EngineerOS

**AI-Powered Software Engineering Intelligence Platform** — one workspace for the whole
software development life cycle, from a plain-English brief through to delivery analytics.

Group 09 — Purnata Choudhury (0112330429), Md. Yeasin Arafat (0112330292)

---

## Running it

```bash
npm install
npm run seed
npm start
```

Then open <http://localhost:3000> and sign in with:

| Email | Password |
| --- | --- |
| `demo@engineeros.dev` | `demo1234` |

`npm run seed` is optional — it creates a demo project with 11 requirements, 11 tasks and
4 defects so every screen has something in it. Without it you start from an empty account.

Requires **Node.js 22 or newer** (it uses the built-in `node:sqlite` driver).
The only npm dependency is Express.

---

## What it does

| Module | What it gives you |
| --- | --- |
| **Auth & RBAC** | Register/sign in, six roles (Admin, PM, Developer, Tester, Designer, Client). Passwords hashed with scrypt; sessions are HMAC-signed bearer tokens. |
| **Requirement engineering** | Paste a brief; the engine splits it into statements, classifies each as functional or non-functional (Performance, Security, Reliability, Usability, Scalability, Maintainability, Portability), writes a user story and Given/When/Then acceptance criteria, flags vague wording, and scores each requirement 0–100 for testability. |
| **Conflict detection** | Finds requirements that overlap or contradict each other. |
| **SRS generator** | Choose an IEEE-830 specification or a university project format with title, team, abstract, chapters, analysis, design placeholders and references; view in-app and export as HTML, Markdown or PDF (via print). |
| **UML generator** | Eight diagram types — use case, class, sequence, activity, ER, state, component, deployment — emitted as Mermaid and rendered in the browser. |
| **Sprint board** | Kanban with drag-and-drop across five columns, story points, assignees, and a link from each task back to its requirement. |
| **Bug tracker** | Severity levels, status workflow, task linking, and duplicate detection on report. |
| **Traceability** | The full chain: requirement → user story → task → defect, with coverage percentages and a list of untraced tasks. |
| **AI code review** | Static analysis for hard-coded credentials, SQL string concatenation, `eval`, XSS via `innerHTML`, empty catch blocks, loose equality, leftover debug logging, nesting depth and cyclomatic complexity. Returns a graded score with a fix for each finding. |
| **Analytics** | Project health score, velocity per sprint, technical-debt index, traceability coverage and an auto-generated risk register. |
| **Assistant** | Answers plain-English questions ("what is our progress?", "who has the most work?") from the project's live data. |

---

## How the AI works

The analysis engine in `server/ai.js` is **rule-based and deterministic** — it needs no API
key, no network, and returns the same result every time, which matters for a demo and for
grading. It handles the linguistics that make requirement engineering hard:

- **Subject detection.** "The system shall allow a librarian to register a book" yields
  *As a librarian, I want to register a book*; "The platform must remain available 99.9% of
  the time" yields *I want the system to remain available…*; and passive statements like
  "All passwords must be encrypted" become *I need the system to guarantee that…* rather
  than the nonsense "I want to be encrypted".
- **Domain roles.** Actors the keyword list has never seen (student, librarian, cashier) are
  recovered from constructions like "*A student shall be able to…*".
- **Quality scoring.** Deductions for vague terms, missing modal verbs, compound statements,
  and non-functional requirements stated without a measurable number.

If you want a real LLM in the loop, set `OLLAMA_URL` (and optionally `OLLAMA_MODEL`) and
`refineWithLLM()` will call it, silently falling back to the heuristics when it is
unavailable.

---

## Layout

```
server/
  index.js          Express app, static hosting, route mounting
  db.js             SQLite schema and query helpers (node:sqlite)
  auth.js           scrypt hashing, signed tokens, requireAuth / requireRole
  ai.js             requirement analysis, conflict detection, UML, code review
  srs.js            IEEE-830 document rendering (HTML + Markdown)
  seed.js           demo data
  routes/
    auth.js         register, login, me, users
    projects.js     projects, members, loadProject membership guard
    requirements.js list, generate, add, delete
    work.js         tasks, sprints, bugs
    intel.js        UML, traceability, analytics, code review, assistant, SRS
public/
  index.html        app shell and sign-in screen
  css/style.css
  js/api.js         fetch wrapper (bearer token, error unwrapping)
  js/app.js         views and interactions
data/
  engineeros.db     created on first run
```

Every project-scoped route runs through `loadProject`, which rejects anyone who is not a
member (admins excepted), so authorisation is enforced server-side rather than by hiding
buttons in the UI.

---

## API

All routes except `/api/health`, `/api/auth/register` and `/api/auth/login` require an
`Authorization: Bearer <token>` header.

```
POST   /api/auth/register | login          GET  /api/auth/me | users
GET    /api/projects                       POST /api/projects
GET    /api/projects/:id                   PATCH/DELETE /api/projects/:id
POST   /api/projects/:id/members           DELETE /api/projects/:id/members/:uid

GET    /api/projects/:id/requirements
POST   /api/projects/:id/requirements           (add one, scored on the way in)
POST   /api/projects/:id/requirements/generate  (analyse a brief)
DELETE /api/projects/:id/requirements/:rid

GET    /api/projects/:id/tasks             POST /api/projects/:id/tasks
PATCH  /api/projects/:id/tasks/:tid        DELETE /api/projects/:id/tasks/:tid
POST   /api/projects/:id/sprints           PATCH /api/projects/:id/sprints/:sid
GET    /api/projects/:id/bugs              POST /api/projects/:id/bugs
PATCH  /api/projects/:id/bugs/:bid         DELETE /api/projects/:id/bugs/:bid

GET    /api/projects/:id/srs               (?format=markdown, ?download=1)
GET    /api/projects/:id/uml/:type         (usecase|class|sequence|activity|er|state|component|deployment)
GET    /api/projects/:id/traceability
GET    /api/projects/:id/analytics
POST   /api/projects/:id/review            POST /api/projects/:id/ask
```

---

## Notes on the stack

The proposal specified Next.js + NestJS + PostgreSQL + Prisma. This implementation uses
**Express + vanilla ES modules + SQLite** instead, because the brief was to keep it simple:
the whole thing installs one npm package and runs with `npm start`, with no database server,
no build step and no containers. The architecture is the same — REST API, token auth,
relational schema with foreign keys, separated route/service layers — so the concepts the
proposal describes are all present and demonstrable.

Set `PORT` to run on a different port and `JWT_SECRET` to change the token signing key
before deploying anywhere real.
