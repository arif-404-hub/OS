// PlantUML Deployment Diagram Generator

function esc(x) {
  return String(x || '').replace(/["\\]/g, '\\$&');
}

export function generateDeployment(model) {
  const lines = [
    '@startuml',
    'skinparam shadowing false',
    'skinparam defaultFontName Segoe UI, Inter, sans-serif',
    `title ${esc(model.system?.name || 'System')} - Deployment Diagram`,
    '',
  ];

  const nodes = model.deploymentNodes || [];
  const components = model.components || [];

  for (const n of nodes) {
    const keyword = n.type === 'executionEnvironment' ? 'node' : 'node';
    lines.push(`${keyword} "${esc(n.name)}" as ${n.id} {`);

    const nodeComps = components.filter(c => c.node === n.id);
    for (const c of nodeComps) {
      lines.push(`  component "${esc(c.name)}" as ${c.id}`);
    }

    for (const a of n.artifacts || []) {
      lines.push(`  artifact "${esc(a)}"`);
    }

    lines.push('}', '');
  }

  // Connect nodes sequentially if no explicit connections
  for (let i = 0; i < nodes.length - 1; i++) {
    lines.push(`${nodes[i].id} -- ${nodes[i + 1].id} : HTTPS / TCP`);
  }

  lines.push('', '@enduml');
  return lines.join('\n');
}
