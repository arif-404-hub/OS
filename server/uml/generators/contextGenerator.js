// PlantUML Context Diagram (Level 0 DFD) Generator

function esc(x) {
  return String(x || '').replace(/["\\]/g, '\\$&');
}

export function generateContext(model) {
  const systemName = esc(model.system?.name || 'System');
  const lines = [
    '@startuml',
    'left to right direction',
    'skinparam shadowing false',
    'skinparam defaultFontName Segoe UI, Inter, sans-serif',
    `title ${systemName} - Context Diagram (Level 0)`,
    '',
    `circle "0\\n${systemName}" as system`,
    '',
  ];

  for (const e of model.externalEntities || []) {
    lines.push(`rectangle "${esc(e.name)}" as ${e.id}`);
  }

  lines.push('');

  const flows = model.contextFlows || [];
  if (flows.length) {
    for (const f of flows) {
      lines.push(`${f.source} --> ${f.target} : ${esc(f.label || '')}`);
    }
  } else {
    for (const e of model.externalEntities || []) {
      lines.push(`${e.id} --> system : Data Input`);
      lines.push(`system --> ${e.id} : Information Output`);
    }
  }

  lines.push('', '@enduml');
  return lines.join('\n');
}
