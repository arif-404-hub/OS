// State Diagram Validator

export function validateState(model) {
  const errors = [];
  const states = model.states || [];
  const transitions = model.stateTransitions || [];

  if (!states.length) {
    errors.push({ rule: 'STATE_NO_STATES', message: 'State diagram requires at least one state.' });
  }

  const stateIds = new Set(states.map(s => s.id));
  for (const t of transitions) {
    if (!stateIds.has(t.from)) {
      errors.push({ rule: 'STATE_INVALID_FROM', message: `Transition from unknown state: "${t.from}".` });
    }
    if (!stateIds.has(t.to)) {
      errors.push({ rule: 'STATE_INVALID_TO', message: `Transition to unknown state: "${t.to}".` });
    }
  }

  return errors;
}
