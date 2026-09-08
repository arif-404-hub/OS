// IEEE 830 style Software Requirements Specification generator.
import { detectConflicts } from './ai.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Build the SRS as a structured object so it can be rendered as HTML or Markdown.
 */
export function buildSRS(project, requirements, owner) {
  const functional = requirements.filter((r) => r.kind === 'functional');
  const nonFunctional = requirements.filter((r) => r.kind !== 'functional');
  const conflicts = detectConflicts(requirements);
  const avgQuality = requirements.length
    ? Math.round(requirements.reduce((s, r) => s + r.quality, 0) / requirements.length)
    : 0;

  const byCategory = new Map();
  for (const r of nonFunctional) {
    if (!byCategory.has(r.category || 'General')) byCategory.set(r.category || 'General', []);
    byCategory.get(r.category || 'General').push(r);
  }

  return { project, owner, functional, nonFunctional, byCategory, conflicts, avgQuality, date: today() };
}

export function buildUniversitySRS(project, requirements, owner, team = []) {
  return { ...buildSRS(project, requirements, owner), team };
}

const universitySections = [
  ['1. Introduction', ['1.1 Motivation', '1.2 Problem statement', '1.3 Main goal', '1.4 Stakeholders', '1.5 System development life cycle (SDLC)']],
  ['2. System Study and Requirement Gathering', ['2.1 Information gathering and system study', '2.1.1 Mission', '2.1.2 Vision', '2.2 Information sources', '2.3 Similar websites / platforms and key insights', '2.4 Current and desired state', '2.5 Survey methodology']],
  ['3. System Analysis', ['3.1 Gap analysis', '3.2 Feature list fixation', '3.2.1 Functional requirements', '3.2.2 Non-functional requirements', '3.3 Benchmarking', '3.4 SWOT analysis']],
  ['4. System Design', ['4.1 Context diagram', '4.2 State diagram', '4.3 Data-flow diagram', '4.4 Class diagram', '4.5 Sequence diagram', '4.6 Use-case diagram']],
  ['5. Prototype / UI Design', []], ['6. Conclusion', []],
];

function universitySectionContent(title, srs) {
  const { project, functional, nonFunctional } = srs;
  const description = esc(project.description || 'Project description not supplied.');
  if (title === '1. Introduction') return `<p>${description}</p><p>This chapter introduces <strong>${esc(project.name)}</strong>, its motivation, problem, goal, stakeholders, and development approach.</p>`;
  if (title === '2. System Study and Requirement Gathering') return `<p>The study is based on the project brief and analyzed requirements captured in EngineerOS.</p><p><strong>Mission:</strong> Deliver a dependable solution for the problem described in the project brief.</p><p><strong>Vision:</strong> Provide a maintainable system that meets stakeholder needs and evolves with user evidence.</p><p><strong>Information sources:</strong> Project brief, stakeholder discussions, user stories, acceptance criteria, and analyzed requirements.</p><p><strong>Survey methodology:</strong> Add survey population, sample size, questionnaire, collection method, and findings when available.</p>`;
  if (title === '3. System Analysis') return `<p>The current analysis contains ${functional.length} functional and ${nonFunctional.length} non-functional requirements.</p><p><strong>Gap analysis:</strong> Compare the current state in the project brief with the desired capabilities in the requirements below.</p><h3>Feature list</h3><ul>${functional.map((r) => `<li>${esc(r.title)}: ${esc(r.description)}</li>`).join('') || '<li>No functional features captured yet.</li>'}</ul><p><strong>Benchmarking and SWOT analysis:</strong> Add evidence-based comparisons and strengths, weaknesses, opportunities, and threats.</p>`;
  if (title === '4. System Design') return '<p class="placeholder">Insert the context, state, data-flow, class, sequence, and use-case diagrams for this project.</p>';
  if (title === '5. Prototype / UI Design') return '<p class="placeholder">Insert prototype screens, wireframes, design decisions, and usability notes here.</p>';
  return '<p>The proposed system addresses the stated problem through the analyzed requirements and provides a foundation for implementation and validation.</p>';
}

