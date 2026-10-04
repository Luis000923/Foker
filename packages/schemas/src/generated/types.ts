/* Generado por packages/schemas/scripts/generate.mjs desde schemas/*.json. No editar. */

export type Semver = string
/**
 * Fecha y hora RFC 3339 en UTC.
 */
export type Timestamp = string
/**
 * Hash BLAKE3 en hexadecimal con prefijo.
 */
export type Hash = string
export type PackageId = string
/**
 * Ruta normalizada (REQ-XPLAT-001): POSIX, relativa al root, sin segmentos . ni .., sin barra inicial ni final.
 */
export type FileId = string
/**
 * <file_id>#<nombre_calificado>[~n]. Exportación por defecto anónima: #default.
 */
export type SymbolId = string
/**
 * Arista tipada (FOKER-SPEC §8.2). Ordenadas por (kind, from, to).
 */
export type MapEdge = {
kind: ("imports" | "imports_type" | "reexports" | "imports_external" | "uses_symbol" | "extends" | "implements" | "package_depends")
from: string
to: string
confidence: ("resolved" | "heuristic" | "declared")
/**
 * uses_symbol: nº de referencias al binding en el archivo.
 */
weight?: number
}
/**
 * npm:<paquete> o node:<módulo integrado>.
 */
export type ExternalModuleId = string
/**
 * Código FKR-<ÁREA>-<NNN> (FOKER-SPEC §18). Los 1xx son diagnósticos.
 */
export type ErrorCode = string
export type Intent = ("fix" | "add" | "modify" | "refactor" | "test" | "explain")
/**
 * tsk_ + ULID.
 */
export type TaskId = string
/**
 * L3 contenido completo, L2 firmas + tipos + JSDoc, L1 firmas, L0 ruta + nombres exportados.
 */
export type RenderLevel = ("L0" | "L1" | "L2" | "L3")
/**
 * Razón de inclusión (FOKER-SPEC §9.7). SKILL_CONTEXT marca anclas débiles de required_context (§13.2).
 */
export type Reason = string
export type TaskState = ("PENDING" | "PLANNED" | "RUNNING" | "VALIDATING" | "REJECTED" | "AWAITING_APPROVAL" | "BLOCKED" | "COMPLETED" | "FAILED" | "CANCELLED")
/**
 * Glob relativo al root con separador /.
 */
export type Glob = string
/**
 * mcp:<clientInfo.name> | cli:<usuario> | foker (transiciones automáticas).
 */
export type Actor = string
/**
 * Qué debe hacer el agente o la persona a continuación.
 */
export type NextAction = ("work_and_submit" | "fix_and_resubmit" | "await_human_approval" | "blocked_contact_human" | "done" | "failed" | "cancelled")
export type Globs = Glob[]
export type Name = string
export type CheckConfig = ({
/**
 * @minItems 1
 */
run: [Argument, ...(Argument)[]]
timeout_s?: number
/**
 * El check necesita red (p. ej. pnpm audit).
 */
network?: boolean
cwd?: Glob
/**
 * Parser de hallazgos de la salida.
 */
parser?: ("tsc" | "eslint" | "vitest" | "generic")
} | {
builtin: "secret-scan"
timeout_s?: number
})
/**
 * Argumento de argv. ${affected_packages} es el único marcador permitido y debe ocupar el argumento entero.
 */
export type Argument = ("${affected_packages}" | string)
/**
 * Avisos no fatales, p. ej. salida truncada a 80.000 caracteres (FOKER-SPEC §10.5).
 */
export type Diagnostics = Diagnostic[]
export type FokerImpactInput = ({
[k: string]: unknown | undefined
} & {
/**
 * @minItems 1
 * @maxItems 20
 */
files?: [string]|[string, string]|[string, string, string]|[string, string, string, string]|[string, string, string, string, string]|[string, string, string, string, string, string]|[string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]
/**
 * @minItems 1
 * @maxItems 20
 */
symbols?: [string]|[string, string]|[string, string, string]|[string, string, string, string]|[string, string, string, string, string]|[string, string, string, string, string, string]|[string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]
direction?: ("dependents" | "dependencies" | "both")
depth?: number
})

