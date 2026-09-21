// Data Flow Diagram (DFD) Validator
// Enforces strict DFD rules: process input/output, data store input/output, and forbidden direct connections.

export function validateDFD(model) {
  const errors = [];

  for (const process of model.processes || []) {
    if (!process.inputs?.length) {
      errors.push({
        rule: 'DFD_PROCESS_INPUT',
        message: `Process "${process.name}" has no input.`,
      });
    }

    if (!process.outputs?.length) {
      errors.push({
        rule: 'DFD_PROCESS_OUTPUT',
        message: `Process "${process.name}" has no output.`,
      });
    }
  }

  for (const store of model.dataStores || []) {
    if (!store.incoming?.length) {
      errors.push({
        rule: 'DFD_DATASTORE_INPUT',
        message: `Data store "${store.name}" has no incoming flow.`,
      });
    }
    if (!store.outgoing?.length) {
      errors.push({
        rule: 'DFD_DATASTORE_OUTPUT',
        message: `Data store "${store.name}" has no outgoing flow.`,
      });
    }
  }

  for (const flow of model.dataFlows || []) {
    const bad =
      (flow.sourceType === 'dataStore' && flow.targetType === 'dataStore') ||
      (flow.sourceType === 'dataStore' && flow.targetType === 'externalEntity') ||
      (flow.sourceType === 'externalEntity' && flow.targetType === 'externalEntity');

    if (bad) {
      errors.push({
        rule: 'DFD_INVALID_CONNECTION',
        message: `Invalid direct connection ${flow.source} -> ${flow.target}.`,
      });
    }
  }

  return errors;
}
