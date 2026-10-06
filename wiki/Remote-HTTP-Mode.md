# Remote HTTP Mode

Besides the classic **stdio** transport (used by Claude Desktop, Antigravity, Smithery installs, etc.), the server can expose its tools over **HTTP**, so that one running instance can be shared by several MCP clients or run inside a container.

> [!CAUTION]
> **Destructive actions**: in HTTP mode the server exposes exactly the same tools (including the generic `api_call` client) as in stdio mode. Anyone who can reach the endpoint and pass authentication can act on Azure DevOps with the configured credentials. **Never expose the server on a public network without authentication and HTTPS.**

---

## 🚀 1. Starting the HTTP listener

The HTTP listener is enabled when a port is provided:

```bash
# from the repository folder (dist/ is already built and committed)
node dist/index.js --port 8080
```

Port resolution order: `--port <n>` → `PORT` → `MCP_PORT`.

**Listen address**: `127.0.0.1` by default, so only clients on the same machine can connect. To accept connections from other machines (or inside a container) set `--host 0.0.0.0` or `MCP_HOST=0.0.0.0`, and **always enable authentication** in that case:

```bash
node dist/index.js --port 8080 --host 0.0.0.0 --auth-token a-long-random-secret
```

> [!NOTE]
> On **Windows** the HTTP listener only starts when a port is set explicitly. On **Linux/macOS (and inside containers)** it defaults to port `8080` when no port is set, still bound to `127.0.0.1` unless `MCP_HOST` / `--host` says otherwise. The stdio transport is always active as well, so the same process can still be used by a local stdio client.

### Exposed endpoints

| Endpoint | Purpose |
|---|---|
| `POST/GET/DELETE /mcp` | **Streamable HTTP** transport (current MCP specification, protocol `2025-03-26`+) |
| `GET /sse` + `POST /messages?sessionId=…` | **Legacy SSE** transport (protocol `2024-11-05`, for older clients) |
| `GET /.well-known/mcp/server-card.json` | Server card (name, version, tool list) |
| `GET /.well-known/oauth-protected-resource` | OAuth 2.1 protected-resource metadata (RFC 9728) |
| `GET /.well-known/oauth-authorization-server` | Authorization-server metadata pointing to Microsoft Entra ID (RFC 8414) |
| `GET /` (any other path) | Health check, returns `OK` |

---

## 🔐 2. Authentication of the MCP endpoint

Authentication protects `/mcp`, `/sse` and `/messages`. You can combine the options below.

| Variable / Flag | Description |
|---|---|
| `MCP_AUTH_TOKEN` / `--auth-token` | Static shared secret. Clients must send `Authorization: Bearer <token>`. Compared in constant time. |
| `ENTRA_TENANT_ID` / `--tenant-id` | Enables **Microsoft Entra ID** token validation. One tenant ID, a comma-separated list, or `common` / `organizations`. |
| `ENTRA_CLIENT_ID` / `--client-id` | Your Entra app registration (client) ID. Tokens whose audience is this ID (or `api://<id>`) are accepted, in addition to Azure DevOps tokens. |
| `ENTRA_ALLOWED_USERS` / `--allowed-users` | Optional comma-separated allow-list of user e-mails/UPNs. |

If **none** of them is set, the server starts in **open mode** (and logs a warning). Use open mode only on `localhost` or for testing.

**Brute-force protection**: more than 5 failed authentication attempts from the same IP within 10 minutes lock that IP out for 30 minutes (HTTP `429` with `Retry-After`).

### Microsoft Entra ID tokens

