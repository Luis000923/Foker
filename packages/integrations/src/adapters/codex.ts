import { agentsBlock, MCP_ARGS, roleBody, skillFiles } from '../content.js';
import type { Desired, HostAdapter } from '../types.js';

/** Configuración TOML: cadenas JSON son también cadenas básicas TOML para estos valores. */
export const codex: HostAdapter = {
  id: 'codex',
  detect: (exists) => exists('.codex'),
  plan(input) {
    const sections = ['[mcp_servers.foker]', 'command = "npx"', `args = ${JSON.stringify([...MCP_ARGS, '.'])}`];
    const desired: Desired[] = [{ kind: 'block', path: 'AGENTS.md', body: agentsBlock() }];
    for (const role of input.roles) {
      sections.push(
        '',
        `[agents.${JSON.stringify(role.name)}]`,
        `description = ${JSON.stringify(role.description)}`,
        `config_file = ${JSON.stringify(`agents/${role.name}.toml`)}`,
      );
      desired.push({
        kind: 'file',
        path: `.codex/agents/${role.name}.toml`,
        content: `# Generado por foker sync; no editar.\nsandbox_mode = ${JSON.stringify(role.native === 'edit' ? 'workspace-write' : 'read-only')}\ndeveloper_instructions = ${JSON.stringify(roleBody(role))}\n`,
      });
    }
    desired.push({ kind: 'block', syntax: 'toml', path: '.codex/config.toml', body: `${sections.join('\n')}\n` });
    for (const skill of input.skills) {
      for (const file of skillFiles('.agents/skills', skill)) desired.push({ kind: 'file', ...file });
    }
    return desired;
  },
};
