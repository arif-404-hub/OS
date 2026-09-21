// PlantUML Swimlane Diagram Generator

function esc(x) {
  return String(x || '').replace(/["\\]/g, '\\$&');
}

export function generateSwimlane(model) {
  const lines = [
    '@startuml',
    'skinparam shadowing false',
    'skinparam defaultFontName Segoe UI, Inter, sans-serif',
    `title ${esc(model.system?.name || 'System')} - Swimlane Diagram`,
    '',
  ];

  const actors = model.actors || [{ id: 'actor_user', name: 'User' }];
  const processes = model.processes || [];

  lines.push(`|${esc(actors[0].name)}|`);
  lines.push('start');

  processes.forEach((p, idx) => {
    const actor = actors.find(a => a.id === p.actorId) || actors[idx % actors.length];
    lines.push(`|${esc(actor.name)}|`);
    lines.push(`:${esc(p.name)};`);
  });

  lines.push(`|${esc(actors[0].name)}|`);
  lines.push('stop', '@enduml');
  return lines.join('\n');
}
