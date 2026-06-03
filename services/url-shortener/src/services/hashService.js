import crypto from 'crypto';

// Base62 alphabet for short code encoding
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Converts a non-negative integer to a base62 string.
 * @param {BigInt|number} num - The number to encode
 * @returns {string} Base62 encoded string
 */
export function encode(num) {
  let n = BigInt(num);
  if (n === 0n) return BASE62[0];

  let result = '';
  const base = BigInt(BASE62.length);

  while (n > 0n) {
    result = BASE62[Number(n % base)] + result;
    n = n / base;
  }

  return result;
}

/**
 * Generates a 7-character short code from a URL using SHA-256 hashing.
 * Accepts an attempt counter to avoid collisions by salting the input.
 * @param {string} url - The original URL to hash
 * @param {number} attempt - Retry attempt number (used as salt on collision)
 * @returns {string} 7-character base62 short code
 */
export function generateShortCode(url, attempt = 0) {
  const input = `${url}${attempt}`;
  const hash = crypto.createHash('sha256').update(input).digest();

  // Take the first 8 bytes and interpret as a BigInt
  const firstEightBytes = hash.slice(0, 8);
  const bigIntValue = firstEightBytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);

  return encode(bigIntValue).slice(0, 7);
}