export interface FokerSchemaTypes {
projectMap?: ProjectMap
contextPack?: ContextPack
contextRequest?: ContextRequest
taskRecord?: TaskRecord
taskEvent?: TaskEvent
taskEvidence?: TaskEvidence
fokerConfig?: FokerConfig
fokerSkill?: FokerSkill
fokerMd?: FokerMdFrontmatter
cliOutput?: CliOutput
benchmarkResult?: BenchmarkResult
benchmarkManifest?: BenchmarkManifest
foker_check_input?: FokerCheckInput
foker_check_output?: FokerCheckOutput
foker_context_input?: FokerContextInput
foker_context_output?: FokerContextOutput
foker_impact_input?: FokerImpactInput
foker_impact_output?: FokerImpactOutput
foker_search_input?: FokerSearchInput
foker_search_output?: FokerSearchOutput
foker_status_input?: FokerStatusInput
foker_status_output?: FokerStatusOutput
foker_task_begin_input?: FokerTaskBeginInput
foker_task_begin_output?: FokerTaskBeginOutput
foker_task_get_input?: FokerTaskGetInput
foker_task_get_output?: FokerTaskGetOutput
foker_task_submit_input?: FokerTaskSubmitInput
foker_task_submit_output?: FokerTaskSubmitOutput
}
/**
 * Estado estructural derivado del proyecto gestionado. Caché reconstruible; ver FOKER-SPEC §8. Todas las colecciones van ordenadas por id para serialización canónica.
 */
export interface ProjectMap {
$schema?: string
schema_version: 1
foker_version: Semver
generator: {
engine: Semver
/**
 * Gramática tree-sitter → versión.
 */
parsers: {
[k: string]: string | undefined
}
/**
 * Versión de oxc_resolver.
 */
resolver: string
}
generated_at: Timestamp
content_hash: Hash
config_hash: Hash
project: {
name: string
workspace_kind: ("pnpm" | "npm" | "yarn" | "single")
packages: MapPackage[]
}
files: MapFile[]
symbols: MapSymbol[]
edges: MapEdge[]
/**
 * Paquetes npm y módulos integrados de Node importados, ordenados.
 */
external_modules: ExternalModuleId[]
/**
 * Imports no resueltos, errores de parseo, archivos omitidos por tamaño. Ordenados por (file, code, subject).
 */
diagnostics: Diagnostic[]
stats: {
files: number
symbols: number
edges: number
parse_errors?: number
unresolved_imports?: number
/**
 * Excluido de content_hash.
 */
duration_ms: number
}
}
export interface MapPackage {
id: PackageId
name: string
/**
 * Directorio del paquete; "." para el root.
 */
path: string
version?: (string | null)
}
export interface MapFile {
id: FileId
package: (PackageId | null)
language: ("typescript" | "tsx" | "javascript" | "jsx")
kind: ("source" | "test" | "declaration" | "config" | "generated")
hash: Hash
size_bytes: number
lines: number
/**
 * Solo para detección de cambios; excluido de content_hash.
 */
mtime_ns: number
parse_status: ("ok" | "partial" | "failed" | "skipped")
rank: {
/**
 * PageRank global normalizado (suma 1), redondeado a 1e-12.
 */
global: number
}
exports: SymbolId[]
}
export interface MapSymbol {
id: SymbolId
name: string
kind: ("function" | "class" | "method" | "property" | "interface" | "type_alias" | "enum" | "variable" | "namespace")
/**
 * Heurísticas no normativas.
 */
tags: ("react_component" | "react_hook" | "next_route" | "test_case" | "async")[]
exported: ("none" | "named" | "default" | "reexport")
/**
 * Firma sin cuerpo; máx. 400 caracteres más … si se trunca.
 */
signature: string
/**
 * Primer párrafo de JSDoc; máx. 300 caracteres más ….
 */
doc: (string | null)
range: Range
parent: (SymbolId | null)
}
export interface Range {
start: Position
end: Position
}
/**
 * Posición base 0; columna en bytes UTF-8.
 */
export interface Position {
line: number
col: number
}
/**
 * Resultado de dominio esperado que no es un error (REQ-NAPI-002).
 */
export interface Diagnostic {
code: ErrorCode
message: string
file?: FileId
range?: Range
/**
 * Especificador, ancla o símbolo al que se refiere.
 */
subject?: string
}
/**
 * Salida determinista del Context Engine (FOKER-SPEC §9). Las claves usan snake_case en JSON; la API nativa expone camelCase.
 */
