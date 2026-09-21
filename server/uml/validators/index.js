// Unified Validator Dispatcher for UML diagrams

import { validateUseCase } from './useCaseValidator.js';
import { validateClass } from './classValidator.js';
import { validateActivity } from './activityValidator.js';
import { validateSwimlane } from './swimlaneValidator.js';
import { validateSequence } from './sequenceValidator.js';
import { validateState } from './stateValidator.js';
import { validateDeployment } from './deploymentValidator.js';
import { validateER } from './erValidator.js';
import { validateContext } from './contextValidator.js';
import { validateDFD } from './dfdValidator.js';

export const VALIDATORS = {
  useCase: validateUseCase,
  class: validateClass,
  activity: validateActivity,
  swimlane: validateSwimlane,
  sequence: validateSequence,
  state: validateState,
  deployment: validateDeployment,
  er: validateER,
  context: validateContext,
  dfd: validateDFD,
};

export function validateDiagram(diagramType, model) {
  const validator = VALIDATORS[diagramType];
  if (!validator) {
    return { valid: true, errors: [] };
  }
  const errors = validator(model);
  return {
    valid: errors.length === 0,
    errors,
  };
}
