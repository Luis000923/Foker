import assert from 'node:assert/strict';
import { selectRequirements, splitSections } from '@foker/engine';
import { test } from 'vitest';

const doc = [
  '---',
  'name: x',
  '---',
  '# Título',
  'Preámbulo.',
  '## Design Tokens',
  'Paleta oscura y colores de gráficos.',
  '## Rutas',
  'Webhook del transportista con HMAC.',
  '```md',
  '## No es un título',
  '```',
  '## Modelo de Datos',
  'Tablas shipments y events.',
].join('\n');

test('splitSections ignora frontmatter y títulos dentro de bloques de código', () => {
  const headings = splitSections(doc).map((s) => s.heading);
  assert.deepEqual(headings, ['', 'Design Tokens', 'Rutas', 'Modelo de Datos']);
});

test('elige solo las secciones que toca la tarea, en orden del documento', () => {
  const out = selectRequirements(doc, 'Añadir el webhook HMAC del transportista');
  assert.ok(out.startsWith('## Rutas\nWebhook del transportista con HMAC.'));
  assert.ok(!out.includes('Paleta oscura'));
  assert.ok(out.endsWith('(2 secciones omitidas) Secciones: Design Tokens · Rutas · Modelo de Datos'));
});

test('sin coincidencias devuelve solo el índice; determinista', () => {
  assert.equal(selectRequirements(doc, 'zzz qqq'), 'Secciones: Design Tokens · Rutas · Modelo de Datos');
  assert.equal(selectRequirements(doc, 'colores del gráfico'), selectRequirements(doc, 'colores del gráfico'));
});

test('respeta el tope de tokens', () => {
  const big = `## Rutas\n${'webhook '.repeat(2000)}\n## Datos\nwebhook corto`;
  const out = selectRequirements(big, 'webhook', 100);
  assert.ok(out.startsWith('## Datos'));
});
