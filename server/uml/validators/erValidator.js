// Entity Relationship Diagram Validator

export function validateER(model) {
  const errors = [];
  const classes = model.classes || [];

  if (!classes.length) {
    errors.push({ rule: 'ER_NO_ENTITIES', message: 'ER diagram requires at least one entity.' });
  }

  for (const c of classes) {
    if (!c.attributes || !c.attributes.length) {
      errors.push({ rule: 'ER_ENTITY_NO_ATTR', message: `Entity "${c.name}" has no attributes.` });
    }
  }

  return errors;
}
