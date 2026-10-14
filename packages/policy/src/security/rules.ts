/** Regla defensiva estática de `foker check-security` (heurística léxica, no un SAST completo). */
export interface SecurityRule {
  /** `FKR-SEC-NNN`. */
  id: string;
  title: string;
  /** Capítulo de OWASP ASVS 5.0 que la motiva (nivel de capítulo; sin afirmar cumplimiento, ADR-017). */
  asvs: string;
  severity: 'error' | 'warning';
  /** Solo se evalúa si la ruta coincide. */
  applies: (path: string) => boolean;
  /** Líneas (base 1) que incumplen la regla. */
  check: (content: string, path: string) => number[];
  hint: string;
}

const lineOf = (content: string, index: number) => content.slice(0, index).split('\n').length;
const isCode = (p: string) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(p);
const isTest = (p: string) => /(?:^|\/)(?:e2e|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p);
const source = (p: string) => isCode(p) && !isTest(p);

/** Líneas donde coincide `regex`, ignorando comentarios de línea completos. */
function lines(content: string, regex: RegExp): number[] {
  const out: number[] = [];
  for (const [i, line] of content.split('\n').entries()) {
    const t = line.trimStart();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    if (regex.test(line)) out.push(i + 1);
  }
  return out;
}
const global = (regex: RegExp) => (content: string) => lines(content, regex);
/** Un solo hallazgo en la línea 1 si el archivo no contiene ninguna de las señales. */
const missing = (signals: RegExp) => (content: string) => (signals.test(content) ? [] : [1]);

