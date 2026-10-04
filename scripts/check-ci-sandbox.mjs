import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const image = 'rust:1.98.0-bookworm';
const hosted = new Set(['macos-15', 'macos-15-intel', 'windows-2025', 'windows-11-arm']);
const linux = new Set(['ubuntu-24.04', 'ubuntu-24.04-arm']);

/** Resuelve únicamente los formatos de matriz usados aquí; lo desconocido se rechaza.
 * @param {string} job
 * @returns {{ runners: string[], field?: string }}
 */
function resolveRunners(job) {
  const runner = job.match(/^ {4}runs-on: (.+)$/m)?.[1]?.trim();
  if (!runner) return { runners: [] };
  const field = runner.match(/^\$\{\{ matrix\.(\w+) \}\}$/)?.[1];
  if (!field) return { runners: [runner.replace(/^(['"])(.*)\1$/, '$2')] };
  const matrix = job.match(/^ {6}matrix:\n((?:^ {8}.*\n|^\s*\n)*)/m)?.[1] ?? '';
  const list = matrix.match(new RegExp(String.raw`^ {8}${field}: \[([^\]\n]+)\]\s*$`, 'm'));
  const values = [
    ...matrix.matchAll(new RegExp(String.raw`(?:^ {12}${field}: |[ {]${field}: )([\w.-]+)(?=[, }\n]|$)`, 'gm')),
  ];
  const entries = (matrix.match(/^ {10}- /gm) ?? []).length;
  if (values.length !== entries) return { field, runners: [] };
  return {
    field,
    runners: [
      ...(list?.[1] ? list[1].split(',').map((value) => value.trim()) : []),
      ...values.map((value) => value[1] ?? ''),
    ],
  };
}

/** @param {string} job */
function isolated(job) {
  const { runners, field } = resolveRunners(job);
  // Un contenedor nunca autoriza ejecutar en infraestructura self-hosted.
  if (/self-hosted/i.test(job)) return false;
  const exact =
    /^ {4}container:\n {6}image: rust:1\.98\.0-bookworm\s*$/m.test(job) ||
    /^ {4}container: rust:1\.98\.0-bookworm\s*$/m.test(job);
  if (exact) return !/^ {4}runs-on:/m.test(job) || (runners.length > 0 && runners.every((runner) => linux.has(runner)));
  if (!runners.length) return false;
  const container = job.match(/^ {4}container: (.+)$/m)?.[1];
  if (!/^ {4}container:/m.test(job)) return runners.every((runner) => hosted.has(runner));
  // No se ejecutan expresiones arbitrarias: se acepta esta forma exacta y se evalúa por entrada.
  const conditional = field && container === `\${{ startsWith(matrix.${field}, 'ubuntu') && '${image}' || '' }}`;
  return (
    Boolean(conditional) &&
    runners.every((runner) => (runner.startsWith('ubuntu') ? linux.has(runner) : hosted.has(runner)))
  );
}

/**
 * Valida el subconjunto YAML usado por nuestros workflows; rechaza aliases y merges
 * para que no oculten configuración. Todo job salvo la notificación exige aislamiento.
 * @param {string} source
 * @returns {string[]}
 */
export function checkWorkflow(source) {
  const errors = [];
  if (/^\s*[^#\n]*[&*][a-zA-Z_]|^\s*<<:/m.test(source)) errors.push('Aliases YAML no permitidos');
  const jobsStart = source.indexOf('\njobs:\n');
  if (jobsStart < 0) return ['Se requiere jobs en formato de bloque'];
  const global = source.slice(0, jobsStart);
  const permissions = global.match(/^permissions:\n((?:^ +.*\n|^\s*\n)*)/m)?.[1]?.trim();
  const jobs = source.slice(jobsStart).split(/^ {2}([\w-]+):\s*$/m);
  for (let i = 1; i < jobs.length; i += 2) {
    const name = jobs[i];
    const job = jobs[i + 1] ?? '';
    // También cubre jobs nuevos con run, aunque todavía no hagan checkout.
    if (/self-hosted/i.test(job)) errors.push(`${name}: runner self-hosted prohibido`);
    // Única excepción: notificación sin checkout, código del repo ni contenedor compartido.
    const notification = `run: >-
          gh issue create --title "Regresión de rendimiento en nightly"
          --body "La comparación con benchmarks/perf-baseline.json superó el 20 %. Ejecución: $RUN_URL"`;
    if (
      name === 'report-regression' &&
      !/actions\/checkout@|secrets\s*[.[]|\buses:/.test(job) &&
      (job.match(/\brun:/g) ?? []).length === 1 &&
      job.slice(job.indexOf('run:')).trim() === notification
    )
      continue;
    if (!isolated(job)) {
      errors.push(`${name}: requiere contenedor Rust con versión exacta o runner alojado permitido`);
    }
    if (/\$\{\{[^}\n]*\bsecrets\b|github\s*(?:\.\s*token|\[\s*['"]token['"]\s*\])/i.test(global + job))
      errors.push(`${name}: referencia credenciales`);
    if (/^\s*(volumes|credentials|options):/m.test(job)) errors.push(`${name}: montaje u opciones no permitidos`);
    const checkouts = job.match(/^[ \t]+- uses: actions\/checkout@[^\n]*\n(?:(?!^[ \t]+- ).*\n)*/gm) ?? [];
    if (checkouts.some((checkout) => !/^ {10}persist-credentials: false\s*$/m.test(checkout)))
      errors.push(`${name}: checkout debe descartar credenciales`);
    if (permissions !== 'contents: read' || /^ {4}permissions:/m.test(job))
      errors.push(`${name}: permisos deben ser contents: read`);
  }
  return errors;
}

/** @param {string} root */
export function checkCiSandbox(root) {
  const directory = resolve(root, '.github/workflows');
  return readdirSync(directory)
    .filter((name) => /\.ya?ml$/.test(name))
    .flatMap((name) =>
      checkWorkflow(readFileSync(resolve(directory, name), 'utf8')).map((error) => `${name}: ${error}`),
    );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkCiSandbox(fileURLToPath(new URL('../', import.meta.url)));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('REQ-SEC-001: workflows aislados sin secretos configurados');
}
