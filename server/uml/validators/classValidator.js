// Class Diagram Validator
import { UML_RULES } from '../rules/umlRules.js';

export function validateClass(model) {
  const errors = [];
  const classes = model.classes || [];

  if (!classes.length) {
    errors.push({ rule: 'CLASS_EMPTY', message: 'Class diagram requires at least one class.' });
  }

  const validVisibilities = new Set(UML_RULES.class.visibility);
  const classIds = new Set(classes.map(c => c.id));

  for (const c of classes) {
    if (!c.name) {
      errors.push({ rule: 'CLASS_NO_NAME', message: `Class (${c.id}) has no name.` });
    }

    for (const a of c.attributes || []) {
      if (a.visibility && !validVisibilities.has(a.visibility)) {
        errors.push({ rule: 'CLASS_ATTR_VIS', message: `Attribute "${a.name}" in class "${c.name}" has invalid visibility "${a.visibility}".` });
      }
    }

    for (const m of c.methods || []) {
      if (m.visibility && !validVisibilities.has(m.visibility)) {
        errors.push({ rule: 'CLASS_METHOD_VIS', message: `Method "${m.name}" in class "${c.name}" has invalid visibility "${m.visibility}".` });
      }
    }
  }

  for (const r of model.relationships || []) {
    if (!classIds.has(r.source) || !classIds.has(r.target)) {
      // Ignore non-class relationships (e.g. use-case include/extend)
      continue;
    }
    if (r.type && !UML_RULES.class.relationships.includes(r.type)) {
      errors.push({ rule: 'CLASS_REL_TYPE', message: `Invalid relationship type "${r.type}" between ${r.source} and ${r.target}.` });
    }
  }

  return errors;
}
