// node packages/mcp/scripts/measure-phase2.mjs
// Sin red ni build: Vite carga las fuentes TS y usa el addon ya disponible.
// Reconstruye el transporte anterior con el mismo pack; mide bytes UTF-8 del JSON compacto.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generate } from '../../../benchmarks/fixtures/fixture-a/generate.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const rootRequire = createRequire(`${repo}/package.json`);
const viteRequire = createRequire(rootRequire.resolve('vitest'));
const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
const require = createRequire(`${repo}/packages/mcp/package.json`);
const { Client } = require('@modelcontextprotocol/client');
const { InMemoryTransport } = require('@modelcontextprotocol/server');
const vite = await createServer({
  configFile: false,
  root: repo,
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  resolve: { alias: [{ find: /^@foker\/([a-z-]+)$/, replacement: `${repo}/packages/$1/src/index.ts` }] },
});
const root = await mkdtemp(join(tmpdir(), 'foker-phase2-measure-'));
let client, server;
try {
  const mcp = await vite.ssrLoadModule('/packages/mcp/src/index.ts');
  const content = await vite.ssrLoadModule('/packages/integrations/src/content.ts');
  const { loadRoles } = await vite.ssrLoadModule('/packages/integrations/src/roles.ts');
  const { planSync } = await vite.ssrLoadModule('/packages/integrations/src/sync.ts');
  generate(root);
  await mkdir(join(root, 'foker'), { recursive: true });
  await writeFile(join(root, 'foker/rules.md'), '# Reglas\nEdita solo el alcance autorizado.\n');
  server = await mcp.createFokerServer({ root, stderr: () => {} });
  client = new Client({ name: 'measurement', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  const input = { task: 'El escaparate permite comprar artículos agotados.', budget_tokens: 8000, dirty_files: false };
  const response = await client.callTool({ name: 'foker_context', arguments: input });
  if (response.isError) throw new Error(JSON.stringify(response));
  const { openEngine, loadConfig, gatherContextInputs } = await vite.ssrLoadModule('/packages/engine/src/index.ts');
  const loaded = await loadConfig(root);
  const engine = await openEngine(root, { ...loaded.mapConfig, readOnly: true });
  await engine.refresh();
  const pack = await engine.buildContext({
    task: input.task,
    ...(await gatherContextInputs(root)),
    dirtyFiles: [],
    coreFiles: loaded.config.context.core_files,
    budgetTokens: 8000,
    explain: false,
  });
  const previousData = JSON.parse(pack.json);
  delete previousData.rendered;
  const previous = {
    isError: false,
    structuredContent: previousData,
    content: [{ type: 'text', text: pack.rendered }],
  };
  if (previousData.pack_hash !== response.structuredContent.pack_hash) throw new Error('pack distinto');
  console.log(
    JSON.stringify({
      typicalBefore: Buffer.byteLength(JSON.stringify(previous)),
      typicalAfter: Buffer.byteLength(JSON.stringify(response)),
      structuredBefore: Buffer.byteLength(JSON.stringify(previousData)),
      structuredAfter: Buffer.byteLength(JSON.stringify(response.structuredContent)),
      packHash: previousData.pack_hash,
      budget: previousData.budget,
    }),
  );

  const tools = JSON.parse(await readFile(`${repo}/packages/schemas/schemas/mcp-tools.json`, 'utf8')).tools;
  const skill = await readFile(`${repo}/skills/foker-workflow/SKILL.md`, 'utf8');
  const roles = await loadRoles();
  const blocks = {};
  for (const target of ['claude-code', 'codex', 'antigravity', 'opencode']) {
    const plan = planSync(
      { targets: [target], skills: [], roles, protectedPaths: [], secretGlobs: [] },
      { read: () => undefined },
    );
    blocks[target] = Object.fromEntries(
      plan.writes
        .filter(
          (w) =>
            w.path === 'AGENTS.md' ||
            w.path === 'CLAUDE.md' ||
            /foker-implementer\.(md|toml)$/.test(w.path) ||
            w.path === '.agents/rules/foker.md',
        )
        .map((w) => [w.path, Buffer.byteLength(w.content)]),
    );
  }
  const result = {
    responseBytes: Buffer.byteLength(JSON.stringify(response)),
    structuredBytes: Buffer.byteLength(JSON.stringify(response.structuredContent)),
    descriptions: Object.fromEntries(tools.map((t) => [t.name, Buffer.byteLength(t.description)])),
    skillBytes: Buffer.byteLength(skill),
    agentsBlockBytes: Buffer.byteLength(content.agentsBlock()),
    claudeBlockBytes: Buffer.byteLength(content.claudeBlock()),
    blocks,
  };

  console.log(JSON.stringify(result, null, 2));
} finally {
  await client?.close();
  await server?.close();
  await vite.close();
  await rm(root, { recursive: true, force: true });
}