export interface ContextPack {
pack_version: 1
pack_hash: Hash
map_hash: Hash
request: NormalizedContextRequest
intent: Intent
intent_source: ("request" | "inferred")
budget: {
limit: number
used: number
/**
 * Identificador versionado del estimador de tokens, p. ej. bytes-lf/3.2@1.
 */
estimator: string
}
/**
 * Secciones en orden de renderizado, estable → dinámico (FOKER-SPEC §9.8).
 */
sections: PackSection[]
files: PackFile[]
/**
 * Siguientes candidatos descartados (máx. 20), para depuración.
 * 
 * @maxItems 20
 */
excluded: []|[ExcludedFile]|[ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]
diagnostics: Diagnostic[]
/**
 * Markdown estable→dinámico. Omitido en structuredContent MCP salvo explain=true (va en content[0]).
 */
rendered?: string
}
/**
 * ContextRequest normalizado: todos los campos presentes, anclas ordenadas.
 */
export interface NormalizedContextRequest {
task: string
anchors: {
/**
 * @maxItems 20
 */
files: []|[string]|[string, string]|[string, string, string]|[string, string, string, string]|[string, string, string, string, string]|[string, string, string, string, string, string]|[string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]
/**
 * @maxItems 20
 */
symbols: []|[string]|[string, string]|[string, string, string]|[string, string, string, string]|[string, string, string, string, string]|[string, string, string, string, string, string]|[string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]
}
intent: (Intent | null)
budget_tokens: number
skill: (string | null)
task_id: (TaskId | null)
dirty_files: boolean
explain: boolean
/**
 * Interno: parámetros efectivos no predeterminados de calibración (ADR-021/FKR-037).
 */
params?: {
w_anchor: number
mention_factor: number
w_lex: number
bm25_top: number
w_dirty: number
w_task_scope: number
w_skill: number
r_fix: number
r_modify: number
r_test: number
r_refactor: number
r_add: number
r_explain: number
test_factor: number
l2_count: number
anchor_fraction: number
margin_fraction: number
l0_count: number
l0_min_fraction: number
core_files: number
core_fraction: number
bm25_k1: number
bm25_b: number
}
}
export interface PackSection {
id: ("rules" | "core" | "skill" | "task_scope" | "related" | "targets" | "request")
class: ("mandatory" | "optional")
stability: ("static" | "session" | "task")
tokens: number
hash: Hash
}
export interface PackFile {
id: FileId
level: RenderLevel
tokens: number
/**
 * PPR redondeado a 1e-12.
 */
score: number
/**
 * @minItems 1
 */
reasons: [Reason, ...(Reason)[]]
/**
 * Aviso, p. ej. contenido completo omitido por presupuesto.
 */
note?: string
}
export interface ExcludedFile {
id: FileId
reason: ("BUDGET" | "RANK_CUTOFF")
score: number
}
/**
 * Entrada del Context Engine tal como la envía el cliente (FOKER-SPEC §9.2). Límite de presupuesto de la CLI; MCP lo restringe a 20.000.
 */
export interface ContextRequest {
task: string
anchors?: Anchors
intent?: Intent
budget_tokens?: number
skill?: string
task_id?: TaskId
dirty_files?: boolean
explain?: boolean
}
export interface Anchors {
/**
 * @maxItems 20
 */
files?: []|[string]|[string, string]|[string, string, string]|[string, string, string, string]|[string, string, string, string, string]|[string, string, string, string, string, string]|[string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]
/**
 * @maxItems 20
 */
symbols?: []|[string]|[string, string]|[string, string, string]|[string, string, string, string]|[string, string, string, string, string]|[string, string, string, string, string, string]|[string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]
}
/**
 * Registro de tarea en .foker/tasks/<task_id>.json y salida de foker_task_get (FOKER-SPEC §12). Los eventos van en <task_id>.events.jsonl (cada línea = $defs/event). La evidencia de cada intento en .foker/runs/<task_id>/<attempt>/evidence.json (= $defs/evidence).
 */
