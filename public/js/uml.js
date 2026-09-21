// EngineerOS - UML Studio Controller
// Implements Single Source of Truth architecture:
// Description -> Requirement Analyzer -> System Model JSON -> 10 Generators -> Rule Engine -> PlantUML Renderer -> SVG

const ECOBANGLA_PRESET = `EcoBangla is an integrated digital municipal waste management and recycling intelligence platform operating across Dhaka and major urban centers in Bangladesh.

The platform integrates four key stakeholder groups:
1. Household Citizens: Register waste collection requests, specify hazardous vs recyclable vs organic waste categories, schedule on-demand pickups, track waste collection vehicles via GPS telemetry, and earn civic reward points.
2. Informal Waste Collectors (Tokais & Van Drivers): Receive optimized daily collection route manifests on their mobile handhelds, log collected bulk weights, scan QR tags on domestic waste bins, report illegal dumping spots, and receive micro-payments.
3. Industrial Recycling Centers & Scrap Dealers: Purchase sorted recyclable materials (plastics, e-waste, aluminum, paper), track incoming bulk material shipments, verify consignment purity grades, manage inventory storage, and generate industrial sustainability certificates.
4. Municipal Oversight Units (DNCC/DSCC City Corporations): Monitor citywide waste logistics telemetry in real-time, audit ward-level collection SLAs, track fuel efficiency and vehicle maintenance, manage billing subsidies, and generate environmental impact dashboards.

Operational Workflows:
- Collection Logistics: When a citizen submits a collection request, the core routing engine assigns the request to the nearest van driver. Telemetry IoT sensors on community dumpsters stream real-time volume fill levels.
- Material Processing: Once waste arrives at secondary transfer stations, recyclable materials are weighed and categorized into inventory. Recycling centers place purchase bids through an open materials exchange.
- Accountability & Transparency: Every collection is cryptographically logged with GPS timestamps and bin QR scans to prevent fraudulent billing. Municipal inspectors can flag non-compliance or missed wards.
- Security & Compliance: System supports role-based access control, encrypted telemetry payloads, and audit trails for environmental compliance.`;

export const UML_DIAGRAM_TYPES = [
  { id: 'useCase', label: 'Use Case', icon: '⚯' },
  { id: 'class', label: 'Class', icon: '⊞' },
  { id: 'activity', label: 'Activity', icon: '➔' },
  { id: 'sequence', label: 'Sequence', icon: '⇄' },
  { id: 'state', label: 'State', icon: '◍' },
  { id: 'context', label: 'Context (DFD-0)', icon: '◎' },
  { id: 'dfd', label: 'DFD (Level-1)', icon: '⮂' },
  { id: 'er', label: 'Entity Relationship', icon: '⑆' },
  { id: 'swimlane', label: 'Swimlane', icon: '▤' },
  { id: 'deployment', label: 'Deployment', icon: '⛁' },
];

