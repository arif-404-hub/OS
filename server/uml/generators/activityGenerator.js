// PlantUML Activity Diagram Generator

function esc(x) {
  return String(x || '').replace(/["\\]/g, '\\$&');
}

export function generateActivity(model) {
  const lines = [
    '@startuml',
    'skinparam shadowing false',
    'skinparam defaultFontName Segoe UI, Inter, sans-serif',
    `title ${esc(model.system?.name || 'System')} - Activity Diagram`,
    '',
    'start',
  ];

  const processes = model.processes || [];
  processes.forEach((p, idx) => {
    lines.push(`:${esc(p.name)};`);
    if (idx === 1 && processes.length > 3) {
      lines.push('if (Validation Success?) then (yes)');
    }
  });

  if (processes.length > 3) {
    lines.push('else (no)');
    lines.push('  :Handle Error & Return Status;');
    lines.push('endif');
  }

  lines.push('stop', '@enduml');
  return lines.join('\n');
}
