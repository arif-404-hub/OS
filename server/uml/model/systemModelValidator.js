// Zod runtime validator for the EngineerOS System Model
import { z } from 'zod';

export const AttributeSchema = z.object({
  name: z.string().min(1),
  type: z.string().default('String'),
  visibility: z.enum(['public', 'private', 'protected', 'package']).default('public'),
});

export const MethodParameterSchema = z.object({
  name: z.string().min(1),
  type: z.string().default('Any'),
});

export const MethodSchema = z.object({
  name: z.string().min(1),
  visibility: z.enum(['public', 'private', 'protected', 'package']).default('public'),
  returnType: z.string().default('void'),
  parameters: z.array(MethodParameterSchema).default([]),
});

export const ClassSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  attributes: z.array(AttributeSchema).default([]),
  methods: z.array(MethodSchema).default([]),
});

export const ActorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['human', 'external_system', 'device']).default('human'),
});

export const UseCaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  actorIds: z.array(z.string()).default([]),
  description: z.string().optional(),
});

export const RelationshipSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.enum([
    'association', 'generalization', 'realization',
    'dependency', 'aggregation', 'composition',
    'include', 'extend'
  ]).default('association'),
  sourceMultiplicity: z.string().optional(),
  targetMultiplicity: z.string().optional(),
});

export const ProcessSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  actorId: z.string().optional(),
});

export const StateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const StateTransitionSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  event: z.string().optional(),
});

export const DataStoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  incoming: z.array(z.string()).default([]),
  outgoing: z.array(z.string()).default([]),
});

export const DataFlowSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().default(''),
  sourceType: z.string().optional(),
  targetType: z.string().optional(),
});

export const ExternalEntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const ContextFlowSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().default(''),
});

export const SequenceObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().default('participant'),
});

export const MessageSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  text: z.string().default(''),
  return: z.boolean().default(false),
});

export const ComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  node: z.string().optional(),
  interfaces: z.array(z.string()).default([]),
});

export const DeploymentNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().default('device'),
  artifacts: z.array(z.string()).default([]),
});

export const SystemModelSchema = z.object({
  system: z.object({
    name: z.string().min(1),
    description: z.string().default(''),
  }),
  actors: z.array(ActorSchema).default([]),
  useCases: z.array(UseCaseSchema).default([]),
  classes: z.array(ClassSchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
  processes: z.array(ProcessSchema).default([]),
  states: z.array(StateSchema).default([]),
  stateTransitions: z.array(StateTransitionSchema).default([]),
  dataStores: z.array(DataStoreSchema).default([]),
  dataFlows: z.array(DataFlowSchema).default([]),
  externalEntities: z.array(ExternalEntitySchema).default([]),
  contextFlows: z.array(ContextFlowSchema).default([]),
  sequenceObjects: z.array(SequenceObjectSchema).default([]),
  messages: z.array(MessageSchema).default([]),
  components: z.array(ComponentSchema).default([]),
  deploymentNodes: z.array(DeploymentNodeSchema).default([]),
});

export function validateSystemModel(rawModel) {
  const result = SystemModelSchema.safeParse(rawModel);
  if (!result.success) {
    const formatted = result.error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message,
    }));
    return { valid: false, errors: formatted, model: null };
  }
  return { valid: true, errors: [], model: result.data };
}
