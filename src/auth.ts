// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
// Security & Authentication module for remote HTTP MCP endpoints:
// 1. Per-IP Failed-Auth Rate Limiter (>5 failures in 10 min -> 30 min lockout)
// 2. Microsoft Entra ID (Azure AD) JWT RS256 verification via OpenID JWKS
// 3. Static MCP_AUTH_TOKEN constant-time verification
// 4. MCP OAuth 2.1 Protected Resource & Authorization Server Metadata (/.well-known/*)

import * as http from 'http';
import * as crypto from 'crypto';
import axios from 'axios';

export interface AuthConfig {
  /** Optional static Bearer token (MCP_AUTH_TOKEN / --auth-token) */
  staticToken?: string;
  /** Optional Microsoft Entra Tenant ID (ENTRA_TENANT_ID / --tenant-id) */
  entraTenantId?: string;
  /** Optional Microsoft Entra Application (Client) ID (ENTRA_CLIENT_ID / --client-id) */
  entraClientId?: string;
  /** Optional comma-separated list of allowed user emails/UPNs (ENTRA_ALLOWED_USERS) */
  allowedUsers?: string[];
}

export interface AuthResult {
  authorized: boolean;
  /** If authenticated via Microsoft Entra JWT, the user's UPN/email */
  userPrincipalName?: string;
  /** If authenticated via Microsoft Entra JWT for Azure DevOps resource, the raw JWT */
  entraAccessToken?: string;
  /** Reason for failure (logged server-side) */
  reason?: string;
}

// Azure DevOps Microsoft first-party resource app ID
export const AZURE_DEVOPS_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798';

interface IpFailureRecord {
  failures: number[];
  lockedUntil: number;
}

const WINDOW_MS = 10 * 60 * 1000;      // 10 minutes window
const MAX_FAILURES = 5;                // >5 failures in 10 minutes triggers lockout
const LOCKOUT_MS = 30 * 60 * 1000;     // 30 minutes lockout duration

const ipRecords = new Map<string, IpFailureRecord>();

// Periodic cleanup of expired rate-limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of ipRecords) {
    const recent = rec.failures.filter(t => now - t < WINDOW_MS);
    if (recent.length === 0 && now >= rec.lockedUntil) {
      ipRecords.delete(ip);
    } else {
      rec.failures = recent;
    }
  }
}, 5 * 60 * 1000).unref();

/** Extracts the client IP address (honours X-Forwarded-For when behind a reverse proxy) */
export function getClientIp(req: http.IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (raw) {
    const first = raw.split(',')[0].trim();
    // Strip optional port (e.g. "1.2.3.4:56789")
    if (first.includes('.') && first.includes(':')) {
      return first.split(':')[0];
    }
    return first;
  }
  return req.socket?.remoteAddress || 'unknown';
}

/** Returns remaining lockout seconds if the IP is currently locked out, or 0 if allowed */
export function getIpLockoutRemainingSeconds(ip: string): number {
  const rec = ipRecords.get(ip);
  if (!rec) return 0;
  const now = Date.now();
  if (rec.lockedUntil > now) {
    return Math.ceil((rec.lockedUntil - now) / 1000);
  }
  return 0;
}

/** Records a failed authentication attempt for an IP and triggers lockout if > 5 in 10 minutes */
export function recordAuthFailure(ip: string, reason: string): { locked: boolean; retryAfterSeconds: number; attempts: number } {
  const now = Date.now();
  let rec = ipRecords.get(ip);
  if (!rec) {
    rec = { failures: [], lockedUntil: 0 };
    ipRecords.set(ip, rec);
  }
  rec.failures = rec.failures.filter(t => now - t < WINDOW_MS);
  rec.failures.push(now);

  if (rec.failures.length > MAX_FAILURES) {
    rec.lockedUntil = now + LOCKOUT_MS;
    const retryAfterSeconds = Math.ceil(LOCKOUT_MS / 1000);
    console.error(`[SECURITY] IP ${ip} locked out for ${retryAfterSeconds}s after ${rec.failures.length} failed auth attempts in 10m (${reason}).`);
    return { locked: true, retryAfterSeconds, attempts: rec.failures.length };
  }
  console.error(`[SECURITY] Failed auth attempt #${rec.failures.length}/${MAX_FAILURES} from IP ${ip}: ${reason}`);
  return { locked: false, retryAfterSeconds: 0, attempts: rec.failures.length };
}

/** Clears failure counter on successful authentication */
export function clearAuthFailures(ip: string): void {
  ipRecords.delete(ip);
}

// JWKS cache for Microsoft Entra ID
interface JwksKey {
  kid: string;
  kty: string;
  n?: string;
  e?: string;
  x5c?: string[];
  [key: string]: any;
}

