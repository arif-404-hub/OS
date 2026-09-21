// Swimlane Diagram Validator

export function validateSwimlane(model) {
  const errors = [];
  const actors = model.actors || [];
  const processes = model.processes || [];

  if (!actors.length) {
    errors.push({ rule: 'SWIMLANE_NO_PARTITIONS', message: 'Swimlane diagram requires at least one partition actor.' });
  }

  if (!processes.length) {
    errors.push({ rule: 'SWIMLANE_NO_ACTIONS', message: 'Swimlane diagram requires at least one action/process.' });
  }

  return errors;
}
