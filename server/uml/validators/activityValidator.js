// Activity Diagram Validator

export function validateActivity(model) {
  const errors = [];
  const processes = model.processes || [];

  if (!processes.length) {
    errors.push({ rule: 'ACT_NO_PROCESSES', message: 'Activity diagram requires at least one action/process.' });
  }

  for (const p of processes) {
    if (!p.name || !p.name.trim()) {
      errors.push({ rule: 'ACT_UNNAMED_ACTION', message: `Process (${p.id}) has no name.` });
    }
  }

  return errors;
}