let cachedKeys: { fetchedAt: number; keys: JwksKey[] } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getMicrosoftJwks(tenantId: string): Promise<JwksKey[]> {
  const now = Date.now();
  if (cachedKeys && now - cachedKeys.fetchedAt < JWKS_TTL_MS) {
    return cachedKeys.keys;
  }
  const jwksUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId || 'common')}/discovery/v2.0/keys`;
  const res = await axios.get(jwksUrl, { timeout: 8000 });
  const keys: JwksKey[] = res.data?.keys || [];
  cachedKeys = { fetchedAt: now, keys };
  return keys;
}

function base64UrlDecode(str: string): Buffer {
  const pad = 4 - (str.length % 4);
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + (pad < 4 ? '='.repeat(pad) : '');
  return Buffer.from(b64, 'base64');
}

/** Verifies a Microsoft Entra ID RS256 JWT token */
export async function verifyEntraJwt(token: string, cfg: AuthConfig): Promise<AuthResult> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { authorized: false, reason: 'Malformed JWT' };
  }

  let header: any;
  let payload: any;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  } catch {
    return { authorized: false, reason: 'Invalid JWT JSON encoding' };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return { authorized: false, reason: `Unsupported JWT alg (${header.alg}) or missing kid` };
  }

  // Check expiration & not-before (with 60s clock-skew tolerance)
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && nowSec > payload.exp + 60) {
    return { authorized: false, reason: 'JWT token has expired' };
  }
  if (typeof payload.nbf === 'number' && nowSec + 60 < payload.nbf) {
    return { authorized: false, reason: 'JWT token not yet valid (nbf)' };
  }

  // Check tenant ID if restricted (supports single tenant ID, comma-separated tenant IDs, 'common', or 'organizations')
  const tokenTid: string = (payload.tid || '').toLowerCase();
  if (cfg.entraTenantId) {
    const allowedTids = cfg.entraTenantId.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const isWildcard = allowedTids.includes('common') || allowedTids.includes('organizations') || allowedTids.includes('*');
    if (!isWildcard && allowedTids.length > 0 && !allowedTids.includes(tokenTid)) {
      return { authorized: false, reason: `Token tenant (${tokenTid}) is not in allowed tenants (${allowedTids.join(', ')})` };
    }
  }

  // Check audience: accept either the Azure DevOps resource ID, the configured Entra Client ID, or api://<clientId>
  const allowedAudiences = new Set<string>([
    AZURE_DEVOPS_RESOURCE_ID.toLowerCase(),
    `api://${AZURE_DEVOPS_RESOURCE_ID}`.toLowerCase(),
  ]);
  if (cfg.entraClientId) {
    allowedAudiences.add(cfg.entraClientId.toLowerCase());
    allowedAudiences.add(`api://${cfg.entraClientId.toLowerCase()}`);
  }
  const audList: string[] = Array.isArray(payload.aud) ? payload.aud : [String(payload.aud || '')];
  const audMatched = audList.some(a => allowedAudiences.has(a.toLowerCase().replace(/\/$/, '')));
  if (!audMatched) {
    return { authorized: false, reason: `Token audience (${audList.join(',')}) not in allowed audiences` };
  }

  // Verify cryptographic signature against Microsoft's public JWKS keys
  const jwksTenant = (!cfg.entraTenantId || cfg.entraTenantId.includes(',')) ? (tokenTid || 'common') : cfg.entraTenantId;
  const keys = await getMicrosoftJwks(jwksTenant);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) {
    // Key rotation: force refresh once
    cachedKeys = null;
    const freshKeys = await getMicrosoftJwks(jwksTenant);
    jwk = freshKeys.find(k => k.kid === header.kid);
  }
  if (!jwk) {
    return { authorized: false, reason: `Signing key kid=${header.kid} not found in Microsoft JWKS` };
  }

  let publicKey: crypto.KeyObject;
  if (jwk.x5c && jwk.x5c.length > 0) {
    const certPem = `-----BEGIN CERTIFICATE-----\n${jwk.x5c[0]}\n-----END CERTIFICATE-----`;
    publicKey = crypto.createPublicKey(certPem);
  } else {
    publicKey = crypto.createPublicKey({ key: jwk as any, format: 'jwk' });
  }

  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(`${parts[0]}.${parts[1]}`);
  verify.end();
  const signatureValid = verify.verify(publicKey, base64UrlDecode(parts[2]));
  if (!signatureValid) {
    return { authorized: false, reason: 'Invalid JWT cryptographic signature' };
  }

  // Extract candidate user identities (UPN, email, preferred_username, unique_name)
  const candidateEmails = [
    payload.preferred_username,
    payload.upn,
    payload.email,
    payload.unique_name,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map(v => v.toLowerCase().trim());
  const upn: string = candidateEmails[0] || '';

  if (cfg.allowedUsers && cfg.allowedUsers.length > 0) {
    const allowed = cfg.allowedUsers.map(u => u.toLowerCase().trim()).filter(Boolean);
    if (allowed.length > 0 && !candidateEmails.some(e => allowed.includes(e))) {
      return { authorized: false, reason: `User '${upn || payload.sub}' is not in ENTRA_ALLOWED_USERS` };
    }
  }

  // If the token audience is Azure DevOps, we can pass it directly to Azure DevOps APIs!
  const isDevOpsAud = audList.some(a => a.toLowerCase().includes(AZURE_DEVOPS_RESOURCE_ID.toLowerCase()));
  return {
    authorized: true,
    userPrincipalName: upn || payload.sub || 'entra-user',
    entraAccessToken: isDevOpsAud ? token : undefined,
  };
}

