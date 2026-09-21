// PlantUML Entity Relationship (ER) Diagram Generator

function esc(x) {
  return String(x || '').replace(/["\\]/g, '\\$&');
}

export function generateER(model) {
  const lines = [
    '@startuml',
    'skinparam shadowing false',
    'skinparam defaultFontName Segoe UI, Inter, sans-serif',
    `title ${esc(model.system?.name || 'System')} - Entity Relationship Diagram`,
    '',
  ];

  for (const c of model.classes || []) {
    lines.push(`entity "${esc(c.name)}" as ${c.id} {`);
    lines.push(`  * ${c.id}_id : number <<generated>>`);
    lines.push('  --');
    for (const a of c.attributes || []) {
      lines.push(`  ${a.name} : ${a.type || 'text'}`);
    }
    lines.push('}', '');
  }

  const classIds = new Set((model.classes || []).map(c => c.id));
  for (const r of model.relationships || []) {
    if (classIds.has(r.source) && classIds.has(r.target)) {
      lines.push(`${r.source} ||--o{ ${r.target} : "${esc(r.type || 'relates')}"`);
    }
  }

  lines.push('', '@enduml');
  return lines.join('\n');
}
