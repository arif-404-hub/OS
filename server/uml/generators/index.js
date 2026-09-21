// Unified Generator Dispatcher for EngineerOS UML diagrams

import { generateUseCase } from './useCaseGenerator.js';
import { generateClass } from './classGenerator.js';
import { generateActivity } from './activityGenerator.js';
import { generateSwimlane } from './swimlaneGenerator.js';
import { generateSequence } from './sequenceGenerator.js';
import { generateState } from './stateGenerator.js';
import { generateDeployment } from './deploymentGenerator.js';
import { generateER } from './erGenerator.js';
import { generateContext } from './contextGenerator.js';
import { generateDFD } from './dfdGenerator.js';

export const GENERATORS = {
  useCase: generateUseCase,
  class: generateClass,
  activity: generateActivity,
  swimlane: generateSwimlane,
  sequence: generateSequence,
  state: generateState,
  deployment: generateDeployment,
  er: generateER,
  context: generateContext,
  dfd: generateDFD,
};

export function generateDiagram(diagramType, model) {
  const generator = GENERATORS[diagramType];
  if (!generator) {
    throw new Error(`Unsupported diagram type: "${diagramType}". Valid types are: ${Object.keys(GENERATORS).join(', ')}`);
  }
  return generator(model);
}
