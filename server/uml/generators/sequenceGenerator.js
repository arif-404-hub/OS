// PlantUML Sequence Diagram Generator

function esc(x) {
  return String(x || '').replace(/["\\]/g, '\\$&');
}

export function generateSequence(model) {
  const lines = [
    '@startuml',
    'autonumber',
    'skinparam shadowing false',
    'skinparam defaultFontName Segoe UI, Inter, sans-serif',
    `title ${esc(model.system?.name || 'System')} - Sequence Diagram`,
    '',
  ];

  for (const a of model.actors || []) {
    lines.push(`actor "${esc(a.name)}" as ${a.id}`);
  }

  for (const o of model.sequenceObjects || []) {
    const type = ['participant', 'boundary', 'control', 'entity'].includes(o.type) ? o.type : 'participant';
    lines.push(`${type} "${esc(o.name)}" as ${o.id}`);
  }

  lines.push('');

  for (const m of model.messages || []) {
    const arrow = m.return ? '-->' : '->';
    lines.push(`${m.from} ${arrow} ${m.to} : ${esc(m.text || '')}`);
  }

  lines.push('', '@enduml');
  return lines.join('\n');
}
