// Context Diagram (Level 0 DFD) Validator

export function validateContext(model) {
  const errors = [];

  if (!model.system?.name) {
    errors.push({ rule: 'CONTEXT_NO_SYSTEM', message: 'Context diagram requires a named central System process (Process 0).' });
  }

  const entities = model.externalEntities || [];
  if (!entities.length) {
    errors.push({ rule: 'CONTEXT_NO_ENTITIES', message: 'Context diagram requires external entities communicating with the system.' });
  }

  return errors;
}
