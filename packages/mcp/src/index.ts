import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import {
  assertUnprotectedScope,
  type ContextRequest,
  deriveScopePaths,
  type Engine,
  FokerError,
  gatherContextInputs,
  loadConfig,
  loadSkill,
  nonexistentScopePaths,
  normalizePath,
  openEngine,
  submitTask,
  TaskStore,
  TrustStore,
  validateProfile,
} from '@foker/engine';
import {
  ajv,
  type ContextPack,
  type FokerCheckInput,
  type FokerContextInput,
  type FokerImpactInput,
  type FokerSearchInput,
  type FokerTaskBeginInput,
  mcpApiVersion,
  mcpTools,
  type ProjectMap,
  type TaskRecord,
  validator,
} from '@foker/schemas';
import {
  type CallToolResult,
  CLIENT_INFO_META_KEY,
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  type ServerContext,
  type Tool,
} from '@modelcontextprotocol/server';
import { type ServeStdioOptions, serveStdio } from '@modelcontextprotocol/server/stdio';
import { Audit, limitOutput, sanitize, TokenBucket } from './safety.js';
import { scopeSuggestions } from './scope.js';

export const PACKAGE_NAME = '@foker/mcp';
const version = (createRequire(import.meta.url)('../package.json') as { version: string }).version;
export interface FokerServerOptions {
  root: string;
  clock?: () => number;
  trustBaseDir?: string;
  /** Recibe únicamente JSON Lines, por defecto stderr. */
  stderr?: (line: string) => void;
}
const definitions = mcpTools().sort((a, b) => a.name.localeCompare(b.name));
const validators = definitions.map((tool) => ({
  tool,
  input: ajv().compile(tool.inputSchema),
  output: ajv().compile(tool.outputSchema),
}));
const validatePack = validator('context-pack');
const validateToolError = validator('mcp-tools#/$defs/mcpToolError');
const cache = (ttlMs: number) => ({ ttlMs, cacheScope: 'private' as const });
const resources = [
  { name: 'rules', uri: 'foker://rules', mimeType: 'text/markdown', ...cache(60000) },
  { name: 'outline', uri: 'foker://map/outline', mimeType: 'text/markdown', ...cache(60000) },
  { name: 'skills', uri: 'foker://skills/{name}', mimeType: 'text/markdown', ...cache(60000) },
  { name: 'tasks', uri: 'foker://tasks/{task_id}', mimeType: 'application/json', ...cache(0) },
];
function protocolFailure(error: FokerError) {
  return new ProtocolError(
    error.code === 'FKR-CFG-002' ? ProtocolErrorCode.InvalidParams : ProtocolErrorCode.InternalError,
    error.code,
    {
      code: error.code,
      message: error.code === 'FKR-CFG-002' ? error.message : 'Error interno de Foker.',
      recoverable: false,
    },
  );
}
async function checkedRoot(root: string) {
  try {
    const path = await realpath(resolve(root));
    if (!(await stat(path)).isDirectory()) throw new Error();
    return path;
  } catch {
    throw protocolFailure(new FokerError('FKR-CFG-002', 'Root inexistente o no es directorio.'));
  }
}
/** No permite que el estado apunte a código fuente ni a destinos externos mediante symlinks. */
async function assertPrivateState(root: string, relative = '.foker'): Promise<void> {
  const path = join(root, relative);
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (info.isSymbolicLink()) throw new FokerError('FKR-POL-001', 'El estado .foker no admite symlinks.');
  if (info.isDirectory())
    for (const entry of await readdir(path)) await assertPrivateState(root, `${relative}/${entry}`);
}
/** Proyección de transporte: conserva íntegros los resultados del motor y su evidencia. */
function compactCheck<T extends { status: string; output_tail?: string }>(check: T) {
  const { output_tail, ...rest } = check;
  return {
    ...rest,
    ...(check.status !== 'pass' && output_tail !== undefined
      ? { output_tail: stripVTControlCharacters(output_tail) }
      : {}),
  };
}
/** Una instancia por conexión; no conserva contexto de tarea implícito entre llamadas. */
export async function createFokerServer(options: FokerServerOptions): Promise<McpServer> {
  const root = await checkedRoot(options.root);
  const server = serverFactory({ ...options, root })();
  const close = server.close.bind(server);
  let handle: ReturnType<typeof serveStdio> | undefined;
  server.connect = async (transport) => {
    if (handle) throw new Error('Servidor ya conectado');
    handle = serveStdio(() => server.server, { transport, legacy: 'serve' });
  };
  server.close = async () => {
    if (handle) await handle.close();
    else await close();
  };
  return server;
}
function serverFactory(options: FokerServerOptions) {
  const { root } = options;
  const clock = options.clock ?? Date.now;
  const bucket = new TokenBucket(clock);
  const audit = new Audit(root, clock);
  const log = (tool: string | null, duration_ms: number, code: string | null, event = 'tool_call') =>
    (options.stderr ?? ((line) => process.stderr.write(line)))(
      `${JSON.stringify({ ts: new Date(clock()).toISOString(), level: code ? 'error' : 'info', event, tool, duration_ms, code })}\n`,
    );
  return () => {
    const info = { name: 'foker', version, foker_mcp_api: mcpApiVersion() };
    const server = new McpServer(info, {
      capabilities: { tools: {}, resources: {} },
      cacheHints: { 'resources/list': cache(0), 'resources/templates/list': cache(0) },
    });
    const actor = (ctx: ServerContext) =>
      `mcp:${(ctx.mcpReq.envelope as Record<string, { name?: string }> | undefined)?.[CLIENT_INFO_META_KEY]?.name || server.server.getClientVersion()?.name || 'unknown'}`;
    const store = (ctx: ServerContext) => new TaskStore(root, { actor: actor(ctx), clock });
    const executionOptions = options.trustBaseDir ? { trustBaseDir: options.trustBaseDir } : {};
    async function map(): Promise<{ engine: Engine; loaded: Awaited<ReturnType<typeof loadConfig>> }> {
      const loaded = await loadConfig(root);
      const engine = await openEngine(root, { ...loaded.mapConfig, readOnly: true });
      await engine.refresh();
      return { engine, loaded };
    }
    async function buildPack(
      engine: Engine,
      loaded: Awaited<ReturnType<typeof loadConfig>>,
      input: FokerContextInput,
      task?: TaskRecord,
    ): Promise<ContextPack & { rendered: string }> {
      normalizePath(root, 'foker/rules.md');
      if (input.skill) normalizePath(root, `foker/skills/${input.skill}`);
      const gathered = await gatherContextInputs(root, input.skill ? { skill: input.skill } : {});
      const pack = await engine.buildContext({
        task: input.task,
        ...gathered,
        ...(input.dirty_files === false ? { dirtyFiles: [] } : {}),
        ...(input.anchors ? { anchors: input.anchors } : {}),
        ...(input.intent ? { intent: input.intent as NonNullable<ContextRequest['intent']> } : {}),
        ...(task
          ? {
              taskId: task.task_id,
              taskScope: {
                taskId: task.task_id,
                description: task.description,
                paths: task.scope.paths,
                checks: loaded.config.validation.profiles[task.profile]?.checks ?? [],
              },
            }
          : {}),
        coreFiles: loaded.config.context.core_files,
        budgetTokens:
          input.budget_tokens ?? Math.min(20000, Math.max(1000, loaded.config.context.default_budget_tokens)),
        explain: input.explain ?? false,
      });
      const data = { ...JSON.parse(pack.json), rendered: pack.rendered };
      if (!validatePack(data)) throw new FokerError('FKR-INT-001', 'ContextPack inválido del motor.');
      return data as ContextPack & { rendered: string };
    }
    function taskContext(pack: ContextPack & { rendered: string }) {
      return {
        pack_hash: pack.pack_hash,
        budget: { used: pack.budget.used, limit: pack.budget.limit },
        rendered: pack.rendered,
      };
    }
    async function dispatch(
      name: string,
      args: Record<string, unknown>,
      ctx: ServerContext,
    ): Promise<{ data: Record<string, unknown>; text?: string }> {
      const tasks = store(ctx);
      if (typeof args['task_id'] === 'string') await tasks.touch(args['task_id']);
      if (name === 'foker_task_get')
        return { data: (await tasks.get(String(args['task_id']))) as unknown as Record<string, unknown> };
      if (name === 'foker_check') {
        const input = args as FokerCheckInput;
        const result = await validateProfile(root, {
          ...executionOptions,
          ...input,
          profile: input.profile ?? 'quick',
        });
        return { data: { ok: result.status === 'pass', results: (result.checks ?? []).map(compactCheck) } };
      }
      if (name === 'foker_task_submit') {
        const loaded = await loadConfig(root);
        if (!(await new TrustStore(options.trustBaseDir).isTrusted(root, loaded.commandsHash)))
          throw new FokerError('FKR-POL-010', 'Workspace no confiado');
        const result = await submitTask(root, String(args['task_id']), {
          ...executionOptions,
          ...(typeof args['summary'] === 'string' ? { summary: args['summary'] } : {}),
        });
        return {
          data: {
            ...result,
            gates: result.gates.map((gate) => ({
              ...gate,
              ...(gate.checks ? { checks: gate.checks.map(compactCheck) } : {}),
            })),
          },
        };
      }
      const { engine, loaded } = await map();
      if (name === 'foker_task_begin') {
        const input = args as unknown as FokerTaskBeginInput;
        const profile = loaded.config.validation.profiles[input.profile ?? 'default'];
        if (!profile) throw new FokerError('FKR-VAL-001', 'Perfil inexistente');
        if (input.skill) await gatherContextInputs(root, { skill: input.skill });
        const project = JSON.parse(await engine.exportMapJson()) as ProjectMap;
        const { context, ...taskInput } = input;
        const files = Object.keys(project.files);
        const contextInput: FokerContextInput = {
          task: input.description,
          ...(input.skill ? { skill: input.skill } : {}),
          ...(context === true ? {} : context),
        };
        async function invalidScope(message: string, pack?: ContextPack | null): Promise<never> {
          // Las sugerencias no deben convertir un error de alcance en fallo del pack.
          if (pack === undefined) {
            try {
              pack = await buildPack(engine, loaded, contextInput);
            } catch {
              // Si el presupuesto/reglas impiden el pack, quedan las raíces de paquetes.
            }
          }
          const suggestions = scopeSuggestions(project, loaded.policy.protected_paths, pack ?? undefined);
          throw new FokerError(
            'FKR-INP-001',
            `${message} Alcances sugeridos: ${JSON.stringify(suggestions)}. Usa un alcance existente u omite scope con context y anchors.`,
          );
        }
        // También se comprueba la política en reintentos; begin conserva la identidad
        // y ejecuta la derivación/validación únicamente al crear una tarea nueva.
        if (input.scope) assertUnprotectedScope(input.scope.paths, loaded.policy.protected_paths, files);
        const task = await tasks.begin(taskInput, async () => {
          let scope = input.scope;
          if (!scope) {
            if (!context) return invalidScope('Falta scope o context.');
            let preliminary: ContextPack;
            try {
              preliminary = await buildPack(engine, loaded, contextInput);
            } catch {
              return invalidScope('No se pudo construir el pack para derivar el alcance.', null);
            }
            const paths = deriveScopePaths(preliminary, input.description, project.project.packages);
            const [first, ...rest] = paths;
            if (first === undefined)
              return invalidScope('El pack no contiene objetivos L3 ni archivos L2.', preliminary);
            scope = { paths: [first, ...rest] };
          }
          assertUnprotectedScope(scope.paths, loaded.policy.protected_paths, files);
          const missing = await nonexistentScopePaths(root, scope.paths, files);
          if (missing.length)
            return invalidScope(`Alcance sin archivos ni directorios existentes: ${JSON.stringify(missing)}.`);
          return scope;
        });
        assertUnprotectedScope(task.scope.paths, loaded.policy.protected_paths, files);
        let contextResult: Record<string, unknown> = {};
        if (context) {
          try {
            const pack = await buildPack(
              engine,
              loaded,
              {
                task: task.description,
                ...(task.skill ? { skill: task.skill } : {}),
                ...(context === true ? {} : context),
              },
              task,
            );
            contextResult = { context: taskContext(pack) };
          } catch (error) {
            const failure = FokerError.fromNative(error);
            contextResult = {
              context_error: { code: failure.code, message: failure.message, recoverable: failure.recoverable },
            };
          }
        }
        const dirtyFiles = task.baseline.dirty_files
          .filter((path) => !path.split('/').includes('node_modules'))
          .sort()
          .slice(0, 20);
        return {
          data: {
            ...contextResult,
            task_id: task.task_id,
            state: 'RUNNING',
            attempt: 1,
            baseline: {
              ...task.baseline,
              dirty_files: dirtyFiles,
              dirty_files_total: task.baseline.dirty_files.length,
              dirty_files_truncated: task.baseline.dirty_files.length > dirtyFiles.length,
            },
            allowed_paths: task.scope.paths,
            ...(!input.scope ? { scope_derived: true } : {}),
            protected_paths_in_scope: [],
            checks: profile.checks,
          },
        };
      }
      if (name === 'foker_status') {
        const status = engine.status();
        return {
          data: {
            foker_version: version,
            foker_mcp_api: mcpApiVersion(),
            protocol: server.server.getNegotiatedProtocolVersion() ?? '2026-07-28',
            root_name: basename(root),
            map: {
              content_hash: status.contentHash,
              files: status.files,
              symbols: status.symbols,
              stale_files: status.staleFiles,
              schema_version: status.schemaVersion,
            },
            profiles: Object.keys(loaded.config.validation.profiles).sort(),
            active_tasks: (await tasks.list())
              .filter((t) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.state))
              .map(({ task_id, state }) => ({ task_id, state })),
            trust: (await new TrustStore(options.trustBaseDir).isTrusted(root, loaded.commandsHash))
              ? 'trusted'
              : 'untrusted',
            diagnostics: engine.loadDiagnostics(),
          },
        };
      }
      if (name === 'foker_search') return { data: { hits: engine.search(args as unknown as FokerSearchInput) } };
      if (name === 'foker_impact') {
        const impact = engine.impact(args as FokerImpactInput);
        return { data: { ...impact, nodes: impact.nodes.map((node) => ({ ...node, via: node.via ?? null })) } };
      }
      const input = args as unknown as FokerContextInput;
      const task = input.task_id ? await tasks.get(input.task_id) : undefined;
      const pack = await buildPack(engine, loaded, input, task);
      return {
        data: input.explain
          ? { ...pack }
          : { pack_version: pack.pack_version, ...taskContext(pack), diagnostics: pack.diagnostics },
        text: pack.rendered,
      };
    }

    server.server.setRequestHandler('tools/list', async () => ({
      tools: definitions.map(({ timeoutS: _, ...tool }) => tool as Tool),
    }));
    server.server.setRequestHandler('tools/call', async (request, ctx): Promise<CallToolResult> => {
      const started = clock();
      const definition = validators.find(({ tool }) => tool.name === request.params.name);
      if (!definition) throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Herramienta desconocida');
      const args = request.params.arguments ?? {};
      let code: string | null = null;
      let result: CallToolResult;
      try {
        const retry = bucket.take();
        if (retry) {
          code = 'FKR-MCP-002';
          const data = { code, message: 'Límite de llamadas excedido.', recoverable: true, retry_after_ms: retry };
          if (!validateToolError(data)) throw new FokerError('FKR-INT-001', 'Error MCP inválido.');
          result = {
            isError: true,
            structuredContent: data,
            content: [
              {
                type: 'text',
                text: JSON.stringify(data),
              },
            ],
          };
        } else {
          if (!definition.input(args))
            throw new FokerError('FKR-INP-001', 'Argumentos no válidos para la herramienta.');
          await assertPrivateState(root);
          const output = await dispatch(request.params.name, args, ctx);
          if (!definition.output(output.data)) throw new FokerError('FKR-INT-001', 'Salida inválida del motor.');
          const limited = limitOutput(output.data, output.text);
          if (!definition.output(limited.structured))
            throw new FokerError('FKR-INT-001', 'Salida inválida después de redacción/truncado.');
          result = {
            isError: false,
            structuredContent: limited.structured,
            content: [{ type: 'text', text: limited.rendered ?? JSON.stringify(limited.structured) }],
            ...(limited.diagnostics ? { _meta: { diagnostics: limited.diagnostics } } : {}),
          };
        }
      } catch (error) {
        const failure = FokerError.fromNative(error);
        code = failure.code;
        if (code.startsWith('FKR-INT-') || code === 'FKR-CFG-002') {
          log(request.params.name, clock() - started, code);
          await audit.append(actor(ctx), request.params.name, args, code);
          throw protocolFailure(failure);
        }
        const message = sanitize(failure.message);
        const data = {
          code,
          message: message.slice(0, 20000),
          recoverable: failure.recoverable,
        };
        if (!validateToolError(data)) throw protocolFailure(new FokerError('FKR-INT-001', 'Error MCP inválido.'));
        result = {
          isError: true,
          structuredContent: data,
          content: [{ type: 'text', text: JSON.stringify(data) }],
          ...(message.length > 20000
            ? { _meta: { diagnostics: [{ code: 'FKR-MCP-101', message: 'Mensaje de error truncado.' }] } }
            : {}),
        };
      }
      await audit.append(
        actor(ctx),
        request.params.name,
        args,
        code ?? 'ok',
        typeof args['task_id'] === 'string'
          ? args['task_id']
          : typeof (result.structuredContent as Record<string, unknown> | undefined)?.['task_id'] === 'string'
            ? (result.structuredContent as Record<string, string>)['task_id']
            : undefined,
      );
      log(request.params.name, clock() - started, code);
      return result;
    });
    server.server.setRequestHandler('resources/list', async () => ({ resources, ...cache(0) }));
    server.server.setRequestHandler('resources/templates/list', async () => ({
      resourceTemplates: resources
        .filter((r) => r.uri.includes('{'))
        .map(({ uri, ...r }) => ({ ...r, uriTemplate: uri })),
      ...cache(0),
    }));
    server.server.setRequestHandler('resources/read', async (request, ctx) => {
      const uri = request.params.uri;
      let text: string;
      let mimeType = 'text/markdown';
      let ttlMs = 60000;
      try {
        if (uri === 'foker://rules') text = await readFile(join(root, normalizePath(root, 'foker/rules.md')), 'utf8');
        else if (uri === 'foker://map/outline') {
          const { engine } = await map();
          const project = JSON.parse(await engine.exportMapJson()) as ProjectMap;
          text = Object.entries(project.files)
            .sort(([a, x], [b, y]) => y.rank.global - x.rank.global || a.localeCompare(b))
            .slice(0, 50)
            .map(([id]) => `${id}: ${(engine.fileInfo(id)?.exports ?? []).join(', ')}`)
            .join('\n');
        } else if (/^foker:\/\/skills\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(uri))
          text = (await loadSkill(root, uri.slice('foker://skills/'.length))).markdown;
        else if (/^foker:\/\/tasks\/tsk_[0-9A-HJKMNP-TV-Z]{26}$/.test(uri)) {
          await assertPrivateState(root);
          text = JSON.stringify(sanitize(await store(ctx).touch(uri.slice('foker://tasks/'.length))));
          mimeType = 'application/json';
          ttlMs = 0;
        } else throw new FokerError('FKR-INP-001', 'Recurso desconocido');
        return { contents: [{ uri, mimeType, text: sanitize(text), ...cache(ttlMs) }], ...cache(ttlMs) };
      } catch (error) {
        const failure = FokerError.fromNative(error);
        if (failure.code.startsWith('FKR-INT-') && (error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw protocolFailure(failure);
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Recurso no disponible', { code: failure.code });
      }
    });
    return server;
  };
}
/** serveStdio selecciona la revisión con server/discover o initialize y posee el transporte. */
export async function runStdio(options: FokerServerOptions, transportOptions: ServeStdioOptions = {}) {
  const root = await checkedRoot(options.root);
  return serveStdio(serverFactory({ ...options, root }), { ...transportOptions, legacy: 'serve' });
}
