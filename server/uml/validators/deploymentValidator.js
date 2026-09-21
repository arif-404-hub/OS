// Deployment Diagram Validator

export function validateDeployment(model) {
  const errors = [];
  const nodes = model.deploymentNodes || [];

  if (!nodes.length) {
    errors.push({ rule: 'DEPLOY_NO_NODES', message: 'Deployment diagram requires at least one physical/virtual node.' });
  }

  for (const n of nodes) {
    if (!n.name || !n.name.trim()) {
      errors.push({ rule: 'DEPLOY_UNNAMED_NODE', message: `Deployment node (${n.id}) has no name.` });
    }
  }

  return errors;
}
