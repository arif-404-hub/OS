// Use Case Diagram Validator
import { UML_RULES } from '../rules/umlRules.js';

export function validateUseCase(model) {
  const errors = [];
  const actors = model.actors || [];
  const useCases = model.useCases || [];

  if (!model.system?.name) {
    errors.push({ rule: 'UC_NO_SYSTEM', message: 'System boundary name is required.' });
  }

  if (!actors.length) {
    errors.push({ rule: 'UC_NO_ACTORS', message: 'Use Case diagram requires at least one actor.' });
  }

  if (!useCases.length) {
    errors.push({ rule: 'UC_NO_USE_CASES', message: 'Use Case diagram requires at least one use case.' });
  }

  const actorIds = new Set(actors.map(a => a.id));
  for (const uc of useCases) {
    const hasActor = (uc.actorIds || []).some(id => actorIds.has(id));
    if (!hasActor) {
      errors.push({ rule: 'UC_ORPHAN', message: `Use case "${uc.name}" (${uc.id}) has no associated actor.` });
    }
  }

  for (const r of model.relationships || []) {
    if (['include', 'extend', 'generalization', 'association'].includes(r.type)) {
      if (!UML_RULES.useCase.relationships.includes(r.type)) {
        errors.push({ rule: 'UC_INVALID_REL', message: `Invalid use case relationship type: "${r.type}".` });
      }
    }
  }

  return errors;
}
