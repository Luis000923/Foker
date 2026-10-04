import { agentsBlock, MCP_ARGS, roleBody, skillFiles, yamlString } from '../content.js';
import { GENERATED_NOTE } from '../text.js';
import type { Desired, HostAdapter } from '../types.js';

/** Límite de tamaño de una regla de Antigravity (FOKER-SPEC §14.2, FKR-065). */
export const RULE_MAX_BYTES = 24 * 1024;

export const antigravity: HostAdapter = {
  id: 'antigravity',
  detect: (exists) => exists('.agents/rules') || exists('.agents/mcp_config.json'),
  plan(input) {
    const desired: Desired[] = [
      { kind: 'block', path: 'AGENTS.md', body: agentsBlock() },
      {
        kind: 'file',
        path: '.agents/rules/foker.md',
        content: `---\ntrigger: always_on\n---\n\n${GENERATED_NOTE}\n\n${agentsBlock()}`,
      },
      {
        kind: 'json',
        path: '.agents/mcp_config.json',
        set: [{ pointer: ['mcpServers', 'foker'], value: { command: 'npx', args: [...MCP_ARGS, '.'] } }],
        arrays: [],
      },
    ];
    // Sin subagentes declarativos verificados: los roles son reglas por decisión del modelo.
    for (const role of input.roles) {
      desired.push({
        kind: 'file',
        path: `.agents/rules/${role.name}.md`,
        content: `---\ntrigger: model_decision\ndescription: ${yamlString(role.description)}\n---\n\n${roleBody(role)}`,
      });
    }
    for (const skill of input.skills) {
      for (const file of skillFiles('.agents/skills', skill)) desired.push({ kind: 'file', ...file });
    }
    return desired;
  },
};
