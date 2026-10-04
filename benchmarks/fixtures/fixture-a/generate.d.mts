/** Tipos de generate.mjs (generador determinista de Fixture A). */
export declare const FIXTURE_SEED: number;
/** Archivos del fixture: ruta POSIX → contenido. */
export declare function fixtureFiles(seed?: number): Record<string, string>;
/** Escribe el fixture en `destination`. */
export declare function generate(destination: string, seed?: number): void;