export interface TaskRecord {
schema_version: 1
task_id: TaskId
state: TaskState
description: string
scope: TaskScope
profile: string
skill?: (string | null)
/**
 * 0 antes del primer RUNNING.
 */
attempt: number
max_attempts: number
client_token?: (string | null)
created_at: Timestamp
updated_at: Timestamp
last_activity_at?: Timestamp
created_by: Actor
baseline: TaskBaseline
approvals: TaskApproval[]
last_gates: GateResult[]
next_action: NextAction
blocked_reason?: (string | null)
}
export interface TaskScope {
/**
 * @minItems 1
 * @maxItems 50
 */
paths: [Glob, ...(Glob)[]]
}
export interface TaskBaseline {
git_head: (string | null)
dirty_files: FileId[]
snapshot_hash: Hash
}
export interface TaskApproval {
action: ("approve" | "reject" | "unblock")
actor: Actor
at: Timestamp
reason?: string
scope?: TaskScope
}
export interface GateResult {
/**
 * G1 scope, G2 policy, G3 map, G4 checks, G5 skill (FOKER-SPEC §12.4).
 */
gate: ("scope" | "policy" | "map" | "checks" | "skill")
status: ("pass" | "fail" | "blocked" | "approval_required" | "skipped")
findings: Finding[]
checks?: CheckResult[]
}
/**
 * Hallazgo estructurado de un check o gate para que el agente se autocorrija.
 */
export interface Finding {
/**
 * Regla, p. ej. tsc/TS2322, secret/aws-access-key, scope/out-of-scope.
 */
rule?: string
file?: FileId
/**
 * Base 1, como lo muestran las herramientas.
 */
line?: number
/**
 * Base 1.
 */
col?: number
code?: string
severity?: ("error" | "warning")
message: string
}
export interface CheckResult {
check: string
status: ("pass" | "fail" | "timeout" | "skipped")
exit_code: (number | null)
duration_ms: number
findings: Finding[]
/**
 * Últimas líneas de la salida, redactadas.
 */
output_tail: string
}
/**
 * Línea de <task_id>.events.jsonl. prev_hash encadena con el evento anterior (BLAKE3 de su JSON canónico).
 */
export interface TaskEvent {
ts: Timestamp
task_id: TaskId
from: (TaskState | null)
to: TaskState
actor: Actor
reason: (string | null)
evidence_ref: (string | null)
evidence_hash?: Hash
prev_hash: (Hash | null)
}
/**
 * .foker/runs/<task_id>/<attempt>/evidence.json
 */
export interface TaskEvidence {
schema_version: 1
task_id: TaskId
attempt: number
foker_version: Semver
started_at: Timestamp
finished_at: Timestamp
map_hash: Hash
changes: TaskChange[]
gates: GateResult[]
result: TaskState
}
export interface TaskChange {
path: FileId
change: ("added" | "modified" | "deleted")
}
/**
 * Configuración técnica de Foker en el proyecto gestionado (FOKER-SPEC §15.2). Claves desconocidas = FKR-CFG-001. Los valores omitidos toman los defaults de Foker.
 */
export interface FokerConfig {
version: 1
project?: {
name?: string
description?: string
}
/**
 * Plantilla con la que se creó el proyecto (la registra foker init --template).
 */
template?: {
name: string
version: Semver
options?: {

}
}
map?: {
include?: Globs
exclude?: Globs
tsconfig?: Globs
max_file_bytes?: number
max_files?: number
/**
 * Globs que asignan files[].kind; el resto es source.
 */
kinds?: {
test?: Globs
declaration?: Globs
config?: Globs
generated?: Globs
}
}
context?: {
default_budget_tokens?: number
/**
 * N archivos de mayor PageRank global en la sección core.
 */
core_files?: number
}
validation?: {
profiles?: {
[k: string]: {
/**
 * @minItems 1
 */
checks: [Name, ...(Name)[]]
} | undefined
}
checks?: {
[k: string]: CheckConfig | undefined
}
}
policy?: PolicyConfig
skills?: {
/**
 * Skills incluidas que no se exportan ni se sugieren.
 */
disabled?: Name[]
}
integrations?: {
targets?: ("claude-code" | "opencode" | "antigravity")[]
}
}
/**
 * FOKER-SPEC §11.3. El proyecto solo puede añadir restricciones (REQ-POL-001); relajar exige overrides.
 */
export interface PolicyConfig {
secret_globs?: Globs
protected_paths?: Globs
approval_required?: {
paths?: Globs
dependency_changes?: boolean
file_deletions_outside_scope?: boolean
}
env_allowlist?: string[]
tasks?: {
max_attempts_default?: number
max_active?: number
}
/**
 * Relajaciones explícitas de la política por defecto; foker doctor las lista.
 */
overrides?: {
remove_secret_globs?: Globs
remove_protected_paths?: Globs
remove_approval_paths?: Globs
justification: string
}[]
}
/**
 * Contrato de Foker para una Skill (FOKER-SPEC §13). Acompaña a un SKILL.md compatible con el estándar Agent Skills (agentskills.io). 'permissions' solo puede restringir.
 */