export function renderUniversitySRSHtml(srs) {
  const { project, owner, team, date, functional, nonFunctional } = srs;
  const teamNames = team?.length ? team.map((member) => `<li>${esc(member.name)}${member.role ? ` - ${esc(member.role)}` : ''}</li>`).join('') : '<li>Team members not recorded.</li>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>University SRS - ${esc(project.name)}</title><style>
  @page{margin:22mm}body{font:15px/1.65 Georgia,'Times New Roman',serif;color:#111;max-width:860px;margin:40px auto;padding:0 24px}h1{text-align:center;font-size:30px;margin:80px 0 8px}h2{font-size:21px;margin-top:38px;border-bottom:1px solid #d4d4d8;padding-bottom:6px}h3{font-size:17px;margin-top:26px}.cover{text-align:center;min-height:470px}.cover p{margin:8px 0}.meta{margin:30px auto;width:80%}table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border:1px solid #d4d4d8;padding:7px 10px;text-align:left}.toc a{color:#1d4ed8;text-decoration:none}.placeholder{padding:18px;background:#f4f4f5;border-left:3px solid #2563eb}footer{margin-top:50px;border-top:1px solid #d4d4d8;padding-top:12px;font-size:12.5px;color:#71717a}</style></head><body>
  <section class="cover"><h1>${esc(project.name)}</h1><h2>Software Requirements Specification</h2><p>University Project SRS</p><table class="meta"><tr><th>Project title</th><td>${esc(project.name)}</td></tr><tr><th>Prepared by</th><td>${esc(owner?.name || 'EngineerOS')}</td></tr><tr><th>Date</th><td>${esc(date)}</td></tr></table><h3>Team</h3><ul>${teamNames}</ul><h3>Abstract</h3><p>${esc(project.description || 'Project abstract not supplied.')}</p></section>
  <h2>Table of contents</h2><ol class="toc">${universitySections.map(([title]) => `<li><a href="#${title.split('.')[0]}">${esc(title)}</a></li>`).join('')}<li><a href="#references">References</a></li></ol>
  ${universitySections.map(([title, subsections]) => `<section id="${title.split('.')[0]}"><h2>${esc(title)}</h2>${subsections.map((subtitle) => `<h3>${esc(subtitle)}</h3>`).join('')}${universitySectionContent(title, srs)}${title === '3. System Analysis' ? `<h3>Requirement summary</h3><table><tr><th>Type</th><th>Count</th></tr><tr><td>Functional</td><td>${functional.length}</td></tr><tr><td>Non-functional</td><td>${nonFunctional.length}</td></tr></table>` : ''}</section>`).join('')}
  <section id="references"><h2>References</h2><p>Add books, papers, websites, survey instruments, and other sources consulted.</p></section><footer>Generated by EngineerOS on ${esc(date)}.</footer></body></html>`;
}

/** Render the SRS as a standalone, printable HTML document. */
export function renderSRSHtml(srs) {
  const { project, owner, functional, nonFunctional, byCategory, conflicts, avgQuality, date } = srs;

  const reqBlock = (r, index) => `
    <div class="req">
      <h4>${index}. ${esc(r.code)} &mdash; ${esc(r.title)}</h4>
      <table class="meta">
        <tr><th>Priority</th><td>${esc(r.priority)}</td>
            <th>Category</th><td>${esc(r.category || 'Functional')}</td>
            <th>Quality</th><td>${r.quality}/100</td></tr>
      </table>
      <p><strong>Description.</strong> ${esc(r.description)}</p>
      <p><strong>User story.</strong> <em>${esc(r.story)}</em></p>
      <p><strong>Acceptance criteria.</strong></p>
      <ol class="ac">${r.acceptance.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
      ${r.issues.length ? `<p class="warn"><strong>Review notes:</strong> ${r.issues.map(esc).join(' ')}</p>` : ''}
    </div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>SRS - ${esc(project.name)}</title>
<style>
  @page { margin: 22mm; }
  body { font: 15px/1.65 Georgia, 'Times New Roman', serif; color: #111; max-width: 860px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; border-bottom: 3px solid #2563eb; padding-bottom: 10px; margin-bottom: 4px; }
  h2 { font-size: 21px; margin-top: 38px; border-bottom: 1px solid #d4d4d8; padding-bottom: 6px; }
  h3 { font-size: 17px; margin-top: 26px; }
  h4 { font-size: 15px; margin: 22px 0 6px; color: #1d4ed8; }
  .sub { color: #52525b; font-style: italic; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 13.5px; }
  th, td { border: 1px solid #d4d4d8; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; font-weight: 700; }
  table.meta th { width: 90px; }
  .req { border-left: 3px solid #e4e4e7; padding-left: 16px; margin-bottom: 8px; }
  .ac { margin: 4px 0 10px 0; }
  .ac li { margin-bottom: 4px; }
  .warn { background: #fef3c7; border-left: 3px solid #d97706; padding: 8px 12px; font-size: 13.5px; }
  .toc a { color: #1d4ed8; text-decoration: none; }
  code { background: #f4f4f5; padding: 1px 5px; border-radius: 3px; font-size: 13px; }
  footer { margin-top: 50px; border-top: 1px solid #d4d4d8; padding-top: 12px; font-size: 12.5px; color: #71717a; }
</style></head><body>

<h1>Software Requirements Specification</h1>
<p class="sub">${esc(project.name)} &middot; Version 1.0 &middot; ${esc(date)}</p>

<table>
  <tr><th>Project</th><td>${esc(project.name)}</td></tr>
  <tr><th>Prepared by</th><td>${esc(owner?.name || 'EngineerOS')}${owner?.email ? ` (${esc(owner.email)})` : ''}</td></tr>
  <tr><th>Date</th><td>${esc(date)}</td></tr>
  <tr><th>Requirements</th><td>${functional.length} functional, ${nonFunctional.length} non-functional</td></tr>
  <tr><th>Average quality score</th><td>${avgQuality}/100</td></tr>
</table>

<h2>Table of contents</h2>
<ol class="toc">
  <li><a href="#s1">Introduction</a></li>
  <li><a href="#s2">Overall description</a></li>
  <li><a href="#s3">Specific requirements</a></li>
  <li><a href="#s4">Non-functional requirements</a></li>
  <li><a href="#s5">Requirements analysis</a></li>
</ol>

<h2 id="s1">1. Introduction</h2>
<h3>1.1 Purpose</h3>
<p>This document specifies the software requirements for <strong>${esc(project.name)}</strong>.
It describes the intended functionality, the constraints under which the system must operate, and the
criteria by which each requirement will be verified. The intended audience is the development team,
the quality assurance team, and the project stakeholders.</p>

<h3>1.2 Scope</h3>
<p>${esc(project.description || 'No project description was supplied.')}</p>

<h3>1.3 Definitions and abbreviations</h3>
<table>
  <tr><th>Term</th><th>Meaning</th></tr>
  <tr><td><code>FR</code></td><td>Functional requirement - a behaviour the system must exhibit.</td></tr>
  <tr><td><code>NFR</code></td><td>Non-functional requirement - a quality attribute or constraint.</td></tr>
  <tr><td><code>SRS</code></td><td>Software Requirements Specification (this document).</td></tr>
  <tr><td>Quality score</td><td>Automated 0-100 rating of how testable and unambiguous a requirement is.</td></tr>
</table>

<h3>1.4 References</h3>
<p>IEEE Std 830-1998, <em>Recommended Practice for Software Requirements Specifications</em>.</p>

<h2 id="s2">2. Overall description</h2>
<h3>2.1 Product perspective</h3>
<p>${esc(project.name)} is a web application composed of a browser-based client, a REST API,
and a relational data store. The client communicates with the API over HTTPS using JSON, and
authenticates with a signed bearer token issued at sign-in.</p>

<h3>2.2 User classes and characteristics</h3>
<table>
  <tr><th>Role</th><th>Responsibilities</th></tr>
  <tr><td>Administrator</td><td>Manages accounts, roles and platform-wide settings.</td></tr>
  <tr><td>Project manager</td><td>Owns the backlog, plans sprints and monitors delivery.</td></tr>
  <tr><td>Developer</td><td>Implements tasks and responds to code review findings.</td></tr>
  <tr><td>Tester</td><td>Verifies acceptance criteria and raises defects.</td></tr>
  <tr><td>Designer</td><td>Produces interface designs against the requirements.</td></tr>
  <tr><td>Client</td><td>Reviews progress and approves delivered scope.</td></tr>
</table>

<h3>2.3 Assumptions and dependencies</h3>
<ul>
  <li>Users access the system through a current desktop or mobile web browser.</li>
  <li>The application server has persistent disk storage available for the database.</li>
  <li>Requirement statements supplied to the analysis engine are written in English.</li>
</ul>

<h2 id="s3">3. Specific requirements</h2>
${functional.length
    ? functional.map((r, i) => reqBlock(r, `3.${i + 1}`)).join('')
    : '<p><em>No functional requirements have been captured yet.</em></p>'}

<h2 id="s4">4. Non-functional requirements</h2>
${nonFunctional.length
    ? [...byCategory.entries()].map(([category, items], ci) => `
        <h3>4.${ci + 1} ${esc(category)}</h3>
        ${items.map((r, i) => reqBlock(r, `4.${ci + 1}.${i + 1}`)).join('')}`).join('')
    : '<p><em>No non-functional requirements have been captured yet.</em></p>'}

<h2 id="s5">5. Requirements analysis</h2>
<h3>5.1 Quality summary</h3>
<table>
  <tr><th>Metric</th><th>Value</th></tr>
  <tr><td>Total requirements</td><td>${functional.length + nonFunctional.length}</td></tr>
  <tr><td>Average quality score</td><td>${avgQuality}/100</td></tr>
  <tr><td>Requirements with review notes</td><td>${srs.functional.concat(srs.nonFunctional).filter((r) => r.issues.length).length}</td></tr>
  <tr><td>Detected conflicts and overlaps</td><td>${conflicts.length}</td></tr>
</table>

<h3>5.2 Conflicts and overlaps</h3>
${conflicts.length
    ? `<table><tr><th>Requirements</th><th>Type</th><th>Detail</th></tr>
       ${conflicts.map((c) => `<tr><td>${esc(c.a)} / ${esc(c.b)}</td><td>${esc(c.type)}</td><td>${esc(c.detail)}</td></tr>`).join('')}
       </table>`
    : '<p>No conflicting or overlapping requirements were detected.</p>'}

<footer>Generated by EngineerOS on ${esc(date)}. Print this page to PDF to distribute it.</footer>
</body></html>`;
}

/** Render the same SRS as Markdown, for version control or export. */
export function renderSRSMarkdown(srs) {
  const { project, owner, functional, nonFunctional, conflicts, avgQuality, date } = srs;
  const block = (r, n) => [
    `#### ${n}. ${r.code} - ${r.title}`,
    '',
    `- **Priority:** ${r.priority}  |  **Category:** ${r.category || 'Functional'}  |  **Quality:** ${r.quality}/100`,
    `- **Description:** ${r.description}`,
    `- **User story:** _${r.story}_`,
    '- **Acceptance criteria:**',
    ...r.acceptance.map((c, i) => `  ${i + 1}. ${c}`),
    ...(r.issues.length ? ['', `> **Review notes:** ${r.issues.join(' ')}`] : []),
    '',
  ].join('\n');

  return [
    `# Software Requirements Specification`,
    '',
    `**${project.name}** - Version 1.0 - ${date}`,
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Prepared by | ${owner?.name || 'EngineerOS'} |`,
    `| Requirements | ${functional.length} functional, ${nonFunctional.length} non-functional |`,
    `| Average quality | ${avgQuality}/100 |`,
    '',
    '## 1. Introduction',
    '',
    `### 1.1 Purpose`,
    `This document specifies the software requirements for **${project.name}**, the constraints it must satisfy, and the criteria by which each requirement is verified.`,
    '',
    '### 1.2 Scope',
    project.description || 'No project description was supplied.',
    '',
    '## 2. Specific requirements',
    '',
    ...(functional.length ? functional.map((r, i) => block(r, `2.${i + 1}`)) : ['_None captured yet._', '']),
    '## 3. Non-functional requirements',
    '',
    ...(nonFunctional.length ? nonFunctional.map((r, i) => block(r, `3.${i + 1}`)) : ['_None captured yet._', '']),
    '## 4. Requirements analysis',
    '',
    `- Total requirements: ${functional.length + nonFunctional.length}`,
    `- Average quality score: ${avgQuality}/100`,
    `- Detected conflicts and overlaps: ${conflicts.length}`,
    '',
    ...(conflicts.length
      ? ['| Requirements | Type | Detail |', '| --- | --- | --- |',
         ...conflicts.map((c) => `| ${c.a} / ${c.b} | ${c.type} | ${c.detail} |`), '']
      : ['No conflicting or overlapping requirements were detected.', '']),
    `_Generated by EngineerOS on ${date}._`,
  ].join('\n');
}

export function renderUniversitySRSMarkdown(srs) {
  const { project, owner, team, date, functional, nonFunctional } = srs;
  const lines = [`# ${project.name}`, '', '## Software Requirements Specification', '', `**Project title:** ${project.name}`, `**Prepared by:** ${owner?.name || 'EngineerOS'}`, `**Date:** ${date}`, '', '## Team', ...(team?.length ? team.map((member) => `- ${member.name}${member.role ? ` - ${member.role}` : ''}`) : ['- Team members not recorded.']), '', '## Abstract', project.description || 'Project abstract not supplied.', '', '## Table of contents', ...universitySections.map(([title]) => `- ${title}`), '- References', ''];
  universitySections.forEach(([title, subsections]) => {
    lines.push(`## ${title}`, '', ...subsections.map((subtitle) => `### ${subtitle}`), '');
    if (title === '1. Introduction') lines.push(project.description || 'Project description not supplied.', '', 'This chapter introduces the project motivation, problem, goal, stakeholders, and SDLC.', '');
    else if (title === '2. System Study and Requirement Gathering') lines.push('Sources: project brief, stakeholder discussions, user stories, acceptance criteria, and analyzed requirements.', '', 'Survey methodology: add population, sample, questionnaire, collection method, and findings when available.', '');
    else if (title === '3. System Analysis') lines.push(`The current analysis contains ${functional.length} functional and ${nonFunctional.length} non-functional requirements.`, '', '### Functional requirements', ...functional.map((r) => `- **${r.code} ${r.title}:** ${r.description}`), '', '### Non-functional requirements', ...nonFunctional.map((r) => `- **${r.code} ${r.title}:** ${r.description}`), '');
    else if (title === '4. System Design') lines.push('Insert the context, state, data-flow, class, sequence, and use-case diagrams here.', '');
    else if (title === '5. Prototype / UI Design') lines.push('Insert prototype screens, wireframes, design decisions, and usability notes here.', '');
    else lines.push('The proposed system addresses the stated problem through the analyzed requirements.', '');
  });
  lines.push('## References', '', 'Add books, papers, websites, survey instruments, and other sources consulted.', '', `_Generated by EngineerOS on ${date}._`);
  return lines.join('\n');
}
