// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const KEY_FILE = path.join(os.homedir(), '.antigravity-devops-key');

export function getEncryptionKey(): string | null {
  try {
    if (fs.existsSync(KEY_FILE)) {
      return fs.readFileSync(KEY_FILE, 'utf8').trim();
    }
  } catch (error) {
    // Ignore read errors, treat as missing key
  }
  return null;
}

export function generateAndSaveKey(): string {
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
  return key;
}

export function encrypt(text: string, keyHex: string): string {
  const iv = crypto.randomBytes(12);
  const key = Buffer.from(keyHex, 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(cipherText: string, keyHex: string): string {
  const [ivHex, authTagHex, encrypted] = cipherText.split(':');
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid cipher text format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = Buffer.from(keyHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