export interface FokerSkill {
schema_version: 1
/**
 * Igual al 'name' de SKILL.md y al nombre del directorio (REQ-SKL-001).
 */
name: string
version: Semver
purpose: string
triggers: {
keywords?: string[]
paths?: Glob[]
}
inputs?: {
name: string
type: ("path" | "symbol" | "string")
required?: boolean
description?: string
}[]
constraints: string[]
/**
 * Anclas débiles (peso 0,5) al pedir contexto con esta skill.
 */
required_context?: {
files?: string[]
symbols?: string[]
}
tools: ("foker_check" | "foker_context" | "foker_impact" | "foker_search" | "foker_status" | "foker_task_begin" | "foker_task_get" | "foker_task_submit")[]
/**
 * Sección de SKILL.md con el procedimiento.
 */
workflow_ref: string
validation: {
checks: string[]
}
outputs: {
kind: ("modified_files" | "created_files" | "tests")
within_scope?: boolean
}[]
/**
 * Se intersecan con el alcance de la tarea y la política; nunca amplían (REQ-SKL-002).
 */
permissions: {
write_paths?: Glob[]
network?: boolean
}
compatibility?: {
/**
 * Rango semver de Foker soportado, p. ej. >=0.1.0 <0.3.0.
 */
foker?: string
hosts?: ("claude-code" | "opencode" | "antigravity")[]
}
}
/**
 * Frontmatter YAML de la especificación de producto (FOKER-SPEC §15.1). El cuerpo Markdown es libre y no confiable (T1).
 */
export interface FokerMdFrontmatter {
foker_spec: 1
name: string
description?: string
template?: {
name: string
options?: {

}
}
}
/**
 * Sobre único para todos los comandos (FOKER-SPEC §16.3). 'data' es específico de cada comando y se documenta en docs/cli.md (generado).
 */
export interface CliOutput {
schema: "foker.cli/v1"
/**
 * Comando y subcomando, p. ej. map o task submit.
 */
command: string
ok: boolean
/**
 * FOKER-SPEC §16.4.
 */
exit_code?: (0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10)
data: unknown
warnings: Message[]
errors: Message[]
duration_ms: number
}
export interface Message {
code?: ErrorCode
message: string
hint?: string
}
/**
 * Una línea JSONL por ejecución (tarea × brazo × repetición). FOKER-SPEC §20.
 */
