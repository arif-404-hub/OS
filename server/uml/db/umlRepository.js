// Asynchronous UML Repository for EngineerOS.
// Automatically persists to PostgreSQL when connected, with seamless SQLite local fallback.

import { isPgAvailable, pgQuery } from '../../pg.js';
import { get, run, all } from '../../db.js';

export async function saveSystemModel(projectId, model, version = 1) {
  const modelStr = typeof model === 'string' ? model : JSON.stringify(model);

  if (isPgAvailable) {
    try {
      const res = await pgQuery(
        `INSERT INTO system_models (project_id, model_json, version, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         RETURNING id, project_id, model_json, version, created_at, updated_at`,
        [Number(projectId), modelStr, version]
      );
      return res.rows[0];
    } catch (err) {
      console.warn('[UML Repo PG Fallback]', err.message);
    }
  }

  // SQLite fallback
  const existing = get('SELECT id, version FROM system_models WHERE project_id = ? ORDER BY id DESC LIMIT 1', Number(projectId));
  if (existing) {
    run("UPDATE system_models SET model_json = ?, version = ?, updated_at = datetime('now') WHERE id = ?",
      modelStr, version || existing.version + 1, existing.id);
    return get('SELECT * FROM system_models WHERE id = ?', existing.id);
  }
  const { lastInsertRowid } = run(
    'INSERT INTO system_models (project_id, model_json, version) VALUES (?, ?, ?)',
    Number(projectId), modelStr, version
  );
  return get('SELECT * FROM system_models WHERE id = ?', lastInsertRowid);
}

export async function getSystemModel(projectId) {
  if (isPgAvailable) {
    try {
      const res = await pgQuery(
        `SELECT id, project_id, model_json, version, created_at, updated_at
         FROM system_models WHERE project_id = $1
         ORDER BY id DESC LIMIT 1`,
        [Number(projectId)]
      );
      if (res.rows.length) {
        const row = res.rows[0];
        return {
          ...row,
          model: typeof row.model_json === 'object' ? row.model_json : JSON.parse(row.model_json),
        };
      }
    } catch (err) {
      console.warn('[UML Repo PG Fallback]', err.message);
    }
  }

  // SQLite fallback
  const row = get('SELECT * FROM system_models WHERE project_id = ? ORDER BY id DESC LIMIT 1', Number(projectId));
  if (!row) return null;
  return {
    ...row,
    model: typeof row.model_json === 'object' ? row.model_json : JSON.parse(row.model_json || '{}'),
  };
}

export async function saveDiagramSpec(projectId, diagramType, sourceCode, validation = [], version = 1) {
  const valStr = typeof validation === 'string' ? validation : JSON.stringify(validation);

  if (isPgAvailable) {
    try {
      const res = await pgQuery(
        `INSERT INTO diagram_specs (project_id, diagram_type, source_code, validation_json, version, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
         RETURNING id, project_id, diagram_type, source_code, validation_json, version, created_at`,
        [Number(projectId), diagramType, sourceCode, valStr, version]
      );
      return res.rows[0];
    } catch (err) {
      console.warn('[UML Repo PG Fallback]', err.message);
    }
  }

  // SQLite fallback
  const { lastInsertRowid } = run(
    'INSERT INTO diagram_specs (project_id, diagram_type, source_code, validation_json, version) VALUES (?, ?, ?, ?, ?)',
    Number(projectId), diagramType, sourceCode, valStr, version
  );
  return get('SELECT * FROM diagram_specs WHERE id = ?', lastInsertRowid);
}

export async function getDiagramSpec(projectId, diagramType) {
  if (isPgAvailable) {
    try {
      const res = await pgQuery(
        `SELECT * FROM diagram_specs WHERE project_id = $1 AND diagram_type = $2 ORDER BY id DESC LIMIT 1`,
        [Number(projectId), diagramType]
      );
      if (res.rows.length) return res.rows[0];
    } catch (err) {
      console.warn('[UML Repo PG Fallback]', err.message);
    }
  }

  return get('SELECT * FROM diagram_specs WHERE project_id = ? AND diagram_type = ? ORDER BY id DESC LIMIT 1',
    Number(projectId), diagramType);
}

export async function saveGeneratedDiagram(projectId, diagramType, svgPath, svgContent = '', version = 1) {
  if (isPgAvailable) {
    try {
      const res = await pgQuery(
        `INSERT INTO generated_diagrams (project_id, diagram_type, svg_path, svg_content, version, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [Number(projectId), diagramType, svgPath, svgContent, version]
      );
      return res.rows[0];
    } catch (err) {
      console.warn('[UML Repo PG Fallback]', err.message);
    }
  }

  const { lastInsertRowid } = run(
    'INSERT INTO generated_diagrams (project_id, diagram_type, svg_path, svg_content, version) VALUES (?, ?, ?, ?, ?)',
    Number(projectId), diagramType, svgPath, svgContent, version
  );
  return get('SELECT * FROM generated_diagrams WHERE id = ?', lastInsertRowid);
}
