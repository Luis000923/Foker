import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatJson } from '@foker/integrations';

test('arrays de primitivos en línea si caben; objetos expandidos', () => {
  const text = formatJson({ mcpServers: { foker: { command: 'npx', args: ['--no-install', 'foker', 'mcp'] } } });
  assert.equal(
    text,
    '{\n  "mcpServers": {\n    "foker": {\n      "command": "npx",\n      "args": ["--no-install", "foker", "mcp"]\n    }\n  }\n}\n',
  );
});

test('un array que supera 80 columnas se expande', () => {
  const long = Array.from({ length: 12 }, (_, i) => `elemento-${i}`);
  const text = formatJson({ list: long });
  assert.ok(text.includes('"list": [\n    "elemento-0",'));
  for (const line of text.split('\n')) assert.ok(line.length <= 80, line);
});

test('vacíos y anidados con objetos', () => {
  assert.equal(
    formatJson({ a: [], b: {}, c: [{ d: 1 }] }),
    '{\n  "a": [],\n  "b": {},\n  "c": [\n    {\n      "d": 1\n    }\n  ]\n}\n',
  );
});

test('round-trip: el texto es JSON equivalente', () => {
  const value = { x: [1, 'dos', null, true], y: { z: 'w' } };
  assert.deepEqual(JSON.parse(formatJson(value)), value);
});
