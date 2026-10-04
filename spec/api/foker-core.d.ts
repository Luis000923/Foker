/**
 * Contrato normativo de la API nativa de Foker (FOKER-SPEC §7.2).
 *
 * RECONSTRUIDO el 2026-10-03 a partir de FOKER-SPEC §7–§9 y de los JSON Schemas de
 * packages/schemas (ADR-019). El original no se recuperó. Los nombres de los campos usan
 * camelCase; los documentos JSON equivalentes (project-map, context-pack) usan snake_case.
 *
 * El `binding.d.cts` que genera napi-rs para `@foker/core` debe ser compatible con este archivo
 * (test de contrato, FOKER-SPEC §19.1).
 */

/** Códigos que el núcleo nativo puede poner en `error.code` (FOKER-SPEC §18). */
export type FokerErrorCode =
  | 'FKR-CFG-002'
  | 'FKR-INP-001'
  | 'FKR-MAP-001'
  | 'FKR-MAP-003'
  | 'FKR-MAP-004'
  | 'FKR-MAP-005'
  | 'FKR-MAP-006'
  | 'FKR-CTX-001'
  | 'FKR-POL-001'
  | 'FKR-INT-001';

/**
 * Error lanzado por el addon: un `Error` de JS con `code`. Las funciones async no pueden fijar
 * `code`; el código llega como prefijo `[FKR-…] ` del mensaje y `@foker/core` lo normaliza.
 */
export interface FokerNativeError extends Error {
  code: FokerErrorCode;
}

export interface VersionInfo {
  /** Debe coincidir exactamente con la versión de `@foker/core` (REQ-NAPI-003). */
  coreVersion: string;
  /** Entero; se incrementa al romper este contrato. */
  nativeApi: number;
  /** `schema_version` del Project Map. */
  mapSchema: number;
  /** `pack_version` del Context Pack. */
  contextSchema: number;
  /** Gramática tree-sitter → versión. */
  grammars: Record<string, string>;
}

export type Language = 'typescript' | 'tsx' | 'javascript' | 'jsx';

export type FileKind = 'source' | 'test' | 'declaration' | 'config' | 'generated';

export type ParseStatus = 'ok' | 'partial' | 'failed' | 'skipped';

/**
 * Sección `map` efectiva de foker.config.yaml más los globs de secretos de la política.
 * Los campos omitidos toman los defaults de Foker (FOKER-SPEC §8.3, §11.3).
 */
export interface EngineConfig {
  /** Solo lee el disco: no aparta mapas corruptos ni guarda mapa o caché; save falla. Por defecto false. */
  readOnly?: boolean;
  include?: string[];
  exclude?: string[];
  tsconfig?: string[];
  /** Globs de secretos: nunca se leen ni entran en el mapa. */
  secretGlobs?: string[];
  maxFileBytes?: number;
  maxFiles?: number;
  kinds?: { test?: string[]; declaration?: string[]; config?: string[]; generated?: string[] };
}

export interface ContextConfig {
  defaultBudgetTokens: number;
  coreFiles: number;
}

export interface RefreshOptions {
  /** Reconstrucción completa ignorando la caché de parseo. */
  full?: boolean;
}

export interface Diagnostic {
  /** `FKR-…`; los 1xx son diagnósticos. */
  code: string;
  message: string;
  file?: string;
  range?: Range;
  subject?: string;
}

export interface RefreshReport {
  added: string[];
  changed: string[];
  removed: string[];
  /** Diagnósticos nuevos (errores de parseo, imports no resueltos…). */
  diagnostics: Diagnostic[];
  durationMs: number;
  contentHash: string;
  /** true si hubo reconstrucción completa (mapa ausente, corrupto o incompatible). */
  rebuilt: boolean;
  /** true si nada cambió en disco y no se recalculó (REQ-MAP-003). */
  unchanged: boolean;
}

export interface MapStatus {
  contentHash: string;
  files: number;
  symbols: number;
  /** Archivos cuyo mtime/tamaño difiere del mapa en memoria (estimación barata). */
  staleFiles: number;
  schemaVersion: number;
}

export interface SaveReport {
  /** Id relativo al root: `.foker/project-map.json`. */
  path: string;
  bytes: number;
  contentHash: string;
}

export interface SearchQuery {
  query: string;
  kind?: 'file' | 'symbol' | 'any';
  limit?: number;
}

export interface SearchHit {
  id: string;
  kind: 'file' | 'symbol';
  name: string;
  file: string;
  signature?: string;
  score: number;
}

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'property'
  | 'interface'
  | 'type_alias'
  | 'enum'
  | 'variable'
  | 'namespace';

