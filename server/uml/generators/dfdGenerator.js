// PlantUML Data Flow Diagram (DFD Level 1) Generator

function esc(x) {
  return String(x || '').replace(/["\\]/g, '\\$&');
}

export function generateDFD(model) {
  const systemName = esc(model.system?.name || 'System');
  const lines = [
    '@startuml',
    'left to right direction',
    'skinparam shadowing false',
    'skinparam defaultFontName Segoe UI, Inter, sans-serif',
    `title ${systemName} - Data Flow Diagram (DFD Level 1)`,
    '',
  ];

  for (const e of model.externalEntities || []) {
    lines.push(`rectangle "${esc(e.name)}" as ${e.id}`);
  }

  lines.push('');

  for (const p of model.processes || []) {
    lines.push(`circle "${p.id}\\n${esc(p.name)}" as ${p.id}`);
  }

  lines.push('');

  for (const s of model.dataStores || []) {
    lines.push(`database "${esc(s.name)}" as ${s.id}`);
  }

  lines.push('');

  for (const f of model.dataFlows || []) {
    lines.push(`${f.source} --> ${f.target} : ${esc(f.label || '')}`);
  }

  lines.push('', '@enduml');
  return lines.join('\n');
}