let activeDiagramType = 'useCase';
let activeModel = null;
let currentSource = '';
let currentSvg = '';
let currentValidation = { valid: true, errors: [] };
let isAnalyzing = false;
let isGenerating = false;

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function initUMLStudio(container, project, api, toast, openModal, closeModal) {
  container.innerHTML = `
    <div class="uml-studio">
      <!-- Top Overview Header -->
      <div class="card" style="margin-bottom:16px;padding:18px 22px">
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div>
            <h3 style="margin:0 0 4px;display:flex;align-items:center;gap:8px">
              <span>◇</span> EngineerOS UML Architecture Studio
              <span class="pill green" style="font-size:11px">Single Source of Truth</span>
            </h3>
            <p class="muted" style="margin:0;font-size:13.5px">
              Extract one structured System Model from requirements. Derived into 10 synchronized diagrams with Rule Engine validation and PlantUML rendering.
            </p>
          </div>
          <div class="row" style="gap:8px">
            <button class="btn small" id="umlLoadPresetBtn">⚡ Load EcoBangla Preset</button>
            <button class="btn small" id="umlEditModelBtn" ${activeModel ? '' : 'disabled'}>✎ Edit Model JSON</button>
            <button class="btn primary small" id="umlSaveModelBtn" ${activeModel ? '' : 'disabled'}>💾 Save to Project</button>
          </div>
        </div>

        <!-- Description Input Area -->
        <div style="margin-top:14px">
          <label for="umlDescInput" style="display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin-bottom:6px">
            Project Description / Requirements Specification:
          </label>
          <textarea id="umlDescInput" rows="4" style="width:100%;font-size:13px;line-height:1.45;padding:10px;border-radius:8px" placeholder="Enter project requirements or system description...">${esc(project?.description || ECOBANGLA_PRESET)}</textarea>
          <div class="row" style="justify-content:space-between;margin-top:10px">
            <span class="muted" style="font-size:12px">Pass any project description to extract actors, use cases, classes, processes, states, DFD flows and deployment nodes.</span>
            <button class="btn primary" id="umlAnalyzeBtn" style="padding:7px 18px">
              <span>✦</span> Analyze &amp; Extract System Model
            </button>
          </div>
        </div>
      </div>

      <!-- System Model Summary Metrics Bar -->
      <div id="umlModelStatsCard" class="card" style="margin-bottom:16px;padding:14px 20px;${activeModel ? '' : 'display:none;'}">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div class="row" style="gap:12px" id="umlModelChips">
            <!-- Populated dynamically -->
          </div>
          <span class="muted" style="font-size:12px" id="umlModelSystemTitle"></span>
        </div>
      </div>

      <!-- Diagram Tabs Bar -->
      <div class="card" style="margin-bottom:16px;padding:10px 14px">
        <div class="row" style="gap:6px;overflow-x:auto;padding-bottom:2px" id="umlDiagramTabs">
          ${UML_DIAGRAM_TYPES.map(d => `
            <button class="btn small ${d.id === activeDiagramType ? 'primary' : ''}" data-diag="${d.id}" style="display:inline-flex;align-items:center;gap:5px">
              <span>${d.icon}</span> <span>${d.label}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Main Diagram Viewport Card -->
      <div class="card" style="margin-bottom:16px;padding:18px 22px">
        <!-- Diagram Toolbar -->
        <div class="row" style="justify-content:space-between;margin-bottom:14px;align-items:center">
          <div class="row" style="gap:10px;align-items:center">
            <h4 id="umlActiveDiagTitle" style="margin:0">${UML_DIAGRAM_TYPES.find(d => d.id === activeDiagramType)?.label || 'Diagram'}</h4>
            <div id="umlRuleStatusBadge"></div>
          </div>
          <div class="row" style="gap:8px">
            <button class="btn small" id="umlValidateBtn">🔍 Validate Rules</button>
            <button class="btn small" id="umlRepairBtn" style="display:none;color:var(--warn)">🛠 Auto-Repair</button>
            <button class="btn small" id="umlRegenBtn">🔄 Regenerate</button>
            <button class="btn small" id="umlToggleSrcBtn">‹/› Toggle Source</button>
            <button class="btn small" id="umlDownloadSvgBtn">↓ Download SVG</button>
            <button class="btn small" id="umlDownloadPumlBtn">↓ Download PlantUML</button>
          </div>
        </div>

        <!-- Rule Engine Warning Box (if issues exist) -->
        <div id="umlRuleErrorsBox" class="issues hidden" style="margin-bottom:14px"></div>

        <!-- Diagram SVG Container -->
        <div id="umlSvgViewport" style="min-height:360px;background:var(--bg-2);border:1px solid var(--line);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:auto;padding:24px;position:relative">
          <div class="empty" style="text-align:center">
            <span class="spinner"></span>
            <p class="muted" style="margin-top:10px;font-size:13.5px">Ready. Click "Analyze &amp; Extract System Model" to begin.</p>
          </div>
        </div>

        <!-- PlantUML Source Code Panel (Collapsible) -->
        <div id="umlSourcePanel" class="hidden" style="margin-top:16px">
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <span class="muted" style="font-size:12px;font-weight:600">PLANTUML SOURCE CODE</span>
            <button class="btn small" id="umlCopySrcBtn">📋 Copy PlantUML</button>
          </div>
          <pre class="code" id="umlSourceCode" style="max-height:280px;overflow:auto;margin:0;font-size:12.5px"></pre>
        </div>
      </div>
    </div>
  `;

  // Attach event handlers
  const descInput = container.querySelector('#umlDescInput');
  const analyzeBtn = container.querySelector('#umlAnalyzeBtn');
  const presetBtn = container.querySelector('#umlLoadPresetBtn');
  const tabsContainer = container.querySelector('#umlDiagramTabs');
  const regenBtn = container.querySelector('#umlRegenBtn');
  const validateBtn = container.querySelector('#umlValidateBtn');
  const repairBtn = container.querySelector('#umlRepairBtn');
  const toggleSrcBtn = container.querySelector('#umlToggleSrcBtn');
  const copySrcBtn = container.querySelector('#umlCopySrcBtn');
  const downloadSvgBtn = container.querySelector('#umlDownloadSvgBtn');
  const downloadPumlBtn = container.querySelector('#umlDownloadPumlBtn');
  const editModelBtn = container.querySelector('#umlEditModelBtn');
  const saveModelBtn = container.querySelector('#umlSaveModelBtn');

  presetBtn.addEventListener('click', () => {
    descInput.value = ECOBANGLA_PRESET;
    toast('EcoBangla project description loaded into analyzer.');
  });

  analyzeBtn.addEventListener('click', async () => {
    const desc = descInput.value.trim();
    if (desc.length < 20) {
      toast('Please enter a description of at least 20 characters.');
      return;
    }
    await runAnalysis(desc);
  });

  tabsContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-diag]');
    if (!btn) return;
    const type = btn.dataset.diag;
    if (type === activeDiagramType) return;
    activeDiagramType = type;

    tabsContainer.querySelectorAll('[data-diag]').forEach(b => b.classList.remove('primary'));
    btn.classList.add('primary');

    container.querySelector('#umlActiveDiagTitle').textContent =
      UML_DIAGRAM_TYPES.find(d => d.id === activeDiagramType)?.label || 'Diagram';

    if (activeModel) {
      await runGenerationAndRender();
    }
  });

  regenBtn.addEventListener('click', async () => {
    if (activeModel) await runGenerationAndRender();
    else toast('Analyze project requirements first.');
  });

  validateBtn.addEventListener('click', () => {
    if (!activeModel) return toast('Extract a System Model first.');
    runValidationCheck();
    toast(currentValidation.valid ? 'Rule validation passed!' : `Found ${currentValidation.errors.length} rule notice(s).`);
  });

  repairBtn.addEventListener('click', async () => {
    if (!activeModel) return;
    try {
      toast('Running self-healing repair loop on System Model...');
      const res = await api.post('/uml/repair', { model: activeModel, errors: currentValidation.errors });
      if (res.model) {
        activeModel = res.model;
        updateModelChips();
        toast('System Model repaired successfully!');
        await runGenerationAndRender();
      }
    } catch (err) {
      toast('Repair failed: ' + err.message);
    }
  });

  toggleSrcBtn.addEventListener('click', () => {
    const panel = container.querySelector('#umlSourcePanel');
    panel.classList.toggle('hidden');
  });

  copySrcBtn.addEventListener('click', () => {
    if (!currentSource) return;
    navigator.clipboard.writeText(currentSource).then(() => toast('PlantUML source copied to clipboard!'));
  });

  downloadSvgBtn.addEventListener('click', () => {
    if (!currentSvg) return toast('No SVG generated yet.');
    const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDiagramType}_diagram.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast('SVG downloaded.');
  });

  downloadPumlBtn.addEventListener('click', () => {
    if (!currentSource) return toast('No PlantUML source generated yet.');
    const blob = new Blob([currentSource], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDiagramType}_diagram.puml`;
    a.click();
    URL.revokeObjectURL(url);
    toast('PlantUML source downloaded.');
  });

  editModelBtn.addEventListener('click', () => {
    if (!activeModel) return;
    openModal('Edit System Model JSON', `
      <p class="muted" style="margin-top:0;font-size:13px">Directly edit the System Model (single source of truth). All 10 diagrams synchronize with this model.</p>
      <textarea id="modalModelJson" style="width:100%;height:380px;font-family:monospace;font-size:12px;background:var(--bg-2)">${esc(JSON.stringify(activeModel, null, 2))}</textarea>
      <p class="error hidden" id="modalModelErr"></p>
      <button class="btn primary block" id="modalSaveModelBtn">Apply Model Changes</button>
    `, () => {
      document.getElementById('modalSaveModelBtn').addEventListener('click', async () => {
        const txt = document.getElementById('modalModelJson').value;
        try {
          const parsed = JSON.parse(txt);
          activeModel = parsed;
          closeModal();
          updateModelChips();
          toast('System Model updated!');
          await runGenerationAndRender();
        } catch (err) {
          const errBox = document.getElementById('modalModelErr');
          errBox.textContent = 'Invalid JSON: ' + err.message;
          errBox.classList.remove('hidden');
        }
      });
    });
  });

  saveModelBtn.addEventListener('click', async () => {
    if (!activeModel || !project?.id) return;
    try {
      await api.post(`/uml/model/${project.id}`, { model: activeModel });
      toast('System Model saved to PostgreSQL / project database!');
    } catch (err) {
      toast('Failed to save model: ' + err.message);
    }
  });

  // Try to load any existing persisted model for the project
  if (project?.id) {
    try {
      const res = await api.get(`/uml/model/${project.id}`);
      if (res.model) {
        activeModel = res.model;
        updateModelChips();
        await runGenerationAndRender();
        return;
      }
    } catch {
      // No saved model yet; prompt user to analyze
    }
  }

  // Automatic first-time run if project has description
  if (project?.description && project.description.length >= 20) {
    runAnalysis(project.description);
  }

  // ------------------------------------------------------------- internal helpers
  async function runAnalysis(description) {
    const svgBox = container.querySelector('#umlSvgViewport');
    svgBox.innerHTML = `
      <div style="text-align:center">
        <span class="spinner"></span>
        <p class="muted" style="margin-top:10px;font-size:13.5px">Analyzing requirements &amp; extracting System Model JSON...</p>
      </div>`;

    try {
      const res = await api.post('/uml/analyze', { description });
      if (!res.success || !res.model) {
        throw new Error(res.error || 'Failed to extract model.');
      }
      activeModel = res.model;
      updateModelChips();
      toast('System Model extracted successfully!');
      await runGenerationAndRender();
    } catch (err) {
      svgBox.innerHTML = `
        <div class="card error" style="margin:20px;text-align:left">
          <strong>Analysis Error:</strong> ${esc(err.message)}
        </div>`;
      toast('Analysis failed: ' + err.message);
    }
  }

  function updateModelChips() {
    if (!activeModel) return;
    container.querySelector('#umlModelStatsCard').style.display = 'block';
    container.querySelector('#umlEditModelBtn').removeAttribute('disabled');
    container.querySelector('#umlSaveModelBtn').removeAttribute('disabled');

    const m = activeModel;
    container.querySelector('#umlModelSystemTitle').textContent = `System: ${m.system?.name || 'System'}`;
    container.querySelector('#umlModelChips').innerHTML = `
      <span class="pill" style="background:rgba(29,116,237,0.1);color:var(--brand);font-weight:600">Actors: ${m.actors?.length || 0}</span>
      <span class="pill" style="background:rgba(46,204,143,0.1);color:var(--ok);font-weight:600">Use Cases: ${m.useCases?.length || 0}</span>
      <span class="pill" style="background:rgba(240,180,41,0.1);color:var(--warn);font-weight:600">Classes: ${m.classes?.length || 0}</span>
      <span class="pill" style="background:rgba(155,89,182,0.1);color:#9b59b6;font-weight:600">Processes: ${m.processes?.length || 0}</span>
      <span class="pill" style="background:rgba(52,152,219,0.1);color:#2980b9;font-weight:600">States: ${m.states?.length || 0}</span>
      <span class="pill" style="background:rgba(230,126,34,0.1);color:#d35400;font-weight:600">Data Stores: ${m.dataStores?.length || 0}</span>
      <span class="pill" style="background:rgba(149,165,166,0.1);color:#7f8c8d;font-weight:600">Entities: ${m.externalEntities?.length || 0}</span>
    `;
  }

  async function runGenerationAndRender() {
    if (!activeModel) return;
    const svgBox = container.querySelector('#umlSvgViewport');
    svgBox.innerHTML = `
      <div style="text-align:center">
        <span class="spinner"></span>
        <p class="muted" style="margin-top:10px;font-size:13.5px">Generating ${activeDiagramType} diagram and compiling SVG...</p>
      </div>`;

    try {
      // 1. Generate PlantUML Source Code
      const genRes = await api.post('/uml/generate', {
        diagramType: activeDiagramType,
        model: activeModel,
        projectId: project?.id,
      });

      if (!genRes.success || !genRes.source) {
        throw new Error(genRes.error || 'Generation failed.');
      }

      currentSource = genRes.source;
      currentValidation = { valid: genRes.valid, errors: genRes.errors || [] };
      container.querySelector('#umlSourceCode').textContent = currentSource;

      // 2. Render SVG via PlantUML Renderer
      const renderRes = await api.post('/uml/render', {
        source: currentSource,
        name: `${project?.name || 'diagram'}_${activeDiagramType}`,
        projectId: project?.id,
        diagramType: activeDiagramType,
      });

      if (!renderRes.success || !renderRes.svg) {
        throw new Error(renderRes.error || 'Rendering SVG failed.');
      }

      currentSvg = renderRes.svg;

      // Render SVG in Viewport
      svgBox.innerHTML = `
        <div style="width:100%;display:flex;justify-content:center;align-items:center;padding:12px">
          <div style="max-width:100%;max-height:650px;overflow:auto" class="svg-diagram-wrapper">
            ${currentSvg}
          </div>
        </div>
      `;

      // Update validation UI status
      renderValidationStatus();
    } catch (err) {
      svgBox.innerHTML = `
        <div class="card error" style="margin:20px;text-align:left">
          <strong>Render Error:</strong> ${esc(err.message)}
          <p class="muted" style="margin:6px 0 0;font-size:12.5px">You can still inspect the generated PlantUML source code below.</p>
        </div>`;
      renderValidationStatus();
    }
  }

  function runValidationCheck() {
    renderValidationStatus();
  }

  function renderValidationStatus() {
    const badge = container.querySelector('#umlRuleStatusBadge');
    const errBox = container.querySelector('#umlRuleErrorsBox');
    const repairBtn = container.querySelector('#umlRepairBtn');

    if (currentValidation.valid) {
      badge.innerHTML = `<span class="pill green" style="font-size:11px">✓ RULE PASS</span>`;
      errBox.classList.add('hidden');
      errBox.innerHTML = '';
      repairBtn.style.display = 'none';
    } else {
      badge.innerHTML = `<span class="pill amber" style="font-size:11px">⚠ ${currentValidation.errors.length} ISSUE(S)</span>`;
      repairBtn.style.display = 'inline-block';
      errBox.classList.remove('hidden');
      errBox.innerHTML = `
        <div style="font-size:13px;font-weight:600;margin-bottom:6px">Rule Engine Notices:</div>
        <ul style="margin:0;padding-left:20px;font-size:12.5px">
          ${currentValidation.errors.map(e => `<li><strong>${esc(e.rule || 'RULE')}:</strong> ${esc(e.message)}</li>`).join('')}
        </ul>
      `;
    }
  }
}
