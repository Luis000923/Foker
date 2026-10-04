import type {
  ContextPack,
  ContextRequest,
  Diagnostic,
  EngineConfig,
  FileInfo,
  ImpactReport,
  ImpactRequest,
  MapStatus,
  FokerEngine as NativeEngine,
  RefreshOptions,
  RefreshReport,
  SaveReport,
  SearchHit,
  SearchQuery,
  SymbolInfo,
} from '../binding.cjs';
import { FokerError } from './errors.js';

export type {
  ContextPack,
  ContextParams,
  ContextRequest,
  Diagnostic,
  EngineConfig,
  FileInfo,
  ImpactNode,
  ImpactReport,
  ImpactRequest,
  KindGlobsConfig,
  MapStatus,
  Position,
  Range,
  RefreshOptions,
  RefreshReport,
  SaveReport,
  SearchHit,
  SearchQuery,
  SymbolInfo,
} from '../binding.cjs';

/** Constructor nativo de `FokerEngine` (inyectable en tests). */
export interface NativeEngineClass {
  open(root: string, config?: EngineConfig | null): Promise<NativeEngine>;
}

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw FokerError.fromNative(error);
  }
}

async function wrapAsync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw FokerError.fromNative(error);
  }
}

/**
 * Motor del Project Map de un root (FOKER-SPEC §7.2). Envuelve el addon y convierte cualquier
 * error en `FokerError` con su código `FKR-…`.
 */
export class Engine {
  readonly #native: NativeEngine;

  private constructor(native: NativeEngine) {
    this.#native = native;
  }

  /** Abre el motor para un root absoluto. Carga el mapa persistido si es válido. */
  static async open(native: NativeEngineClass, root: string, config?: EngineConfig): Promise<Engine> {
    return new Engine(await wrapAsync(() => native.open(root, config ?? null)));
  }

  /** Avisos de la carga, p. ej. `FKR-MAP-005` si el mapa estaba corrupto y se reconstruirá. */
  loadDiagnostics(): Diagnostic[] {
    return wrap(() => this.#native.loadDiagnostics());
  }

  /** Refresca el mapa (incremental salvo `full`). */
  refresh(options?: RefreshOptions): Promise<RefreshReport> {
    return wrapAsync(() => this.#native.refresh(options ?? null));
  }

  /** Estado del mapa en memoria. */
  status(): MapStatus {
    return wrap(() => this.#native.status());
  }

  /** Archivos que difieren del disco, sin reconstruir. */
  checkStale(): Promise<number> {
    return wrapAsync(() => this.#native.checkStale());
  }

  /** Guarda `.foker/project-map.json` (atómico, bajo lock). */
  save(): Promise<SaveReport> {
    return wrapAsync(() => this.#native.save());
  }

  /** JSON canónico del mapa completo. */
  exportMapJson(): Promise<string> {
    return wrapAsync(() => this.#native.exportMapJson());
  }

  /** Busca archivos y símbolos. */
  search(query: SearchQuery): SearchHit[] {
    return wrap(() => this.#native.search(query));
  }

  /** Información de un archivo, o `null`. */
  fileInfo(id: string): FileInfo | null {
    return wrap(() => this.#native.fileInfo(id));
  }

  /** Información de un símbolo, o `null`. */
  symbolInfo(id: string): SymbolInfo | null {
    return wrap(() => this.#native.symbolInfo(id));
  }

  /** Construye un Context Pack determinista. */
  buildContext(request: ContextRequest): Promise<ContextPack> {
    return wrapAsync(() => this.#native.buildContext(request));
  }

  /** Radio de impacto. */
  impact(request: ImpactRequest): ImpactReport {
    return wrap(() => this.#native.impact(request));
  }
}