export interface BenchmarkResult {
schema_version: 1
run_id: string
manifest_hash: Hash
task_id: string
task_type?: ("fix" | "feature" | "refactor" | "test")
repo: {
name: string
commit: string
}
arm: ("control" | "foker")
repetition: number
host: {
name: ("claude-code" | "opencode")
version: string
}
/**
 * Id exacto del modelo (no alias).
 */
model: string
/**
 * null en el brazo control.
 */
foker_version: (Semver | null)
started_at: Timestamp
limits?: {
max_turns?: number
max_minutes?: number
max_cost_usd?: number
}
/**
 * FOKER-SPEC §20.5.
 */
metrics: {
/**
 * input_tokens + cache_read_input_tokens + cache_creation_input_tokens. null: no observado/calculable (ADR-025).
 */
input_tokens_total: (number | null)
/**
 *  null: no observado/calculable (ADR-025).
 */
cached_tokens: (number | null)
/**
 *  null: no observado/calculable (ADR-025).
 */
cache_write_tokens: (number | null)
/**
 *  null: no observado/calculable (ADR-025).
 */
output_tokens: (number | null)
/**
 *  null: no observado/calculable (ADR-025).
 */
cost_usd: (number | null)
latency_s: number
files_exposed: number
files_modified: number
exposure_precision: (number | null)
exposure_recall: (number | null)
out_of_scope_edits: number
errors: number
/**
 *  null: no observado/calculable (ADR-025).
 */
retries: (number | null)
tests_passed: number
/**
 * Informativo; solo en el brazo foker.
 */
ccr_relevante?: (number | null)
}
success: boolean
/**
 * Los 5 criterios de FOKER-SPEC §20.4.
 */
success_breakdown: {
fail_to_pass: boolean
pass_to_pass: boolean
typecheck_lint: boolean
protected_untouched: boolean
within_limits: boolean
}
notes?: string
}
export interface BenchmarkManifest {
schema_version: 1
/**
 * @minItems 1
 */
repos: [{
name: string
url?: string
commit: string
fixture?: string
}, ...({
name: string
url?: string
commit: string
fixture?: string
})[]]
/**
 * @minItems 3
 */
tasks: [{
id: string
repo: string
type: ("fix" | "feature" | "refactor" | "test")
statement: string
gold_patch: string
hidden_tests: {
fail_to_pass: {
/**
 * @minItems 1
 */
paths: [string, ...(string)[]]
/**
 * @minItems 1
 */
command: [string, ...(string)[]]
}
pass_to_pass: {
/**
 * @minItems 1
 */
paths: [string, ...(string)[]]
/**
 * @minItems 1
 */
command: [string, ...(string)[]]
}
}
/**
 * @minItems 1
 */
gold_modified: [string, ...(string)[]]
/**
 * @minItems 1
 */
gold_read?: [string, ...(string)[]]
}, {
id: string
repo: string
type: ("fix" | "feature" | "refactor" | "test")
statement: string
gold_patch: string
hidden_tests: {
fail_to_pass: {
/**
 * @minItems 1
 */
paths: [string, ...(string)[]]
/**
 * @minItems 1
 */
command: [string, ...(string)[]]
}
pass_to_pass: {
/**
 * @minItems 1
 */
paths: [string, ...(string)[]]
/**
 * @minItems 1
 */
command: [string, ...(string)[]]
}
}
/**
 * @minItems 1
 */
gold_modified: [string, ...(string)[]]
/**
 * @minItems 1
 */
gold_read?: [string, ...(string)[]]
}, {
id: string
repo: string
type: ("fix" | "feature" | "refactor" | "test")
statement: string
gold_patch: string
hidden_tests: {
fail_to_pass: {
/**
 * @minItems 1
 */
paths: [string, ...(string)[]]
/**
 * @minItems 1
 */
command: [string, ...(string)[]]
}
pass_to_pass: {
/**
 * @minItems 1
 */
paths: [string, ...(string)[]]
/**
 * @minItems 1
 */
command: [string, ...(string)[]]
}
}
/**
 * @minItems 1
 */
gold_modified: [string, ...(string)[]]
/**
 * @minItems 1
 */
gold_read?: [string, ...(string)[]]
}, ...({
id: string
repo: string
type: ("fix" | "feature" | "refactor" | "test")
statement: string
gold_patch: string
hidden_tests: {
fail_to_pass: {
/**
 * @minItems 1
 */
paths: [string, ...(string)[]]
/**
 * @minItems 1
 */
command: [string, ...(string)[]]
}
pass_to_pass: {
/**
 * @minItems 1
 */
paths: [string, ...(string)[]]
/**
 * @minItems 1
 */
command: [string, ...(string)[]]
}
}
/**
 * @minItems 1
 */
gold_modified: [string, ...(string)[]]
/**
 * @minItems 1
 */
gold_read?: [string, ...(string)[]]
})[]]
model: (string | null)
host: {
name: "claude-code"
version: string
}
foker_version: Semver
seeds: {
fixture: number
order: number
bootstrap: number
}
limits: {
max_turns: 60
max_minutes: 30
max_cost_usd: (number | null)
}
prices: {
version: string
/**
 * @minItems 1
 */
models: [{
model: (string | null)
input: (number | null)
cache_read: (number | null)
cache_write: (number | null)
output: (number | null)
}, ...({
model: (string | null)
input: (number | null)
cache_read: (number | null)
cache_write: (number | null)
output: (number | null)
})[]]
}
suites: {
/**
 * @minItems 3
 * @maxItems 3
 */
smoke: [string, string, string]
/**
 * @minItems 1
 */
full: [string, ...(string)[]]
}
}
export interface FokerCheckInput {
profile?: string
/**
 * @maxItems 20
 */
checks?: []|[string]|[string, string]|[string, string, string]|[string, string, string, string]|[string, string, string, string, string]|[string, string, string, string, string, string]|[string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]|[string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string]
/**
 * @maxItems 50
 */
packages?: string[]
}
export interface FokerCheckOutput {
ok: boolean
results: CheckResult[]
diagnostics?: Diagnostics
}
export interface FokerContextInput {
task: string
anchors?: Anchors
intent?: Intent
budget_tokens?: number
skill?: string
task_id?: TaskId
dirty_files?: boolean
explain?: boolean
}
/**
 * Salida determinista del Context Engine (FOKER-SPEC §9). Las claves usan snake_case en JSON; la API nativa expone camelCase.
 */
