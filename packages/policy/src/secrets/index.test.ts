import { expect, it } from 'vitest';
import { redact } from '../exec.js';
import { redactSecrets, scanAddedLines, scanText } from './index.js';

const letters = 'Ab9Cd2Ef5Gh8Ij1Kl4Mn7Op0Qr3St6Uv9Wx2Yz5';
const hex = 'a1b2c3d4'.repeat(4);
const cases: [string, () => string][] = [
  ['aws-access-key', () => 'AK' + 'IA' + 'A1B2C3D4E5F6G7H8'],
  ['aws-secret-key', () => `aws_secret_access_key="${letters.repeat(2).slice(0, 40)}"`],
  ['github-token', () => `ghp_${letters.slice(0, 36)}`],
  ['gitlab-pat', () => `glpat-${letters.slice(0, 20)}`],
  ['slack-token', () => `xoxb-${letters.slice(0, 24)}`],
  ['slack-webhook', () => `https://hooks.slack.com/services/T123/B456/${letters.slice(0, 24)}`],
  ['stripe-secret', () => `sk_live_${letters.slice(0, 24)}`],
  ['google-api-key', () => `AIza${letters.slice(0, 35)}`],
  ['gcp-service-account', () => JSON.stringify({ private_key_id: hex, private_key: `credential-${letters}` })],
  ['private-key-pem', () => `-----BEGIN RSA PRIVATE KEY-----\n${letters}\n-----END RSA PRIVATE KEY-----`],
  ['npm-token', () => `npm_${letters.slice(0, 36)}`],
  ['pypi-token', () => `pypi-AgEIcHlwaS5vcmc${letters}`],
  ['openai-key', () => `sk-proj-${letters.repeat(2)}`],
  ['anthropic-key', () => `sk-ant-${letters.repeat(2)}`],
  ['azure-storage-key', () => `AccountKey=${letters.repeat(3).slice(0, 86)}==`],
  ['twilio-key', () => `SK${hex}`],
  ['sendgrid-key', () => `SG.${letters.slice(0, 22)}.${letters.repeat(2).slice(0, 43)}`],
  ['mailgun-key', () => `key-${hex}`],
  ['jwt', () => `eyJ${letters.slice(0, 20)}.${letters.slice(0, 20)}.${letters.slice(0, 20)}`],
  ['discord-bot-token', () => `${letters.slice(0, 24)}.${letters.slice(0, 6)}.${letters.slice(0, 27)}`],
  ['telegram-bot-token', () => `123456789:${letters.slice(0, 35)}`],
  ['heroku-api-key', () => `heroku_api_key=${['a1b2c3d4', 'e5f6', 'a7b8', 'c9d0', 'a1b2c3d4e5f6'].join('-')}`],
  ['databricks', () => `dapi${hex}`],
  ['generic-password-assignment', () => `password="${letters}"`],
];
it.each(cases)('%s: dos positivos, negativo y redacción', (rule, make) => {
  const secret = make();
  for (const text of [secret, `prefijo\n  ${secret}\nfin`]) {
    expect(scanText(text)).toContainEqual(expect.objectContaining({ rule: `secret/${rule}` }));
    expect(redactSecrets(text)).toContain(`[REDACTED:${rule}]`);
  }
  const example = secret
    .replace(letters.slice(0, 6), 'EXAMPLE')
    .replace(hex, 'EXAMPLE')
    .replace('A1B2C3', 'EXAMPLE')
    .replace('a1b2c3d4', 'EXAMPLE');
  expect(scanText(example).filter((finding) => finding.rule === `secret/${rule}`)).toEqual([]);
});
it('descarta placeholders y asignaciones de baja entropía', () => {
  for (const value of [
    'xxxxxxxxxxxxxxxx',
    'placeholder123456',
    '<some-credential>',
    '${process.env.KEY}',
    'process.env.KEY',
    'aaaaaaaaaaaa',
  ])
    expect(scanText(`password=${value}`)).toEqual([]);
});
it('variantes de tokens y claves', () => {
  for (const prefix of ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_'])
    expect(scanText(prefix + letters.slice(0, 36))[0]?.rule).toBe('secret/github-token');
  expect(scanText(`github_pat_${letters.repeat(3).slice(0, 82)}`)[0]?.rule).toBe('secret/github-token');
  expect(scanText('AS' + 'IA' + 'A1B2C3D4E5F6G7H8')[0]?.rule).toBe('secret/aws-access-key');
  expect(scanText(`sk-${letters.repeat(2).slice(0, 48)}`)[0]?.rule).toBe('secret/openai-key');
});
it('posiciones base 1 y líneas añadidas', () => {
  const secret = cases[0]?.[1]() ?? '';
  expect(scanText(`hola\n  ${secret}`, { file: 'src/a.ts' })[0]).toMatchObject({ file: 'src/a.ts', line: 2, col: 3 });
  expect(scanAddedLines([{ file: 'a.ts', lines: [{ line: 42, text: secret }] }])[0]?.line).toBe(42);
});
it('redacta entorno y secretos específicos sin revelar el valor', () => {
  const secret = cases[0]?.[1]() ?? '';
  expect(redact(`hidden ${secret}`, { PRIVATE: 'hidden' }, [])).toBe('[REDACTED:env] [REDACTED:aws-access-key]');
  expect(scanText(secret)[0]?.message).not.toContain(secret);
});
it('escanea 1 MiB en menos de 200 ms', () => {
  const text = 'Texto sin credenciales ni asignaciones.\n'.repeat(28000).slice(0, 1024 * 1024);
  const start = performance.now();
  expect(scanText(text)).toEqual([]);
  expect(performance.now() - start).toBeLessThan(200);
});
it('detecta PEM en una línea añadida y JSON con propiedades invertidas', () => {
  const header = '-----BEGIN ' + 'PRIVATE KEY-----';
  expect(scanAddedLines([{ file: 'key.pem', lines: [{ line: 9, text: header }] }])[0]?.rule).toBe(
    'secret/private-key-pem',
  );
  const json = JSON.stringify({ private_key: `credential-${letters}`, private_key_id: hex }, null, 2);
  expect(scanText(json)[0]?.rule).toBe('secret/gcp-service-account');
  const lines = json.split('\n').map((text, i) => ({ text, line: 10 + i }));
  expect(scanAddedLines([{ file: 'key.json', lines }])[0]?.line).toBe(11);
});
