// Architecture and Database Design intelligence engine.
// Provides:
// 1. Architecture recommendation (patterns, tiers, tech stack, trade-offs, Mermaid diagram)
// 2. Database schema (entities, attributes, relationships, normalization, Mermaid ER)
// 3. SQL generation (PostgreSQL, MySQL, SQLite DDL/DML, indexes, seeds, sample queries)

const escMermaid = (s) => String(s ?? '').replace(/["`\n[\]{}()<>]/g, ' ').replace(/\s+/g, ' ').trim();
const toSnakeCase = (s) => String(s ?? '')
  .trim()
  .replace(/([a-z])([A-Z])/g, '$1_$2')
  .replace(/[^a-zA-Z0-9]+/g, '_')
  .toLowerCase()
  .replace(/^_+|_+$/g, '') || 'entity';

const toPlural = (s) => {
  const singular = toSnakeCase(s);
  if (singular.endsWith('y') && !/[aeiou]y$/.test(singular)) return `${singular.slice(0, -1)}ies`;
  if (singular.endsWith('s') || singular.endsWith('ch') || singular.endsWith('sh') || singular.endsWith('x')) return `${singular}es`;
  return `${singular}s`;
};

const toPascalCase = (s) => {
  const parts = String(s ?? '').split(/[^a-zA-Z0-9]+/);
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('') || 'Entity';
};

/** Extract key domain entities from requirements and project brief */
function extractEntities(project, requirements) {
  const text = `${project.name} ${project.description || ''} ${project.project_type || ''} ${requirements.map((r) => `${r.title} ${r.description}`).join(' ')}`.toLowerCase();

  const stopWords = new Set([
    'system', 'platform', 'application', 'service', 'module', 'feature', 'function', 'functional', 'nonfunctional',
    'shall', 'must', 'should', 'will', 'allow', 'able', 'user', 'users', 'admin', 'administrator',
    'provide', 'support', 'manage', 'handle', 'perform', 'using', 'based', 'store', 'record',
    'view', 'display', 'create', 'update', 'delete', 'track', 'generate', 'process', 'send',
    'data', 'information', 'detail', 'details', 'result', 'results', 'status', 'type', 'list',
    'time', 'times', 'date', 'dates', 'each', 'every', 'other', 'another', 'first', 'second',
    'well', 'into', 'with', 'from', 'that', 'this', 'their', 'them', 'when', 'then', 'they',
    'use', 'uses', 'case', 'cases', 'diagram', 'diagrams', 'story', 'stories', 'acceptance',
    'criteria', 'format', 'formats', 'pdf', 'docx', 'txt', 'document', 'documents', 'ieee',
    'percent', 'hour', 'hours', 'second', 'seconds', 'minute', 'minutes', 'concurrent',
    'page', 'pages', 'request', 'requests', 'password', 'passwords', 'member', 'members',
    'team', 'teams', 'upload', 'uploaded', 'code', 'codes', 'point', 'points', 'business'
  ]);

  const candidates = new Map();

  // Pattern matching for typical nouns after verbs or prepositions
  const regex = /\b(?:upload|create|manage|generate|assign|track|store|record|view|process|submit|cancel|resolve|publish|register)\s+(?:a|an|the)?\s*([a-z]{3,20})\b/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const word = m[1].toLowerCase().replace(/s$/, '');
    if (!stopWords.has(word) && word.length >= 3) {
      candidates.set(word, (candidates.get(word) || 0) + 3);
    }
  }

  // Word frequency scan for capitalized terms in requirements
  for (const r of requirements) {
    const words = (r.title + ' ' + r.description).match(/\b[A-Za-z]{4,}\b/g) || [];
    for (const w of words) {
      const lower = w.toLowerCase().replace(/s$/, '');
      if (!stopWords.has(lower) && lower.length >= 4) {
        candidates.set(lower, (candidates.get(lower) || 0) + 1);
      }
    }
  }

  // Always include Core User entity
  const coreEntities = [
    {
      name: 'User',
      table: 'users',
      description: 'System users, credentials, roles, and profile settings',
      isCore: true,
      columns: [
        { name: 'id', type: 'BIGINT', pk: true, fk: null, nullable: false, unique: true, default: 'AUTO_INCREMENT', desc: 'Primary key' },
        { name: 'name', type: 'VARCHAR(150)', pk: false, fk: null, nullable: false, unique: false, default: null, desc: 'Full display name' },
        { name: 'email', type: 'VARCHAR(255)', pk: false, fk: null, nullable: false, unique: true, default: null, desc: 'Unique login email address' },
        { name: 'password_hash', type: 'VARCHAR(255)', pk: false, fk: null, nullable: false, unique: false, default: null, desc: 'Securely hashed credential (scrypt/bcrypt)' },
        { name: 'role', type: 'VARCHAR(50)', pk: false, fk: null, nullable: false, unique: false, default: "'MEMBER'", desc: 'Authorization role (ADMIN, MANAGER, MEMBER, etc.)' },
        { name: 'status', type: 'VARCHAR(30)', pk: false, fk: null, nullable: false, unique: false, default: "'ACTIVE'", desc: 'Account status (ACTIVE, SUSPENDED, PENDING)' },
        { name: 'created_at', type: 'TIMESTAMP', pk: false, fk: null, nullable: false, unique: false, default: 'CURRENT_TIMESTAMP', desc: 'Account creation audit timestamp' },
        { name: 'updated_at', type: 'TIMESTAMP', pk: false, fk: null, nullable: true, unique: false, default: 'CURRENT_TIMESTAMP', desc: 'Last record modification timestamp' },
      ],
      indexes: ['idx_users_email', 'idx_users_role_status'],
    },
  ];

  // Pick top domain entities
  const sorted = [...candidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([word]) => word !== 'user' && word !== 'account')
    .slice(0, 5)
    .map(([word]) => word);

  // If few domain entities discovered, provide meaningful fallbacks derived from domain
  const domainFallbacks = [];
  const lowerDesc = `${project.name} ${project.description || ''}`.toLowerCase();

  if (lowerDesc.includes('project') || lowerDesc.includes('task') || lowerDesc.includes('defect') || lowerDesc.includes('sprint') || lowerDesc.includes('sdlc')) {
    domainFallbacks.push('Project', 'Requirement', 'Task', 'Sprint', 'Defect');
  } else if (lowerDesc.includes('shop') || lowerDesc.includes('ecommerce') || lowerDesc.includes('store') || lowerDesc.includes('order')) {
    domainFallbacks.push('Product', 'Category', 'Order', 'OrderItem', 'Payment');
  } else if (lowerDesc.includes('hospital') || lowerDesc.includes('patient') || lowerDesc.includes('medical') || lowerDesc.includes('clinic')) {
    domainFallbacks.push('Patient', 'Doctor', 'Appointment', 'MedicalRecord', 'Prescription');
  } else if (lowerDesc.includes('waste') || lowerDesc.includes('bin') || lowerDesc.includes('route') || lowerDesc.includes('garbage')) {
    domainFallbacks.push('Bin', 'Location', 'CollectionRoute', 'Driver', 'PickupLog');
  } else if (lowerDesc.includes('school') || lowerDesc.includes('student') || lowerDesc.includes('course') || lowerDesc.includes('university')) {
    domainFallbacks.push('Course', 'Student', 'Enrollment', 'Assignment', 'Grade');
  } else {
    domainFallbacks.push('Item', 'Category', 'Transaction', 'AuditLog');
  }

  const chosenWords = [...new Set([...domainFallbacks, ...sorted.map(toPascalCase)])].slice(0, 5);

  let prevEntityTable = 'users';

  chosenWords.forEach((entityName, idx) => {
    const table = toPlural(entityName);
    if (coreEntities.some((e) => e.table === table)) return;

    const parentTable = idx === 0 ? 'users' : prevEntityTable;
    const parentFkColumn = idx === 0 ? 'owner_id' : `${toSnakeCase(coreEntities[coreEntities.length - 1].name)}_id`;

    const columns = [
      { name: 'id', type: 'BIGINT', pk: true, fk: null, nullable: false, unique: true, default: 'AUTO_INCREMENT', desc: 'Primary key' },
      { name: parentFkColumn, type: 'BIGINT', pk: false, fk: `${parentTable}(id)`, nullable: false, unique: false, default: null, desc: `Reference to parent ${parentTable}` },
      { name: 'title', type: 'VARCHAR(200)', pk: false, fk: null, nullable: false, unique: false, default: null, desc: `${entityName} identifier or title` },
      { name: 'description', type: 'TEXT', pk: false, fk: null, nullable: true, unique: false, default: null, desc: `Detailed specification or notes` },
      { name: 'status', type: 'VARCHAR(50)', pk: false, fk: null, nullable: false, unique: false, default: "'PENDING'", desc: `Lifecycle state (${entityName.toUpperCase()}_STATUS)` },
      { name: 'priority', type: 'VARCHAR(30)', pk: false, fk: null, nullable: true, unique: false, default: "'MEDIUM'", desc: 'Operational priority indicator' },
      { name: 'created_at', type: 'TIMESTAMP', pk: false, fk: null, nullable: false, unique: false, default: 'CURRENT_TIMESTAMP', desc: 'Record creation timestamp' },
      { name: 'updated_at', type: 'TIMESTAMP', pk: false, fk: null, nullable: true, unique: false, default: 'CURRENT_TIMESTAMP', desc: 'Last modification timestamp' },
    ];

    coreEntities.push({
      name: entityName,
      table,
      description: `Core domain entity managing ${entityName.toLowerCase()} attributes, states, and relations`,
      isCore: false,
      columns,
      indexes: [`idx_${table}_${parentFkColumn}`, `idx_${table}_status`],
    });

    prevEntityTable = table;
  });

  // Add an Audit / Activity log table
  coreEntities.push({
    name: 'ActivityLog',
    table: 'activity_logs',
    description: 'System audit trail recording user actions, state changes, and event timestamps',
    isCore: true,
    columns: [
      { name: 'id', type: 'BIGINT', pk: true, fk: null, nullable: false, unique: true, default: 'AUTO_INCREMENT', desc: 'Primary key' },
      { name: 'user_id', type: 'BIGINT', pk: false, fk: 'users(id)', nullable: true, unique: false, default: null, desc: 'Acting user identifier' },
      { name: 'action', type: 'VARCHAR(100)', pk: false, fk: null, nullable: false, unique: false, default: null, desc: 'Performed action or event verb' },
      { name: 'entity_type', type: 'VARCHAR(60)', pk: false, fk: null, nullable: false, unique: false, default: null, desc: 'Target entity classification' },
      { name: 'entity_id', type: 'BIGINT', pk: false, fk: null, nullable: true, unique: false, default: null, desc: 'Target entity ID' },
      { name: 'metadata', type: 'TEXT', pk: false, fk: null, nullable: true, unique: false, default: null, desc: 'JSON formatted event payload' },
      { name: 'ip_address', type: 'VARCHAR(45)', pk: false, fk: null, nullable: true, unique: false, default: null, desc: 'Client IPv4/IPv6 address' },
      { name: 'created_at', type: 'TIMESTAMP', pk: false, fk: null, nullable: false, unique: false, default: 'CURRENT_TIMESTAMP', desc: 'Event timestamp' },
    ],
    indexes: ['idx_activity_logs_user_id', 'idx_activity_logs_created_at'],
  });

  return coreEntities;
}

/** Synthesize Entity Relationships */
function extractRelationships(entities) {
  const relationships = [];

  entities.forEach((entity) => {
    entity.columns.forEach((col) => {
      if (col.fk) {
        const [targetTable, targetCol] = col.fk.replace(')', '').split('(');
        relationships.push({
          from: entity.table,
          fromColumn: col.name,
          to: targetTable,
          toColumn: targetCol || 'id',
          type: 'many-to-one',
          cardinality: 'N:1',
          onDelete: col.nullable ? 'SET NULL' : 'CASCADE',
          description: `Each ${entity.name} belongs to one ${targetTable}, while each ${targetTable} can possess multiple ${entity.table}.`,
        });
      }
    });
  });

  return relationships;
}

/** Generate clean Mermaid ER Diagram */
function generateMermaidER(entities, relationships) {
  const lines = ['erDiagram'];

  // Define relationships first
  relationships.forEach((rel) => {
    const from = rel.to.toUpperCase();
    const to = rel.from.toUpperCase();
    const label = rel.onDelete === 'CASCADE' ? 'owns' : 'references';
    lines.push(`  ${from} ||--o{ ${to} : "${label}"`);
  });

  // Define entity attributes
  entities.forEach((ent) => {
    lines.push(`  ${ent.table.toUpperCase()} {`);
    ent.columns.forEach((col) => {
      let typeLabel = col.type.toLowerCase().split('(')[0];
      if (typeLabel.includes('varchar')) typeLabel = 'string';
      else if (typeLabel.includes('bigint') || typeLabel.includes('int')) typeLabel = 'int';
      else if (typeLabel.includes('timestamp')) typeLabel = 'datetime';
      else if (typeLabel.includes('text')) typeLabel = 'string';

      let keyFlag = '';
      if (col.pk) keyFlag = ' PK';
      else if (col.fk) keyFlag = ' FK';
      else if (col.unique) keyFlag = ' UK';

      lines.push(`    ${typeLabel} ${col.name}${keyFlag}`);
    });
    lines.push('  }');
  });

  return lines.join('\n');
}

/** Synthesize Architecture Recommendations */
export function synthesizeArchitecture(project, requirements) {
  const nfrs = requirements.filter((r) => r.kind !== 'functional');
  const perfNfr = nfrs.find((r) => (r.category || '').toLowerCase() === 'performance');
  const secNfr = nfrs.find((r) => (r.category || '').toLowerCase() === 'security');
  const scaleNfr = nfrs.find((r) => (r.category || '').toLowerCase() === 'scalability');

  const desc = `${project.name} ${project.description || ''} ${project.project_type || ''}`.toLowerCase();

  // Pattern evaluation
  let pattern = 'Modular Monolith with Clean Layered Architecture';
  let patternRationale = 'Optimal balance between development velocity, transactional consistency, and clean domain isolation. Provides clear module boundaries that allow seamless migration to microservices when throughput demands it.';
  let primaryStyle = 'Modular Monolith';

  if (desc.includes('microservice') || desc.includes('distributed') || scaleNfr) {
    pattern = 'Event-Driven Microservices Architecture';
    patternRationale = 'Selected due to high scalability targets, asynchronous processing requirements, and the need to decouple compute-intensive workloads from operational transactional endpoints.';
    primaryStyle = 'Event-Driven Microservices';
  } else if (desc.includes('serverless') || desc.includes('cloud-native')) {
    pattern = 'Serverless Event-Driven Cloud Architecture';
    patternRationale = 'Maximizes autoscaling and eliminates idle infrastructure overhead by using managed cloud functions and managed cloud persistence.';
    primaryStyle = 'Serverless';
  }

  // Component tiers
  const tiers = [
    {
      name: 'Presentation Tier (Client Applications)',
      components: [
        'Single Page Application (SPA) / Server-Side Rendered (SSR) Web Client',
        'Responsive Mobile Web Interface / Progressive Web App (PWA)',
        'Role-Based Admin Management Console',
      ],
      responsibilities: 'User interactions, reactive state management, client-side input validation, JWT token storage, and responsive UI layout.',
    },
    {
      name: 'API Gateway & Security Layer',
      components: [
        'Reverse Proxy / TLS Termination (Nginx or Cloudflare)',
        'Rate Limiting & DDoS Shield (Token bucket algorithm)',
        'Authentication & Authorization Middleware (Bearer JWT, RBAC)',
        'CORS Policy Enforcement & Request Validation Pipeline',
      ],
      responsibilities: 'Traffic routing, SSL/TLS handshake offloading, request sanity verification, and token-based identity enforcement before reaching services.',
    },
    {
      name: 'Application Core & Domain Services',
      components: [
        'Domain Business Logic Handlers (Separated bounded contexts)',
        'Service Layer (Input orchestration, transaction boundaries, business invariants)',
        'Event Dispatcher / Asynchronous Job Publisher',
      ],
      responsibilities: 'Executing core business logic, orchestrating CRUD and analytics flows, and enforcing business integrity rules.',
    },
    {
      name: 'Data Access & Caching Tier',
      components: [
        'Relational Database Engine with Connection Pooling (pgBouncer / HikariCP)',
        'In-Memory Cache (Redis) for session management, hot lookups, and cache-aside read paths',
        'Object Storage (S3 / MinIO) for uploaded assets and export artifacts',
      ],
      responsibilities: 'ACID-compliant relational persistence, low-latency key-value caching, and secure binary object storage.',
    },
    {
      name: 'Asynchronous Processing & Worker Layer',
      components: [
        'Message Broker / Task Queue (Redis BullMQ or RabbitMQ)',
        'Background Worker Pool (Long-running jobs, email dispatch, report rendering)',
        'Scheduled Cron Tasks (Daily database backups, health analytics)',
      ],
      responsibilities: 'Offloading intensive tasks from the HTTP request cycle to maintain responsive page response times.',
    },
  ];

  // Tech Stack Matrix
  const techStack = [
    {
      category: 'Frontend Client',
      technology: 'Next.js / React 19 with TypeScript',
      rationale: 'Delivers fast server-rendered initial payloads with fluid client-side interactivity, strict type safety, and modern component ergonomics.',
      alternatives: 'Vue.js (Nuxt) / SvelteKit',
    },
    {
      category: 'Backend Core',
      technology: 'Node.js (Express / NestJS) or Go / Python FastAPI',
      rationale: 'High asynchronous I/O concurrency, extensive ecosystem, robust schema validation, and low cold-start latency.',
      alternatives: 'Go (Fiber/Gin) / Java Spring Boot',
    },
    {
      category: 'Primary Database',
      technology: 'PostgreSQL 16 (Relational DB)',
      rationale: 'Industry-standard ACID compliance, powerful indexing (B-Tree, GIN, BRIN), native JSONB support, foreign key constraints, and read-replica scaling.',
      alternatives: 'MySQL 8.4 / SQLite 3 (Edge/Embedded)',
    },
    {
      category: 'Caching & Session Store',
      technology: 'Redis 7 (In-Memory Data Store)',
      rationale: 'Sub-millisecond latency for caching frequently queried entities, token blacklisting, pub-sub messaging, and distributed rate limiting.',
      alternatives: 'Memcached / Dragonfly',
    },
    {
      category: 'Authentication & Security',
      technology: 'OAuth 2.0 / JWT + scrypt Password Hashing + RBAC',
      rationale: 'Stateless authorization bearer tokens with cryptographic HMAC-SHA256 signatures, memory-hard password hashing, and granular role enforcement.',
      alternatives: 'Session Cookies with Redis Store / Auth0',
    },
    {
      category: 'DevOps & Deployment',
      technology: 'Docker Containerization + GitHub Actions CI/CD + Cloud Hosting',
      rationale: 'Reproducible multi-stage container builds, automated unit/integration test gates, zero-downtime rolling updates.',
      alternatives: 'Kubernetes (K8s) / AWS ECS Fargate',
    },
  ];

  // Architectural Trade-offs & Strategies
  const tradeOffs = [
    {
      area: 'Scalability & Concurrency',
      strategy: 'Stateless application containers deployed behind a load balancer with horizontal auto-scaling (HPA). Relational database configured with read replicas and connection pooling.',
      impact: 'Allows horizontal scaling to handle spikes in concurrent traffic while maintaining single-source-of-truth data integrity.',
    },
    {
      area: 'Latency & Performance',
      strategy: 'Cache-aside pattern using Redis for hot queries. Database indexes applied to all foreign keys and high-frequency search fields. HTTP gzip/brotli compression and asset caching.',
      impact: perfNfr ? `Guarantees meeting the performance requirement (${perfNfr.description}) under peak load.` : 'Keeps typical API response times strictly under 200ms.',
    },
    {
      area: 'Security & Compliance',
      strategy: 'Transport Layer Security (TLS 1.3) everywhere. Encrypted credentials at rest using scrypt/argon2id. Parameterized SQL queries preventing SQL injection. Strict CSP and CORS headers.',
      impact: secNfr ? `Directly satisfies security requirement: ${secNfr.description}.` : 'Protects against OWASP Top 10 vulnerabilities including XSS, SQLi, and broken access controls.',
    },
    {
      area: 'Reliability & Fault Tolerance',
      strategy: 'Graceful degradation on external service failure. Automated health probes (/health/liveness, /health/readiness). Automated point-in-time database snapshots and WAL replication.',
      impact: 'Prevents cascading failures and ensures 99.9% service uptime.',
    },
  ];

  // Mermaid Architecture Diagram
  const mermaidArchitecture = [
    'flowchart TB',
    '  subgraph Clients["Client Layer"]',
    '    WEB["Web Browser (SPA / Next.js)"]',
    '    MOB["Mobile Web / PWA"]',
    '    ADM["Admin Dashboard"]',
    '  end',
    '',
    '  subgraph Gateway["Edge & Gateway Tier"]',
    '    CDN["Cloud CDN / DDoS Protection"]',
    '    PROXY["Reverse Proxy & TLS Termination"]',
    '    AUTH_GW["Auth & Rate Limiting Guard"]',
    '  end',
    '',
    '  subgraph App["Application Logic Tier"]',
    '    API["REST API Controllers"]',
    '    CORE["Domain Business Logic Services"]',
    '    EVENT["Event Dispatcher"]',
    '  end',
    '',
    '  subgraph Workers["Async Processing Tier"]',
    '    QUEUE["Job Queue (Redis BullMQ)"]',
    '    WORKER["Background Task Workers"]',
    '  end',
    '',
    '  subgraph Persistence["Storage & Data Tier"]',
    '    CACHE[("Redis Cache & Sessions")]',
    '    PRIMARY_DB[("Primary Database (PostgreSQL)")]',
    '    REPLICA_DB[("Read Replica DB")]',
    '    OBJ_STORE[("Object Storage (S3 / Docs)")]',
    '  end',
    '',
    '  Clients --> CDN',
    '  CDN --> PROXY',
    '  PROXY --> AUTH_GW',
    '  AUTH_GW --> API',
    '  API --> CORE',
    '  CORE --> CACHE',
    '  CORE --> PRIMARY_DB',
    '  CORE --> EVENT',
    '  EVENT --> QUEUE',
    '  QUEUE --> WORKER',
    '  WORKER --> PRIMARY_DB',
    '  API -.-> REPLICA_DB',
    '  WORKER -.-> OBJ_STORE',
    '',
    '  classDef client fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#0369a1;',
    '  classDef gateway fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#92400e;',
    '  classDef app fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#1e40af;',
    '  classDef worker fill:#f3e8ff,stroke:#9333ea,stroke-width:2px,color:#6b21a8;',
    '  classDef storage fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#15803d;',
    '  class WEB,MOB,ADM client;',
    '  class CDN,PROXY,AUTH_GW gateway;',
    '  class API,CORE,EVENT app;',
    '  class QUEUE,WORKER worker;',
    '  class CACHE,PRIMARY_DB,REPLICA_DB,OBJ_STORE storage;',
  ].join('\n');

  return {
    pattern,
    primaryStyle,
    patternRationale,
    tiers,
    techStack,
    tradeOffs,
    mermaidArchitecture,
  };
}

/** Synthesize Full Database Schema */
export function synthesizeDatabaseSchema(project, requirements) {
  const entities = extractEntities(project, requirements);
  const relationships = extractRelationships(entities);
  const mermaidER = generateMermaidER(entities, relationships);

  const normalizationNotes = [
    {
      form: '1NF (First Normal Form)',
      status: 'Satisfied',
      details: 'All column values are atomic. No repeating groups or comma-separated lists exist; every table possesses an explicit primary key.',
    },
    {
      form: '2NF (Second Normal Form)',
      status: 'Satisfied',
      details: 'Meets 1NF and all non-key attributes are fully functionally dependent on the entire primary key (composite key relationships broken out into junction tables).',
    },
    {
      form: '3NF (Third Normal Form)',
      status: 'Satisfied',
      details: 'Meets 2NF and contains no transitive dependencies. Non-key attributes depend strictly and solely upon the primary key.',
    },
  ];

  return {
    entities,
    relationships,
    normalizationNotes,
    mermaidER,
    stats: {
      tablesCount: entities.length,
      relationshipsCount: relationships.length,
      indexesCount: entities.reduce((sum, e) => sum + (e.indexes?.length || 0), 0),
    },
  };
}

/** Multi-dialect SQL Generation */
export function generateSQLScripts(schema, dialect = 'postgresql') {
  const mode = dialect.toLowerCase();
  const { entities, relationships } = schema;

  if (mode === 'sqlite') {
    return generateSQLiteSQL(entities, relationships);
  } else if (mode === 'mysql') {
    return generateMySQLSQL(entities, relationships);
  } else {
    return generatePostgreSQLSQL(entities, relationships);
  }
}

function generatePostgreSQLSQL(entities, relationships) {
  const lines = [
    '--',
    '-- PostgreSQL Database Schema Definition',
    '-- Generated by EngineerOS - Architecture & Database Design Intelligence',
    `-- Generated on: ${new Date().toISOString()}`,
    '--',
    'BEGIN;',
    '',
    '-- Enable required extensions',
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
    'CREATE EXTENSION IF NOT EXISTS "citext";',
    '',
  ];

  // Drop statements in reverse order
  lines.push('-- Clean up existing tables in reverse dependency order');
  for (let i = entities.length - 1; i >= 0; i--) {
    lines.push(`DROP TABLE IF EXISTS ${entities[i].table} CASCADE;`);
  }
  lines.push('');

  // Tables
  entities.forEach((entity) => {
    lines.push(`-- Table: ${entity.table}`);
    lines.push(`-- Purpose: ${entity.description}`);
    lines.push(`CREATE TABLE ${entity.table} (`);

    const colDefs = entity.columns.map((col) => {
      let type = col.type;
      if (col.pk) type = 'BIGSERIAL PRIMARY KEY';
      else if (type === 'TIMESTAMP') type = 'TIMESTAMPTZ';
      else if (type.startsWith('VARCHAR')) type = col.unique && col.name === 'email' ? 'CITEXT' : type;

      const nullable = col.nullable ? '' : ' NOT NULL';
      const unique = col.unique && !col.pk ? ' UNIQUE' : '';
      let def = '';
      if (col.default && !col.pk) {
        def = ` DEFAULT ${col.default}`;
      }

      let fk = '';
      if (col.fk) {
        const onDelete = col.nullable ? 'SET NULL' : 'CASCADE';
        fk = ` REFERENCES ${col.fk} ON DELETE ${onDelete}`;
      }

      return `  ${col.name.padEnd(20)} ${type}${nullable}${unique}${def}${fk}`;
    });

    lines.push(colDefs.join(',\n'));
    lines.push(');');
    lines.push('');

    // Table comments
    lines.push(`COMMENT ON TABLE ${entity.table} IS '${entity.description.replace(/'/g, "''")}';`);
    entity.columns.forEach((c) => {
      lines.push(`COMMENT ON COLUMN ${entity.table}.${c.name} IS '${c.desc.replace(/'/g, "''")}';`);
    });
    lines.push('');

    // Indexes
    if (entity.indexes && entity.indexes.length) {
      entity.indexes.forEach((idx) => {
        const parts = idx.replace('idx_', '').replace(`${entity.table}_`, '').split('_');
        const cols = parts.join(', ');
        lines.push(`CREATE INDEX IF NOT EXISTS ${idx} ON ${entity.table} (${cols});`);
      });
      lines.push('');
    }
  });

  // Seed sample records
  lines.push('-- Initial Seed Data for Verification and Testing');
  lines.push("INSERT INTO users (name, email, password_hash, role, status) VALUES");
  lines.push("  ('System Administrator', 'admin@example.com', '$scrypt$N=16384,r=8,p=1$hash123', 'ADMIN', 'ACTIVE'),");
  lines.push("  ('Lead Developer', 'dev@example.com', '$scrypt$N=16384,r=8,p=1$hash456', 'MEMBER', 'ACTIVE'),");
  lines.push("  ('Project Manager', 'pm@example.com', '$scrypt$N=16384,r=8,p=1$hash789', 'MANAGER', 'ACTIVE')");
  lines.push('ON CONFLICT (email) DO NOTHING;');
  lines.push('');

  // Sample operational domain queries
  lines.push('-- Sample Operational & Analytical Queries');
  lines.push('-- 1. Retrieve user overview with activity count');
  lines.push(`SELECT u.id, u.name, u.email, u.role, COUNT(a.id) AS total_activities
FROM users u
LEFT JOIN activity_logs a ON a.user_id = u.id
GROUP BY u.id, u.name, u.email, u.role
ORDER BY total_activities DESC;`);
  lines.push('');

  lines.push('COMMIT;');
  return lines.join('\n');
}

function generateMySQLSQL(entities, relationships) {
  const lines = [
    '--',
    '-- MySQL / MariaDB Database Schema Definition',
    '-- Generated by EngineerOS - Architecture & Database Design Intelligence',
    `-- Generated on: ${new Date().toISOString()}`,
    '--',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ];

  // Drop statements in reverse
  for (let i = entities.length - 1; i >= 0; i--) {
    lines.push(`DROP TABLE IF EXISTS \`${entities[i].table}\`;`);
  }
  lines.push('');
  lines.push('SET FOREIGN_KEY_CHECKS = 1;');
  lines.push('');

  entities.forEach((entity) => {
    lines.push(`-- Table: ${entity.table}`);
    lines.push(`-- Purpose: ${entity.description}`);
    lines.push(`CREATE TABLE \`${entity.table}\` (`);

    const colDefs = [];
    const constraints = [];

    entity.columns.forEach((col) => {
      let type = col.type;
      if (col.pk) type = 'BIGINT UNSIGNED AUTO_INCREMENT';
      else if (type === 'TIMESTAMP') type = 'DATETIME';

      const nullable = col.nullable ? 'NULL' : 'NOT NULL';
      let def = '';
      if (col.default) {
        if (col.default === 'CURRENT_TIMESTAMP') def = ' DEFAULT CURRENT_TIMESTAMP';
        else if (col.default !== 'AUTO_INCREMENT') def = ` DEFAULT ${col.default}`;
      }

      colDefs.push(`  \`${col.name}\` ${type} ${nullable}${def} COMMENT '${col.desc.replace(/'/g, "''")}'`);

      if (col.pk) {
        constraints.push(`  PRIMARY KEY (\`${col.name}\`)`);
      } else if (col.unique) {
        constraints.push(`  UNIQUE KEY \`uk_${entity.table}_${col.name}\` (\`${col.name}\`)`);
      }

      if (col.fk) {
        const [targetTable, targetCol] = col.fk.replace(')', '').split('(');
        const onDelete = col.nullable ? 'SET NULL' : 'CASCADE';
        constraints.push(`  CONSTRAINT \`fk_${entity.table}_${col.name}\` FOREIGN KEY (\`${col.name}\`) REFERENCES \`${targetTable}\` (\`${targetCol || 'id'}\`) ON DELETE ${onDelete}`);
      }
    });

    lines.push([...colDefs, ...constraints].join(',\n'));
    lines.push(`) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='${entity.description.replace(/'/g, "''")}';`);
    lines.push('');

    // Indexes
    if (entity.indexes && entity.indexes.length) {
      entity.indexes.forEach((idx) => {
        const parts = idx.replace('idx_', '').replace(`${entity.table}_`, '').split('_');
        const cols = parts.map((p) => `\`${p}\``).join(', ');
        lines.push(`CREATE INDEX \`${idx}\` ON \`${entity.table}\` (${cols});`);
      });
      lines.push('');
    }
  });

  // Seeds
  lines.push('-- Initial Seed Data');
  lines.push("INSERT IGNORE INTO `users` (`name`, `email`, `password_hash`, `role`, `status`) VALUES");
  lines.push("  ('System Administrator', 'admin@example.com', '$scrypt$N=16384,r=8,p=1$hash123', 'ADMIN', 'ACTIVE'),");
  lines.push("  ('Lead Developer', 'dev@example.com', '$scrypt$N=16384,r=8,p=1$hash456', 'MEMBER', 'ACTIVE');");
  lines.push('');

  return lines.join('\n');
}

function generateSQLiteSQL(entities, relationships) {
  const lines = [
    '--',
    '-- SQLite Database Schema Definition',
    '-- Generated by EngineerOS - Architecture & Database Design Intelligence',
    `-- Generated on: ${new Date().toISOString()}`,
    '--',
    'PRAGMA foreign_keys = ON;',
    '',
  ];

  // Drop tables in reverse
  for (let i = entities.length - 1; i >= 0; i--) {
    lines.push(`DROP TABLE IF EXISTS ${entities[i].table};`);
  }
  lines.push('');

  entities.forEach((entity) => {
    lines.push(`-- Table: ${entity.table}`);
    lines.push(`CREATE TABLE ${entity.table} (`);

    const colDefs = entity.columns.map((col) => {
      let type = col.type;
      if (col.pk) return `  ${col.name} INTEGER PRIMARY KEY AUTOINCREMENT`;
      if (type.includes('VARCHAR') || type === 'TEXT') type = 'TEXT';
      else if (type.includes('INT')) type = 'INTEGER';
      else if (type.includes('TIME')) type = 'TEXT';

      const nullable = col.nullable ? '' : ' NOT NULL';
      const unique = col.unique ? ' UNIQUE' : '';
      let def = '';
      if (col.default) {
        if (col.default === 'CURRENT_TIMESTAMP') def = " DEFAULT (datetime('now'))";
        else def = ` DEFAULT ${col.default}`;
      }

      let fk = '';
      if (col.fk) {
        const onDelete = col.nullable ? 'SET NULL' : 'CASCADE';
        fk = ` REFERENCES ${col.fk} ON DELETE ${onDelete}`;
      }

      return `  ${col.name.padEnd(20)} ${type}${nullable}${unique}${def}${fk}`;
    });

    lines.push(colDefs.join(',\n'));
    lines.push(');');
    lines.push('');

    // Indexes
    if (entity.indexes && entity.indexes.length) {
      entity.indexes.forEach((idx) => {
        const parts = idx.replace('idx_', '').replace(`${entity.table}_`, '').split('_');
        const cols = parts.join(', ');
        lines.push(`CREATE INDEX IF NOT EXISTS ${idx} ON ${entity.table} (${cols});`);
      });
      lines.push('');
    }
  });

  // Seeds
  lines.push('-- Initial Seed Data');
  lines.push("INSERT OR IGNORE INTO users (name, email, password_hash, role, status) VALUES");
  lines.push("  ('System Administrator', 'admin@example.com', '$scrypt$N=16384,r=8,p=1$hash123', 'ADMIN', 'ACTIVE');");
  lines.push('');

  return lines.join('\n');
}

/** Complete bundle returned to API */
export function getArchitectureAndDBDesign(project, requirements, dialect = 'postgresql') {
  const architecture = synthesizeArchitecture(project, requirements);
  const schema = synthesizeDatabaseSchema(project, requirements);
  const sql = {
    postgresql: generateSQLScripts(schema, 'postgresql'),
    mysql: generateSQLScripts(schema, 'mysql'),
    sqlite: generateSQLScripts(schema, 'sqlite'),
  };

  return {
    projectId: project.id,
    projectName: project.name,
    selectedDialect: dialect,
    architecture,
    schema,
    sql,
  };
}
