import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ajv, mcpTools, mcpWireTools, wireSchema } from '@foker/schemas';

const tok = (value: unknown) => Math.ceil((Buffer.byteLength(JSON.stringify(value)) * 5) / 16);

test('tools/list compacto: mismas herramientas, entrada intacta salvo metadatos', () => {
  const full = mcpTools();
  const wire = mcpWireTools();
  assert.deepEqual(
    wire.map((t) => t.name),
    full.map((t) => t.name),
  );
  for (const [i, tool] of wire.entries()) {
    assert.equal(tool.description, full[i]?.description);
    assert.ok(!JSON.stringify(tool.inputSchema).includes('"title"'));
    assert.ok(!('timeoutS' in tool));
  }
  // Presupuesto del catálogo: se carga en cada turno del agente (antes ~25k tokens).
  assert.ok(tok(wire) < 9000, `tools/list = ${tok(wire)} tokens`);
});

test('wireSchema solo relaja: oneOf → anyOf, sin not/if, profundidad acotada', () => {
  const schema = {
    type: 'object',
    title: 'X',
    required: ['a'],
    properties: {
      a: { oneOf: [{ type: 'string' }, { type: 'string', minLength: 3 }] },
      b: {
        not: { type: 'null' },
        type: 'object',
        properties: { c: { type: 'object', properties: { d: { type: 'integer' } } } },
      },
    },
  };
  const wire = wireSchema(schema, 1);
  const validate = ajv().compile(wire);
  // "abcd" cumple las dos ramas: oneOf lo rechazaría, anyOf no.
  assert.ok(validate({ a: 'abcd', b: { c: { d: 'no-es-entero' } } }), JSON.stringify(validate.errors));
  assert.ok(!validate({ b: {} }), 'required se conserva');
  assert.deepEqual((wire['properties'] as Record<string, unknown>)['b'], {
    type: 'object',
    properties: { c: { type: 'object' } },
  });
});