export interface Position {
  line: number;
  col: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface SymbolInfo {
  id: string;
  name: string;
  kind: SymbolKind;
  tags: string[];
  exported: 'none' | 'named' | 'default' | 'reexport';
  signature: string;
  doc: string | null;
  range: Range;
  parent: string | null;
  file: string;
}

export interface FileInfo {
  id: string;
  package: string | null;
  language: Language;
  kind: FileKind;
  hash: string;
  sizeBytes: number;
  lines: number;
  parseStatus: ParseStatus;
  rankGlobal: number;
  exports: string[];
  /** Ids de archivo que este importa (aristas imports/imports_type/reexports). */
  imports: string[];
  /** Ids de archivo que importan a este (derivado invirtiendo aristas). */
  importedBy: string[];
  /** Ids de los símbolos declarados en el archivo. */
  symbols: string[];
}

export interface ImpactRequest {
  files?: string[];
  symbols?: string[];
  direction?: 'dependents' | 'dependencies' | 'both';
  depth?: number;
}

export interface ImpactNode {
  id: string;
  distance: number;
  via: string | null;
  kind: 'file' | 'symbol' | 'package';
}

export interface ImpactReport {
  nodes: ImpactNode[];
  packages: string[];
  tests: string[];
  diagnostics: Diagnostic[];
}

export type Intent = 'fix' | 'add' | 'modify' | 'refactor' | 'test' | 'explain';

export interface ContextRequest {
  task: string;
  anchors?: { files?: string[]; symbols?: string[] };
  intent?: Intent;
  budgetTokens?: number;
  /** Máximo de archivos core; default 15, cero desactiva su selección. */
  coreFiles?: number;
  /** Cuerpo de SKILL.md sin frontmatter; lo lee @foker/engine. */
  skill?: { name: string; body: string; requiredFiles: string[]; requiredSymbols: string[] };
  /** Contenido de foker/rules.md; lo lee @foker/engine. */
  rules?: string;
  /** Alcance de la tarea (globs) y su descripción, si hay task_id. */
  taskScope?: { taskId: string; description: string; paths: string[]; checks: string[] };
  /** Archivos con cambios sin commitear, calculados por @foker/engine con git. */
  dirtyFiles?: string[];
  explain?: boolean;
}

export type RenderLevel = 'L0' | 'L1' | 'L2' | 'L3';

export interface PackFile {
  id: string;
  level: RenderLevel;
  tokens: number;
  score: number;
  reasons: string[];
  note?: string;
}

export interface PackSection {
  id: 'rules' | 'core' | 'skill' | 'task_scope' | 'related' | 'targets' | 'request';
  class: 'mandatory' | 'optional';
  stability: 'static' | 'session' | 'task';
  tokens: number;
  hash: string;
}

export interface ContextPack {
  packVersion: number;
  packHash: string;
  mapHash: string;
  intent: Intent;
  intentSource: 'request' | 'inferred';
  budget: { limit: number; used: number; estimator: string };
  sections: PackSection[];
  files: PackFile[];
  excluded: { id: string; reason: 'BUDGET' | 'RANK_CUTOFF'; score: number }[];
  diagnostics: Diagnostic[];
  rendered: string;
  /** JSON canónico snake_case conforme a context-pack.schema.json. */
  json: string;
}

export declare class FokerEngine {
  /** Abre el motor para un root absoluto. Carga el mapa si es válido; si no, queda vacío. */
  static open(root: string, config?: EngineConfig | null): Promise<FokerEngine>;
  /** Avisos de la carga, p. ej. FKR-MAP-005 si el mapa persistido estaba corrupto. */
  loadDiagnostics(): Diagnostic[];
  refresh(opts?: RefreshOptions | null): Promise<RefreshReport>;
  status(): MapStatus;
  /** Archivos que difieren del disco, sin reconstruir. */
  checkStale(): Promise<number>;
  save(): Promise<SaveReport>;
  /** JSON canónico del mapa completo (evita crear millones de objetos JS). */
  exportMapJson(): Promise<string>;
  search(q: SearchQuery): SearchHit[];
  fileInfo(id: string): FileInfo | null;
  symbolInfo(id: string): SymbolInfo | null;
  impact(req: ImpactRequest): ImpactReport;
  buildContext(req: ContextRequest): Promise<ContextPack>;
}

export declare function versionInfo(): VersionInfo;

/** Normaliza una ruta de entrada a id (REQ-XPLAT-001…003). Lanza FKR-POL-001 si es inválida. */
export declare function normalizePath(root: string, input: string): string;

/** ceil(bytes UTF-8 con CRLF→LF / 3,2). */
export declare function estimateTokens(text: string): number;

/** Misma semántica de globs que el motor, para que la política en TS no la reimplemente. */
export declare function matchGlobs(id: string, globs: string[]): boolean;

/** BLAKE3 del JSON canónico; JSON inválido: FKR-INP-001. */
export declare function hashCanonicalJson(json: string): string;
