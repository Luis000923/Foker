import { agentsBlock, claudeBlock, MCP_ARGS, roleBody, skillFiles, yamlString } from '../content.js';
import type { Desired, HostAdapter, Role, SyncInput } from '../types.js';

const HOOK = 'npx --no-install foker policy check --hook claude-code';

function agent(role: Role): string {
  const native =
    role.native === 'edit' ? ['Read', 'Glob', 'Grep', 'Edit', 'MultiEdit', 'Write', 'Bash'] : ['Read', 'Glob', 'Grep'];
  const tools = [...native, ...role.fokerTools.map((t) => `mcp__foker__${t}`)].join(', ');
  return [
    '---',
    `name: ${role.name}`,
    `description: ${yamlString(role.description)}`,
    `tools: ${tools}`,
    '---',
    '',
    roleBody(role),
  ].join('\n');
}

/** Reglas `permissions.deny` de Claude Code derivadas de la política (capa C1, FOKER-SPEC §11.1). */
export function claudeDenyRules(input: SyncInput): string[] {
  const relative = (glob: string) => (glob.startsWith('**/') || glob.includes('/') ? `./${glob}` : `./**/${glob}`);
  return [
    ...input.secretGlobs.map((g) => `Read(${relative(g)})`),
    ...input.protectedPaths.map((g) => `Edit(${relative(g)})`),
    'Bash(git push *)',
    'Bash(git reset --hard *)',
    'Bash(git clean *)',
    'Bash(git checkout -- .)',
  ];
}

export const claudeCode: HostAdapter = {
  id: 'claude-code',
  detect: (exists) => exists('CLAUDE.md') || exists('.claude') || exists('.mcp.json'),
  plan(input) {
    const desired: Desired[] = [
      { kind: 'block', path: 'AGENTS.md', body: agentsBlock() },
      { kind: 'block', path: 'CLAUDE.md', body: claudeBlock(), header: '@AGENTS.md' },
      {
        kind: 'json',
        path: '.mcp.json',
        set: [
          { pointer: ['mcpServers', 'foker'], value: { command: 'npx', args: [...MCP_ARGS, '${CLAUDE_PROJECT_DIR}'] } },
        ],
        arrays: [],
      },
      {
        kind: 'json',
        path: '.claude/settings.json',
        set: [],
        arrays: [
          { pointer: ['permissions', 'deny'], values: claudeDenyRules(input) },
          {
            pointer: ['hooks', 'PreToolUse'],
            values: [{ matcher: 'Edit|MultiEdit|Write|Bash', hooks: [{ type: 'command', command: HOOK }] }],
          },
          { pointer: ['hooks', 'Stop'], values: [{ hooks: [{ type: 'command', command: `${HOOK} --event stop` }] }] },
        ],
      },
    ];
    for (const skill of input.skills) {
      for (const file of skillFiles('.claude/skills', skill)) desired.push({ kind: 'file', ...file });
    }
    for (const role of input.roles) {
      desired.push({ kind: 'file', path: `.claude/agents/${role.name}.md`, content: agent(role) });
    }
    return desired;
  },
};
