import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(prefix = '', length = 8) {
  let value = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    value += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return prefix ? `${prefix}-${value}` : value;
}

export function randomSecret(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function normalizeRecoveryCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
