// Course & Architectural Rules for EngineerOS UML diagrams.

export const UML_RULES = {
  useCase: {
    required: ['systemBoundary', 'actors', 'useCases'],
    relationships: ['association', 'include', 'extend', 'generalization'],
  },
  class: {
    relationships: [
      'association', 'generalization', 'realization',
      'dependency', 'aggregation', 'composition',
    ],
    visibility: ['public', 'private', 'protected', 'package'],
  },
  activity: {
    required: ['initial', 'action', 'flow'],
    optional: ['decision', 'merge', 'fork', 'join', 'final'],
  },
  swimlane: {
    required: ['partitions', 'partitionedActions'],
  },
  state: {
    required: ['initial', 'state', 'transition', 'final'],
  },
  sequence: {
    required: ['lifeline', 'message'],
    optional: ['returnMessage', 'selfMessage'],
  },
  deployment: {
    required: ['node', 'component'],
  },
  er: {
    required: ['entities', 'relationships'],
    cardinalities: ['1:1', '1:N', 'M:N'],
  },
  context: {
    exactlyOneSystemProcess: true,
  },
  dfd: {
    processNeedsInput: true,
    processNeedsOutput: true,
    dataStoreNeedsInput: true,
    dataStoreNeedsOutput: true,
    forbidDirect: [
      ['dataStore', 'dataStore'],
      ['dataStore', 'externalEntity'],
      ['externalEntity', 'externalEntity'],
    ],
  },
};
