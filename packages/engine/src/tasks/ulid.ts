import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function taskId(now: number, random: (size: number) => Uint8Array = randomBytes): string {
  if (!Number.isInteger(now) || now < 0 || now > 0xffffffffffff) throw new RangeError('Reloj fuera del rango ULID');
  const bytes = random(10);
  if (bytes.length !== 10) throw new RangeError('ULID exige 10 bytes aleatorios');
  let value = BigInt(now);
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let encoded = '';
  for (let i = 0; i < 26; i++) {
    encoded = ALPHABET[Number(value & 31n)] + encoded;
    value >>= 5n;
  }
  return `tsk_${encoded}`;
}
