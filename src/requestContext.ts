// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
// Per-session credential context for remote (HTTP) transports.
// In stdio mode there is no context and the classic arg/env/encrypted-file resolution is used.
import { AsyncLocalStorage } from 'async_hooks';
import type { IncomingMessage } from 'http';

export interface SessionCredentials {
  organization?: string;
  username?: string;
  pat?: string;
  project?: string;
}

export interface RequestContext {
  /** True when the call arrives over a remote HTTP transport (Streamable HTTP or SSE). */
  remote: boolean;
  /** Credentials scoped to this MCP session only (never written to disk). */
  creds: SessionCredentials;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function createRemoteContext(): RequestContext {
  return { remote: true, creds: {} };
}

const firstHeader = (req: IncomingMessage, name: string): string | undefined => {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

const nonEmpty = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

/**
 * Extracts Azure DevOps credentials supplied by the client for this request.
 * Supported sources (later sources override earlier ones):
 *  1. Smithery-style query config: `?config=<base64 JSON>`
 *  2. Plain query params: `organization`, `username`, `pat`, `defaultProject`
 *  3. Headers: `X-Azure-DevOps-Org`, `X-Azure-DevOps-Username`, `X-Azure-DevOps-PAT`, `X-Azure-DevOps-Project`
 * Headers are preferred: query strings may end up in proxy/access logs.
 */
export function extractCredentials(req: IncomingMessage, query: Record<string, unknown>): SessionCredentials {
  const out: SessionCredentials = {};
  const apply = (src: Record<string, unknown>) => {
    const org = nonEmpty(src.organization) ?? nonEmpty(src.org);
    const username = nonEmpty(src.username);
    const pat = nonEmpty(src.pat) ?? nonEmpty(src.token);
    const project = nonEmpty(src.defaultProject) ?? nonEmpty(src.project);
    if (org) out.organization = org;
    if (username) out.username = username;
    if (pat) out.pat = pat;
    if (project) out.project = project;
  };

  const rawConfig = nonEmpty(query.config);
  if (rawConfig) {
    try {
      apply(JSON.parse(Buffer.from(rawConfig, 'base64').toString('utf8')));
    } catch {
      // Ignore malformed config; the server stays usable for discovery.
    }
  }
  apply(query);
  apply({
    organization: firstHeader(req, 'x-azure-devops-org'),
    username: firstHeader(req, 'x-azure-devops-username'),
    pat: firstHeader(req, 'x-azure-devops-pat'),
    project: firstHeader(req, 'x-azure-devops-project'),
  });
  return out;
}

/** Merges newly supplied credentials into the session (only non-empty values overwrite). */
export function mergeCredentials(target: SessionCredentials, incoming: SessionCredentials): void {
  for (const key of ['organization', 'username', 'pat', 'project'] as const) {
    if (incoming[key]) target[key] = incoming[key];
  }
}
