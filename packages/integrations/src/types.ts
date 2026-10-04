import type { Json } from './json.js';

/** Anfitriones soportados (FOKER-SPEC §14.2). */
export const HOST_IDS = ['claude-code', 'opencode', 'antigravity', 'codex'] as const;
export type HostId = (typeof HOST_IDS)[number];

/** Archivo de una skill, relativo a su directorio (`SKILL.md`, `references/x.md`…). */
export interface SkillFile {
  path: string;
  content: string | Uint8Array;
}

export interface SkillInput {
  name: string;
  files: SkillFile[];
}

/** Rol canónico de `roles/` (FOKER-SPEC §12.1). */
export interface Role {
  name: string;
  description: string;
  /** Herramientas MCP de Foker permitidas. */
  fokerTools: string[];
  /** `edit`: puede editar; `read`: solo lectura. */
  native: 'edit' | 'read';
  /** Instrucciones (cuerpo Markdown). */
  body: string;
}

/** Datos que `sync` necesita; los reúne la CLI desde @foker/engine. */
export interface SyncInput {
  targets: HostId[];
  skills: SkillInput[];
  roles: Role[];
  /** Política efectiva: rutas protegidas y globs de secretos. */
  protectedPaths: string[];
  secretGlobs: string[];
}

/** Lo que un adaptador quiere que exista en el proyecto. */
export type Desired =
  | { kind: 'file'; path: string; content: string | Uint8Array }
  | { kind: 'block'; path: string; body: string; header?: string; syntax?: 'toml' }
  | {
      kind: 'json';
      path: string;
      /** Valores completos que pertenecen a Foker. */
      set: { pointer: string[]; value: Json }[];
      /** Elementos que Foker añade a listas del usuario. */
      arrays: { pointer: string[]; values: Json[] }[];
    };

/** Adaptador de anfitrión (FOKER-SPEC §14.3). */
export interface HostAdapter {
  id: HostId;
  /** `true` si el proyecto ya parece usar este anfitrión. */
  detect(exists: (path: string) => boolean): boolean;
  plan(input: SyncInput): Desired[];
}
