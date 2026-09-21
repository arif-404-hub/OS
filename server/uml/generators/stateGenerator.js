// PlantUML State Machine Diagram Generator

function esc(x) {
  return String(x || '').replace(/["\\]/g, '\\$&');
}

export function generateState(model) {
  const lines = [
    '@startuml',
    'skinparam shadowing false',
    'skinparam defaultFontName Segoe UI, Inter, sans-serif',
    `title ${esc(model.system?.name || 'System')} - State Machine Diagram`,
    '',
  ];

  const states = model.states || [];
  if (states.length) {
    lines.push(`[*] --> ${states[0].id}`);
    for (const s of states) {
      lines.push(`state "${esc(s.name)}" as ${s.id}`);
    }

    const transitions = model.stateTransitions || [];
    for (const t of transitions) {
      const eventLabel = t.event ? ` : ${esc(t.event)}` : '';
      lines.push(`${t.from} --> ${t.to}${eventLabel}`);
    }

    lines.push(`${states[states.length - 1].id} --> [*]`);
  }

  lines.push('', '@enduml');
  return lines.join('\n');
}
