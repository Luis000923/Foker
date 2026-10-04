// Ejecuta las herramientas desde fuente con Node 22, sin build ni instalación del workspace.
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const commands = new Set(['ctx-gold', 'evaluate-task', 'validate-results', 'validate-manifest']);
const command = process.argv[2];
if (!commands.has(command)) throw new Error('Comando de benchmark desconocido');
registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      return {
        format: 'module',
        source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8'), { mode: 'transform', sourceUrl: url }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
  resolve(specifier, context, nextResolve) {
    const match = /^@foker\/(core|engine|policy|schemas)$/.exec(specifier);
    if (match) return nextResolve(new URL(`../packages/${match[1]}/src/index.ts`, import.meta.url).href, context);
    if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.endsWith('.ts')) {
      const source = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(source))) return nextResolve(source.href, context);
    }
    return nextResolve(specifier, context);
  },
});
const tool = await import(`./src/${command}.ts`);
await tool.main(process.argv.slice(3));
