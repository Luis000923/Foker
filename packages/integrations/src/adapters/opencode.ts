import { agentsBlock, MCP_ARGS, roleBody, skillFiles, yamlString } from '../content.js';
import type { Desired, HostAdapter, Role } from '../types.js';

function agent(role: Role): string {
  const edit = role.native === 'edit' ? 'allow' : 'deny';
  const bash = role.native === 'edit' ? 'ask' : 'deny';
  return [
    '---',
    `description: ${yamlString(role.description)}`,
    'mode: subagent',
    'permission:',
    `  edit: ${edit}`,
    `  bash: ${bash}`,
    '---',
    '',
    roleBody(role),
  ].join('\n');
}

export const opencode: HostAdapter = {
  id: 'opencode',
  detect: (exists) => exists('opencode.json') || exists('.opencode'),
  plan(input) {
    const desired: Desired[] = [
      { kind: 'block', path: 'AGENTS.md', body: agentsBlock() },
      {
        kind: 'json',
        path: 'opencode.json',
        set: [
          {
            pointer: ['mcp', 'foker'],
            // timeout: el valor por defecto de OpenCode (5 s) corta foker_task_submit (RIESGO R-09).
            value: { type: 'local', command: ['npx', ...MCP_ARGS, '.'], enabled: true, timeout: 600000 },
          },
          ...input.protectedPaths.map((glob) => ({ pointer: ['permission', 'edit', glob], value: 'deny' as const })),
          ...input.secretGlobs.map((glob) => ({ pointer: ['permission', 'read', glob], value: 'deny' as const })),
          ...['git push *', 'git reset --hard *', 'git clean *', 'git checkout -- .'].map((cmd) => ({
            pointer: ['permission', 'bash', cmd],
            value: 'deny' as const,
          })),
        ],
        arrays: [],
      },
    ];
    for (const skill of input.skills) {
      for (const file of skillFiles('.agents/skills', skill)) desired.push({ kind: 'file', ...file });
    }
    for (const role of input.roles) {
      desired.push({ kind: 'file', path: `.opencode/agents/${role.name}.md`, content: agent(role) });
    }
    return desired;
  },
};
