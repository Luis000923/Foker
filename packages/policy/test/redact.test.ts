import assert from 'node:assert/strict';
import { redact, redactableEnv } from '@foker/policy';
import { test } from 'vitest';

test('un valor corto no se redacta dentro de otra palabra', () => {
  const env = { TOOL_MODE: 'code', PORT_X: '1000' };
  assert.equal(
    redact('opencode.json exit code 1 en 10000 ms', env, []),
    'opencode.json exit [REDACTED:env] 1 en 10000 ms',
  );
  assert.equal(redact('puerto 1000 abierto', env, []), 'puerto [REDACTED:env] abierto');
});

test('un secreto largo se redacta también dentro de otra cadena', () => {
  const env = { API_TOKEN: 's3cr3t-valor-largo' };
  assert.equal(redact('url?t=s3cr3t-valor-largo&x=1', env, []), 'url?t=[REDACTED:env]&x=1');
});

test('literales booleanos y claves de sesión conocidas no son secretos', () => {
  assert.equal(redactableEnv('KDE_FULL_SESSION', 'true'), false);
  assert.equal(redactableEnv('ANY_FLAG', 'TRUE'), false);
  assert.equal(redactableEnv('VISUAL', 'code'), false);
  assert.equal(redactableEnv('DB_PASSWORD', 'hunter22'), true);
  assert.equal(redact('"enabled": true', { ENABLED: 'true' }, []), '"enabled": true');
});
