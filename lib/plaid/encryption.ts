import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ENCRYPTION_KEY = process.env.PLAID_TOKEN_ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

// Derive a 32-byte key from the environment variable
function getKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error('PLAID_TOKEN_ENCRYPTION_KEY is not set');
  }
  // Use scrypt to derive a 32-byte key from the secret
  return scryptSync(ENCRYPTION_KEY, 'plaid-access-token-salt', 32);
}

/**
 * Encrypts a Plaid access token for secure storage
 * Returns a string in format: iv:authTag:encryptedData (all base64)
 */
export function encryptAccessToken(accessToken: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(accessToken, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine iv, authTag, and encrypted data
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypts a stored Plaid access token
 * Expects input in format: iv:authTag:encryptedData (all base64)
 */
export function decryptAccessToken(encryptedToken: string): string {
  const key = getKey();
  const [ivBase64, authTagBase64, encryptedData] = encryptedToken.split(':');

  if (!ivBase64 || !authTagBase64 || !encryptedData) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Checks if the encryption key is configured
 */
export function isEncryptionConfigured(): boolean {
  return Boolean(ENCRYPTION_KEY);
}
