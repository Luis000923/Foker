import { PACKAGE_NAME as ENGINE } from '@foker/engine';
import { PACKAGE_NAME as INTEGRATIONS } from '@foker/integrations';
import { PACKAGE_NAME as MCP } from '@foker/mcp';
import { describe, expect, it } from 'vitest';

describe('workspace', () => {
  it('resuelve las dependencias declaradas de la CLI desde el código fuente', () => {
    expect([ENGINE, INTEGRATIONS, MCP]).toEqual(['@foker/engine', '@foker/integrations', '@foker/mcp']);
  });
});
