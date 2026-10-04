import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { formatIssues, validate } from '@foker/schemas';

export async function validateResults(path: string): Promise<number> {
  let line = 0;
  const errors: string[] = [];
  for await (const text of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
    line++;
    try {
      const result = validate('benchmark-result', JSON.parse(text));
      if (!result.ok) errors.push(`línea ${line}: ${formatIssues(result.issues)}`);
    } catch (error) {
      errors.push(`línea ${line}: ${(error as Error).message}`);
    }
  }
  if (!line) errors.push('JSONL vacío');
  if (errors.length) throw new Error(errors.join('\n'));
  return line;
}
export async function main(args: string[]): Promise<void> {
  if (!args[0]) throw new Error('Uso: validate-results <archivo.jsonl>');
  console.log(`${await validateResults(args[0])} resultados válidos`);
}