- Tokens are validated locally (RS256 signature against Microsoft's public keys, expiry, tenant, audience, optional user allow-list).
- If the token was issued for the **Azure DevOps** resource (`499b84ac-1321-427f-aa17-267ca6975798`), it is also used to call the Azure DevOps APIs on behalf of the signed-in user, so **no PAT is needed**. Provide the organization via the `X-Azure-DevOps-Org` header or the `AZURE_DEVOPS_ORG` variable.
- MCP clients that support OAuth discover the sign-in flow automatically via `/.well-known/oauth-protected-resource` (returned in the `WWW-Authenticate` header of a `401` response).

---

## 🔑 3. Azure DevOps credentials in HTTP mode

Credentials are resolved per MCP session, in this order of preference:

1. **Per-session credentials** sent by the client (multi-user):
   - **Headers (recommended)**: `X-Azure-DevOps-Org`, `X-Azure-DevOps-PAT`, `X-Azure-DevOps-Username` (optional), `X-Azure-DevOps-Project` (optional).
   - Query parameters `organization`, `pat`, `username`, `defaultProject`, or `config=<base64 JSON>` (Smithery format). Avoid them when possible: query strings can end up in proxy/access logs.
   - The `connection_configure` tool: in HTTP mode credentials are kept **in memory for that session only** and are **never written to disk**.
   - A Microsoft Entra ID token for Azure DevOps (see above).
2. **Server-wide credentials** (single-user deployment): `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_USERNAME`, `AZURE_DEVOPS_PROJECT` (or the flags `--org`, `--pat`, `--username`, `--project`).

> [!WARNING]
> If you set server-wide credentials, **always** enable `MCP_AUTH_TOKEN` or Entra ID: otherwise anyone reaching the endpoint can use your PAT.

Streamable HTTP sessions idle for more than **30 minutes** are dropped together with their in-memory credentials. The client simply re-initializes.

---

## 🐳 4. Running with Docker (local)

The repository contains a multi-stage `Dockerfile` (Node 22, runs as the unprivileged `node` user, listens on `0.0.0.0:8080` inside the container via `MCP_HOST=0.0.0.0`):

```bash
docker build -t mcp-azure-devops .

# Multi-user: every client sends its own X-Azure-DevOps-* headers
docker run -p 8080:8080 -e MCP_AUTH_TOKEN=a-long-random-secret mcp-azure-devops

# Single-user: server-wide credentials (authentication is mandatory here)
docker run -p 8080:8080 \
  -e MCP_AUTH_TOKEN=a-long-random-secret \
  -e AZURE_DEVOPS_ORG=my-org \
  -e AZURE_DEVOPS_PAT=<your-pat> \
  mcp-azure-devops
```

Client endpoint: `http://localhost:8080/mcp`

If you publish the container beyond your machine, put it behind a reverse proxy that terminates **HTTPS**.

---

## 🤖 5. Connecting MCP clients

### Clients with native remote (HTTP) support

Most modern clients accept a URL plus custom headers. The exact key name depends on the client (`url`, `serverUrl`, …):

```json
{
  "mcpServers": {
    "azure-devops": {
      "url": "http://localhost:8080/mcp",
      "headers": {
        "Authorization": "Bearer a-long-random-secret",
        "X-Azure-DevOps-Org": "my-org",
        "X-Azure-DevOps-PAT": "<your-pat>"
      }
    }
  }
}
```

### Clients that only support stdio (e.g. Claude Desktop config file)

Use the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) bridge:

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "http://localhost:8080/mcp",
        "--header", "Authorization: Bearer a-long-random-secret",
        "--header", "X-Azure-DevOps-Org: my-org",
        "--header", "X-Azure-DevOps-PAT: <your-pat>"
      ]
    }
  }
}
```

### Quick test with curl

```bash
curl -i -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer a-long-random-secret" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}}}'
```

The response contains an `Mcp-Session-Id` header. Send it with every following request.

---
## Quick Navigation Sidebar
* [Home](Home)
* [Configuration & Setup](Configuration-and-Setup)
* [Remote HTTP Mode](Remote-HTTP-Mode)
* [Tools Reference](Tools-Reference)
* [Generic REST Client & API Directory](Generic-REST-Client)
* [Testing & Sandbox Setup](Testing-and-Sandbox)
