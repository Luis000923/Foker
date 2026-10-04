import type { Finding } from '@foker/schemas';

const rules: [string, RegExp, number?][] = [
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['aws-secret-key', /aws_secret_access_key["']?\s*[:=]\s*["']?([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+=])/gi, 1],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g],
  ['gitlab-pat', /\bglpat-[A-Za-z0-9_-]{20,}\b/g],
  ['slack-token', /\bxox[abpr]-[A-Za-z0-9-]{20,}\b/g],
  ['slack-webhook', /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]{24,}/g],
  ['stripe-secret', /\b[sr]k_live_[A-Za-z0-9]{24,}\b/g],
  ['google-api-key', /\bAIza[A-Za-z0-9_-]{35}\b/g],
  ['gcp-service-account', /"private_key_id"\s*:\s*"[^"]+"[\s\S]{0,4096}?"private_key"\s*:\s*"([^"\n]+)"/g, 1],
  ['gcp-service-account', /"private_key"\s*:\s*"([^"\n]+)"(?=[\s\S]{0,4096}?"private_key_id"\s*:\s*"[^"]+")/g, 1],
  [
    'private-key-pem',
    /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----(?:[\s\S]*?-----END (?:[A-Z0-9]+ )?PRIVATE KEY-----)?/g,
  ],
  ['npm-token', /\bnpm_[A-Za-z0-9]{36}\b/g],
  ['pypi-token', /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{30,}\b/g],
  ['openai-key', /\bsk-(?:proj-[A-Za-z0-9_-]{48,}|[A-Za-z0-9]{48})\b/g],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g],
  ['azure-storage-key', /AccountKey=([A-Za-z0-9+/]{86}==)(?![A-Za-z0-9+/=])/g, 1],
  ['twilio-key', /\bSK[a-fA-F0-9]{32}\b/g],
  ['sendgrid-key', /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g],
  ['mailgun-key', /\bkey-[a-fA-F0-9]{32}\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{13,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g],
  ['discord-bot-token', /\b[A-Za-z0-9_-]{24,26}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38}\b/g],
  ['telegram-bot-token', /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g],
  [
    'heroku-api-key',
    /heroku(?:_api_key)?\s*[:=]\s*["']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi,
    1,
  ],
  ['databricks', /\bdapi[a-f0-9]{32}\b/g],
  ['generic-password-assignment', /\b(?:password|secret|token|api_key)["']?\s*[:=]\s*["']?([^\s"';,}]{12,})/gi, 1],
];
function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let result = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    result -= p * Math.log2(p);
  }
  return result;
}
interface Match {
  start: number;
  end: number;
  rule: string;
}
function matches(text: string): Match[] {
  const found: Match[] = [];
  for (const [rule, regex, group] of rules) {
    regex.lastIndex = 0;
    for (let m = regex.exec(text); m; m = regex.exec(text)) {
      const value = m[group ?? 0];
      if (!value || /EXAMPLE|xxxx|placeholder|<[^>]*>|\$\{|process\.env/i.test(m[0])) continue;
      if (rule === 'generic-password-assignment' && entropy(value) < 3.5) continue;
      const start = m.index + (group ? m[0].indexOf(value) : 0);
      found.push({ start, end: start + value.length, rule });
    }
  }
  // Una coincidencia específica prevalece sobre la heurística y sobre coincidencias internas.
  found.sort(
    (a, b) =>
      a.start - b.start ||
      (a.rule === 'generic-password-assignment' ? 1 : b.rule === 'generic-password-assignment' ? -1 : b.end - a.end),
  );
  const selected: Match[] = [];
  for (const match of found) {
    const prior = selected.at(-1);
    if (!prior || prior.end <= match.start) selected.push(match);
    else prior.end = Math.max(prior.end, match.end);
  }
  return selected;
}
export function scanText(text: string, { file }: { file?: string } = {}): Finding[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return matches(text).map((m) => {
    let lo = 0;
    let hi = starts.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if ((starts[mid] ?? 0) <= m.start) lo = mid;
      else hi = mid;
    }
    return {
      rule: `secret/${m.rule}`,
      ...(file ? { file } : {}),
      line: lo + 1,
      col: m.start - (starts[lo] ?? 0) + 1,
      severity: m.rule === 'generic-password-assignment' ? 'warning' : 'error',
      message: `Secreto detectado (${m.rule}).`,
    };
  });
}
export function scanAddedLines(diff: { file: string; lines: { line: number; text: string }[] }[]): Finding[] {
  return diff.flatMap(({ file, lines }) => {
    const text = lines.map((entry) => entry.text).join('\n');
    return scanText(text, { file }).map((finding) => ({
      ...finding,
      line: lines[(finding.line ?? 1) - 1]?.line ?? 1,
    }));
  });
}
export function redactSecrets(text: string): string {
  for (const m of matches(text).reverse()) text = `${text.slice(0, m.start)}[REDACTED:${m.rule}]${text.slice(m.end)}`;
  return text;
}