const ROUTE = /(?:^|\/)app\/api\/.*\/route\.[cm]?[jt]s$/;
const WEBHOOK = /webhook/i;
const AUTHZ =
  /\b(?:auth|getServerSession|requireRole|requireUser|requireSession|getSession|verifySession)\s*\(|\bsession\b/;
const TENANT = /tenant_?id|tenantId|org(?:anization)?_?id|owner_?id|ownerId|user_?id|userId|workspaceId/i;

export const SECURITY_RULES: readonly SecurityRule[] = [
  {
    id: 'FKR-SEC-001',
    title: 'SQL crudo o concatenado; usa solo el ORM',
    asvs: 'V1',
    severity: 'error',
    applies: source,
    check: (c) => [
      ...lines(c, /\bsql\.raw\s*\(|\$(?:queryRaw|executeRaw)Unsafe\b|\.unsafe\s*\(/),
      ...lines(
        c,
        /\.(?:query|execute|raw)\s*\(\s*(?:`[^`]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{|["'][^"']*\b(?:SELECT|INSERT|UPDATE|DELETE)\b[^"']*["']\s*\+)/i,
      ),
    ],
    hint: 'Usa el constructor de consultas de Drizzle o Prisma con parámetros enlazados.',
  },
  {
    id: 'FKR-SEC-002',
    title: 'Webhook sin verificación HMAC',
    asvs: 'V4',
    severity: 'error',
    applies: (p) => source(p) && ROUTE.test(p) && WEBHOOK.test(p),
    check: missing(/createHmac|timingSafeEqual|\.webhooks\.constructEvent|verifyWebhook|verifySignature/),
    hint: 'Calcula el HMAC del cuerpo sin procesar y compáralo con la firma antes de leer el JSON.',
  },
  {
    id: 'FKR-SEC-003',
    title: 'Firma comparada sin tiempo constante',
    asvs: 'V11',
    severity: 'error',
    applies: (p) => source(p) && WEBHOOK.test(p),
    check: global(
      /\b(?:signature|digest|hmac|sig|expected)\w*\)?\s*(?:===|!==|==|!=)|(?:===|!==|==|!=)\s*[\w.]*(?:signature|digest|hmac|expected)\w*/i,
    ),
    hint: 'Usa crypto.timingSafeEqual con buffers de igual longitud.',
  },
  {
    id: 'FKR-SEC-004',
    title: 'Handler de API sin autenticación ni autorización visibles',
    asvs: 'V8',
    severity: 'warning',
    applies: (p) => source(p) && ROUTE.test(p) && !WEBHOOK.test(p) && !/\/health\//.test(p),
    check: missing(AUTHZ),
    hint: 'Exige sesión y rol (RBAC) antes de acceder a datos; si es público, documéntalo.',
  },
  {
    id: 'FKR-SEC-005',
    title: 'Acceso a datos sin filtro de inquilino o propietario',
    asvs: 'V8',
    severity: 'warning',
    applies: (p) =>
      source(p) && (ROUTE.test(p) || /(?:^|\/)(?:actions|server)\//.test(p) || /actions?\.[jt]s$/.test(p)),
    check: (c) =>
      /\bdb\s*\.\s*(?:select|update|delete|query)\b/.test(c) && !TENANT.test(c)
        ? [lineOf(c, c.search(/\bdb\s*\./))]
        : [],
    hint: 'Añade where(tenantId = sesión.tenantId) a cada consulta o centraliza el filtro en una capa de acceso.',
  },
  {
    id: 'FKR-SEC-006',
    title: 'next.config sin Content-Security-Policy',
    asvs: 'V3',
    severity: 'error',
    applies: (p) => /(?:^|\/)next\.config\.[cm]?[jt]s$/.test(p),
    check: missing(/Content-Security-Policy|buildCsp/i),
    hint: 'Define una CSP con nonce o hashes y sin unsafe-inline en producción.',
  },
  {
    id: 'FKR-SEC-007',
    title: 'next.config sin Strict-Transport-Security',
    asvs: 'V12',
    severity: 'error',
    applies: (p) => /(?:^|\/)next\.config\.[cm]?[jt]s$/.test(p),
    check: missing(/Strict-Transport-Security/i),
    hint: 'Envía Strict-Transport-Security: max-age=31536000; includeSubDomains.',
  },
  {
    id: 'FKR-SEC-008',
    title: 'HTML sin escapar (dangerouslySetInnerHTML)',
    asvs: 'V1',
    severity: 'error',
    applies: source,
    check: global(/dangerouslySetInnerHTML|\.innerHTML\s*=/),
    hint: 'Renderiza texto con el escape de React o sanea con una biblioteca auditada.',
  },
  {
    id: 'FKR-SEC-009',
    title: 'Ejecución dinámica de código (eval / new Function)',
    asvs: 'V15',
    severity: 'error',
    applies: source,
    check: global(/(?<![\w.])eval\s*\(|new\s+Function\s*\(/),
    hint: 'Sustituye por una tabla de funciones o un parser de datos.',
  },
  {
    id: 'FKR-SEC-010',
    title: 'Comando de shell construido con datos o con shell: true',
    asvs: 'V1',
    severity: 'error',
    applies: source,
    check: global(/\b(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|[^)'"`]*\+)|shell\s*:\s*true/),
    hint: 'Usa execFile con un arreglo de argumentos y sin shell.',
  },
  {
    id: 'FKR-SEC-011',
    title: 'Verificación TLS desactivada',
    asvs: 'V12',
    severity: 'error',
    applies: source,
    check: global(/rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/),
    hint: 'Conserva la verificación; instala la CA en el almacén de confianza.',
  },
  {
    id: 'FKR-SEC-012',
    title: 'Criptografía débil (MD5, SHA-1, Math.random para secretos)',
    asvs: 'V11',
    severity: 'error',
    applies: source,
    check: (c) => [
      ...lines(c, /createHash\s*\(\s*["'](?:md5|sha1)["']/i),
      ...(/token|secret|session|password|nonce|apikey/i.test(c) ? lines(c, /Math\.random\s*\(/) : []),
    ],
    hint: 'Usa SHA-256 o superior y crypto.randomBytes / randomUUID para valores secretos.',
  },
  {
    id: 'FKR-SEC-013',
    title: 'CORS abierto a cualquier origen',
    asvs: 'V3',
    severity: 'warning',
    applies: source,
    check: global(/Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']|origin\s*:\s*(?:["']\*["']|true)\b/),
    hint: 'Permite una lista explícita de orígenes; nunca * con credenciales.',
  },
  {
    id: 'FKR-SEC-014',
    title: 'Cookie de sesión sin httpOnly / secure / sameSite',
    asvs: 'V7',
    severity: 'warning',
    applies: source,
    check: (c) => {
      const out: number[] = [];
      for (const m of c.matchAll(/cookies\(\)\s*\.set\s*\(([^;]*?)\)\s*;?|Set-Cookie[^\n]*/g)) {
        const text = m[0];
        if (!/httpOnly|HttpOnly/.test(text) || !/secure|Secure/.test(text) || !/sameSite|SameSite/.test(text))
          out.push(lineOf(c, m.index ?? 0));
      }
      return out;
    },
    hint: 'Fija httpOnly: true, secure: true y sameSite: "lax" o "strict".',
  },
  {
    id: 'FKR-SEC-015',
    title: 'Herramienta MCP sin validación de entrada',
    asvs: 'V2',
    severity: 'warning',
    applies: source,
    check: (c) =>
      /\b(?:registerTool|server\.tool)\s*\(/.test(c) && !/\bz\.|zod|inputSchema|safeParse|ajv/i.test(c)
        ? [lineOf(c, c.search(/\b(?:registerTool|server\.tool)\s*\(/))]
        : [],
    hint: 'Declara inputSchema (zod o JSON Schema), valida antes de usar los argumentos y trata la salida como datos.',
  },
];
