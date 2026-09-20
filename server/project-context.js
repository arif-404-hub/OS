import { all } from './db.js';
import { projectRequirements } from './routes/requirements.js';

/** Shared source of truth for every project-scoped generation workflow. */
export function getProjectContext(project) {
  const requirements = projectRequirements(project.id);
  return {
    projectId: project.id,
    projectName: project.name,
    projectDescription: project.description || '',
    projectType: project.project_type || '',
    generatedRequirements: requirements,
    userStories: requirements.map((requirement) => requirement.story).filter(Boolean),
    acceptanceCriteria: requirements.flatMap((requirement) => requirement.acceptance || []),
  };
}