export interface FokerContextOutput {
pack_version: 1
pack_hash: Hash
map_hash: Hash
request: NormalizedContextRequest
intent: Intent
intent_source: ("request" | "inferred")
budget: {
limit: number
used: number
/**
 * Identificador versionado del estimador de tokens, p. ej. bytes-lf/3.2@1.
 */
estimator: string
}
/**
 * Secciones en orden de renderizado, estable → dinámico (FOKER-SPEC §9.8).
 */
sections: PackSection[]
files: PackFile[]
/**
 * Siguientes candidatos descartados (máx. 20), para depuración.
 * 
 * @maxItems 20
 */
excluded: []|[ExcludedFile]|[ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]|[ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile, ExcludedFile]
diagnostics: Diagnostic[]
/**
 * Markdown estable→dinámico. Omitido en structuredContent MCP salvo explain=true (va en content[0]).
 */
rendered?: string
}
export interface FokerImpactOutput {
/**
 * Ordenados por distancia e id.
 */
nodes: {
id: string
distance: number
/**
 * Tipo de arista por la que se llegó; null para el origen.
 */
via: (string | null)
kind: ("file" | "symbol" | "package")
}[]
packages: string[]
tests: FileId[]
diagnostics?: Diagnostics
}
export interface FokerSearchInput {
query: string
kind?: ("file" | "symbol" | "any")
limit?: number
}
export interface FokerSearchOutput {
hits: {
id: string
kind: ("file" | "symbol")
name: string
file: FileId
signature?: string
score: number
}[]
diagnostics?: Diagnostics
}
export interface FokerStatusInput {

}
export interface FokerStatusOutput {
foker_version: Semver
foker_mcp_api: number
/**
 * Revisión MCP negociada.
 */
protocol: string
/**
 * Nombre del directorio raíz (nunca la ruta absoluta).
 */
root_name: string
map: {
content_hash: Hash
files: number
symbols: number
stale_files: number
schema_version: number
}
profiles: string[]
active_tasks: {
task_id: TaskId
state: TaskState
}[]
trust: ("trusted" | "untrusted")
diagnostics?: Diagnostics
}
export interface FokerTaskBeginInput {
description: string
scope: TaskScope
profile?: string
skill?: string
max_attempts?: number
client_token?: string
}
export interface FokerTaskBeginOutput {
task_id: TaskId
state: "RUNNING"
attempt: 1
baseline: TaskBaseline
allowed_paths: Glob[]
protected_paths_in_scope: string[]
checks: string[]
diagnostics?: Diagnostics
}
export interface FokerTaskGetInput {
task_id: TaskId
}
/**
 * Registro de tarea en .foker/tasks/<task_id>.json y salida de foker_task_get (FOKER-SPEC §12). Los eventos van en <task_id>.events.jsonl (cada línea = $defs/event). La evidencia de cada intento en .foker/runs/<task_id>/<attempt>/evidence.json (= $defs/evidence).
 */
export interface FokerTaskGetOutput {
schema_version: 1
task_id: TaskId
state: TaskState
description: string
scope: TaskScope
profile: string
skill?: (string | null)
/**
 * 0 antes del primer RUNNING.
 */
attempt: number
max_attempts: number
client_token?: (string | null)
created_at: Timestamp
updated_at: Timestamp
last_activity_at?: Timestamp
created_by: Actor
baseline: TaskBaseline
approvals: TaskApproval[]
last_gates: GateResult[]
next_action: NextAction
blocked_reason?: (string | null)
}
export interface FokerTaskSubmitInput {
task_id: TaskId
summary?: string
}
export interface FokerTaskSubmitOutput {
task_id: TaskId
state: TaskState
attempt: number
gates: GateResult[]
/**
 * Ruta relativa al root del evidence.json.
 */
evidence: string
next_action: ("done" | "fix_and_resubmit" | "await_human_approval" | "blocked_contact_human" | "failed")
diagnostics?: Diagnostics
}