/**
 * Authenticates an incoming HTTP request against:
 *  - Reverse-proxy authentication principal headers (X-MS-CLIENT-PRINCIPAL-*) when present
 *  - Static MCP_AUTH_TOKEN (constant-time comparison)
 *  - Microsoft Entra ID JWT Bearer token (RS256 JWKS verification)
 */
export async function authenticateRequest(req: http.IncomingMessage, cfg: AuthConfig): Promise<AuthResult> {
  const authEnabled = Boolean(cfg.staticToken || cfg.entraTenantId || cfg.entraClientId);
  const header = req.headers['authorization'];
  const value = Array.isArray(header) ? header[0] : header;

  // Even when auth is not mandatory (e.g. Smithery), if the client sends a Microsoft JWT Bearer token,
  // verify it so they can use their Microsoft account seamlessly.
  if (value && value.startsWith('Bearer ')) {
    const rawToken = value.slice(7).trim();

    // 1. Check static token first if configured
    if (cfg.staticToken) {
      const provided = Buffer.from(rawToken);
      const expected = Buffer.from(cfg.staticToken);
      if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
        return { authorized: true };
      }
    }

    // 2. If it looks like a JWT (3 dot-separated parts starting with eyJ), verify with Microsoft Entra ID
    if (rawToken.startsWith('eyJ') && rawToken.split('.').length === 3) {
      try {
        return await verifyEntraJwt(rawToken, cfg);
      } catch (e: any) {
        return { authorized: false, reason: `JWT verification error: ${e.message}` };
      }
    }

    if (authEnabled) {
      return { authorized: false, reason: 'Invalid Bearer token' };
    }
  }

  // 3. Check principal headers injected by an authenticating reverse proxy (X-MS-CLIENT-PRINCIPAL-*)
  const easyAuthId = req.headers['x-ms-client-principal-id'];
  if (easyAuthId && typeof easyAuthId === 'string' && easyAuthId.trim() !== '') {
    const easyAuthName = (req.headers['x-ms-client-principal-name'] as string) || easyAuthId;
    if (cfg.allowedUsers && cfg.allowedUsers.length > 0) {
      const allowed = cfg.allowedUsers.map(u => u.toLowerCase().trim()).filter(Boolean);
      if (allowed.length > 0 && !allowed.includes(easyAuthName.toLowerCase())) {
        return { authorized: false, reason: `EasyAuth user '${easyAuthName}' not in ENTRA_ALLOWED_USERS` };
      }
    }
    const easyAuthToken = req.headers['x-ms-token-aad-access-token'] as string | undefined;
    return {
      authorized: true,
      userPrincipalName: easyAuthName,
      entraAccessToken: easyAuthToken,
    };
  }

  if (!authEnabled) {
    return { authorized: true };
  }

  return { authorized: false, reason: 'Missing Authorization: Bearer header' };
}

/** Builds the base URL (https://host) of this server from incoming proxy headers */
export function getExternalBaseUrl(req: http.IncomingMessage): string {
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

/** RFC 9728 OAuth 2.0 Protected Resource Metadata for MCP OAuth discovery */
export function buildProtectedResourceMetadata(req: http.IncomingMessage, cfg: AuthConfig): Record<string, unknown> {
  const baseUrl = getExternalBaseUrl(req);
  const tenant = cfg.entraTenantId || 'common';
  const scopes = [
    `${AZURE_DEVOPS_RESOURCE_ID}/user_impersonation`,
    'openid',
    'profile',
    'offline_access',
  ];
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [
      `https://login.microsoftonline.com/${tenant}/v2.0`,
    ],
    scopes_supported: scopes,
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://github.com/varnierg/MCP-for-AZURE-Devops',
    ...(cfg.entraClientId ? { client_id_hint: cfg.entraClientId } : {}),
  };
}

/** RFC 8414 OAuth 2.0 Authorization Server Metadata pointing MCP clients to Microsoft Entra ID */
export function buildAuthServerMetadata(req: http.IncomingMessage, cfg: AuthConfig): Record<string, unknown> {
  const tenant = cfg.entraTenantId || 'common';
  const authority = `https://login.microsoftonline.com/${tenant}`;
  return {
    issuer: `${authority}/v2.0`,
    authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
    token_endpoint: `${authority}/oauth2/v2.0/token`,
    jwks_uri: `${authority}/discovery/v2.0/keys`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [
      `${AZURE_DEVOPS_RESOURCE_ID}/user_impersonation`,
      'openid',
      'profile',
      'offline_access',
    ],
    ...(cfg.entraClientId ? { client_id_hint: cfg.entraClientId } : {}),
  };
}
