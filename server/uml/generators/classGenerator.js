// PlantUML Class Diagram Generator

function vis(v) {
  return { public: '+', private: '-', protected: '#', package: '~' }[v] || '+';
}

function esc(x) {
  return String(x || '').replace(/["\\]/g, '\\$&');
}

export function generateClass(model) {
  const lines = [
    '@startuml',
    'skinparam classAttributeIconSize 0',
    'skinparam shadowing false',
    'skinparam defaultFontName Segoe UI, Inter, sans-serif',
    `title ${esc(model.system?.name || 'System')} - Class Diagram`,
    '',
  ];

  for (const c of model.classes || []) {
    lines.push(`class "${esc(c.name)}" as ${c.id} {`);
    for (const a of c.attributes || []) {
      lines.push(`  ${vis(a.visibility)}${a.name}: ${a.type || 'String'}`);
    }

    if ((c.attributes || []).length && (c.methods || []).length) {
      lines.push('  --');
    }

    for (const m of c.methods || []) {
      const params = (m.parameters || [])
        .map(p => `${p.name}: ${p.type || 'Any'}`).join(', ');
      lines.push(`  ${vis(m.visibility)}${m.name}(${params}): ${m.returnType || 'void'}`);
    }
    lines.push('}', '');
  }

  const arrows = {
    association: '--',
    generalization: '--|>',
    realization: '..|>',
    dependency: '..>',
    aggregation: 'o--',
    composition: '*--',
  };

  const classIds = new Set((model.classes || []).map(c => c.id));
  for (const r of model.relationships || []) {
    if (classIds.has(r.source) && classIds.has(r.target) && arrows[r.type]) {
      const sMult = r.sourceMultiplicity ? ` "${r.sourceMultiplicity}"` : '';
      const tMult = r.targetMultiplicity ? ` "${r.targetMultiplicity}"` : '';
      lines.push(`${r.source}${sMult} ${arrows[r.type]}${tMult} ${r.target}`);
    }
  }

  lines.push('', '@enduml');
  return lines.join('\n');
}
