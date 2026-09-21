// PlantUML Use Case Diagram Generator

function esc(x) {
  return String(x || '').replace(/["\\]/g, '\\$&');
}

export function generateUseCase(model) {
  const lines = [
    '@startuml',
    'skinparam packageStyle rectangle',
    'skinparam actorStyle awesome',
    'skinparam shadowing false',
    'skinparam defaultFontName Segoe UI, Inter, sans-serif',
    `title ${esc(model.system?.name || 'System')} - Use Case Diagram`,
    '',
  ];

  for (const actor of model.actors || []) {
    lines.push(`actor "${esc(actor.name)}" as ${actor.id}`);
  }

  lines.push('', `rectangle "${esc(model.system?.name || 'System Boundary')}" {`);
  for (const uc of model.useCases || []) {
    lines.push(`  usecase "${esc(uc.name)}" as ${uc.id}`);
  }
  lines.push('}', '');

  // Associations between actors and use cases
  for (const uc of model.useCases || []) {
    for (const actorId of uc.actorIds || []) {
      lines.push(`${actorId} --> ${uc.id}`);
    }
  }

  // Include / extend relationships
  for (const r of model.relationships || []) {
    if (['include', 'extend', 'generalization'].includes(r.type)) {
      const label = r.type === 'include' ? '<<include>>' :
                    r.type === 'extend' ? '<<extend>>' : '';
      lines.push(`${r.source} ..> ${r.target}${label ? ` : ${label}` : ''}`);
    }
  }

  lines.push('', '@enduml');
  return lines.join('\n');
}
