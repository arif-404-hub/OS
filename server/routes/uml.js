// Express API Router for the EngineerOS UML Generation Module
import express from 'express';
import { analyzeProject, repairModel } from '../uml/analyzer/requirementAnalyzer.js';
import { generateDiagram } from '../uml/generators/index.js';
import { validateDiagram } from '../uml/validators/index.js';
import { renderPlantUML } from '../uml/renderer/plantumlRenderer.js';
import {
  saveSystemModel,
  getSystemModel,
  saveDiagramSpec,
  getDiagramSpec,
  saveGeneratedDiagram,
} from '../uml/db/umlRepository.js';

export const router = express.Router();

/**
 * POST /api/uml/analyze
 * Extracts structured System Model JSON from a project description.
 */
router.post('/analyze', async (req, res) => {
  try {
    const description = String(req.body.description || '').trim();
    if (!description || description.length < 20) {
      return res.status(400).json({ success: false, error: 'Project description must be at least 20 characters.' });
    }
    const model = await analyzeProject(description);
    res.json({ success: true, model });
  } catch (err) {
    console.error('[UML Analyze Error]', err);
    res.status(400).json({ success: false, error: err.message || 'Requirement analysis failed.' });
  }
});

/**
 * POST /api/uml/generate
 * Transforms the System Model into diagram-specific PlantUML source code.
 */
router.post('/generate', async (req, res) => {
  try {
    const { diagramType, model, projectId } = req.body;
    if (!diagramType) {
      return res.status(400).json({ success: false, error: 'Missing diagramType parameter.' });
    }
    if (!model || typeof model !== 'object') {
      return res.status(400).json({ success: false, error: 'Valid System Model JSON is required.' });
    }

    const source = generateDiagram(diagramType, model);

    // Validate against rule engine
    const validation = validateDiagram(diagramType, model);

    // If projectId provided, persist diagram spec
    if (projectId) {
      try {
        await saveDiagramSpec(projectId, diagramType, source, validation.errors);
      } catch (saveErr) {
        console.warn('[DiagramSpec Save Warning]', saveErr.message);
      }
    }

    res.json({
      success: true,
      diagramType,
      source,
      valid: validation.valid,
      errors: validation.errors,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/uml/validate
 * Validates a diagram specification against project and course rules.
 */
router.post('/validate', (req, res) => {
  try {
    const { diagramType, model } = req.body;
    if (!diagramType || !model) {
      return res.status(400).json({ valid: false, errors: [{ message: 'diagramType and model are required.' }] });
    }
    const { valid, errors } = validateDiagram(diagramType, model);
    res.json({ valid, errors });
  } catch (err) {
    res.status(400).json({ valid: false, errors: [{ message: err.message }] });
  }
});

/**
 * POST /api/uml/render
 * Compiles PlantUML source code into an SVG diagram.
 */
router.post('/render', async (req, res) => {
  try {
    const { source, name, projectId, diagramType } = req.body;
    if (!source || !source.trim()) {
      return res.status(400).json({ success: false, error: 'PlantUML source code is required.' });
    }

    const diagramName = name || (diagramType ? `${diagramType}_diagram` : 'uml_diagram');
    const result = await renderPlantUML(source, 'data/generated_diagrams', diagramName);

    if (projectId && diagramType) {
      try {
        await saveGeneratedDiagram(projectId, diagramType, result.svgFile, result.svg);
      } catch (saveErr) {
        console.warn('[GeneratedDiagram Save Warning]', saveErr.message);
      }
    }

    res.json({
      success: true,
      svg: result.svg,
      sourceFile: result.sourceFile,
      svgFile: result.svgFile,
      plantumlUrl: result.plantumlUrl,
      mode: result.mode,
    });
  } catch (err) {
    console.error('[UML Render Error]', err);
    res.status(500).json({ success: false, error: err.message || 'PlantUML rendering failed.' });
  }
});

/**
 * POST /api/uml/repair
 * Self-healing repair loop to fix validation errors in the System Model.
 */
router.post('/repair', async (req, res) => {
  try {
    const { model, errors } = req.body;
    if (!model) {
      return res.status(400).json({ success: false, error: 'Model is required.' });
    }
    const repairedModel = await repairModel(model, errors || []);
    res.json({ success: true, model: repairedModel });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/uml/model/:pid
 * Retrieves the persisted System Model for a project.
 */
router.get('/model/:pid', async (req, res) => {
  try {
    const pid = Number(req.params.pid);
    const row = await getSystemModel(pid);
    if (!row) {
      return res.status(404).json({ success: false, error: 'No System Model found for this project.' });
    }
    res.json({ success: true, model: row.model, version: row.version, updatedAt: row.updated_at });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/uml/model/:pid
 * Persists the active System Model for a project.
 */
router.post('/model/:pid', async (req, res) => {
  try {
    const pid = Number(req.params.pid);
    const { model, version } = req.body;
    if (!model) {
      return res.status(400).json({ success: false, error: 'Model is required.' });
    }
    const saved = await saveSystemModel(pid, model, version || 1);
    res.json({ success: true, saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
