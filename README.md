# Azure DevOps MCP Server
**Latest Release:** `v1.1.3`

[![smithery badge](https://smithery.ai/badge/github-y8ge/mcp-azure-devops)](https://smithery.ai/servers/github-y8ge/mcp-azure-devops)

*Language selector: [English](#english) | [Italiano](#italiano)*

---

<a name="english"></a>
## English Version

**Author:** Varnier Gatto (mcp_dev@jitime.com)

> [!CAUTION]
> **Important Warning on Deletions & API Permissions**:
> This MCP server allows the AI assistant to perform **any** REST API call in Azure DevOps (including destructive operations like deleting repositories, builds, or work items).
> **Please note that Azure DevOps does NOT keep a Recycle Bin / Trashcan for work items deleted via the REST API.** Once a work item (e.g., Bug, Task, User Story) is deleted via the API, it is permanently destroyed and cannot be restored. Use extreme caution when permitting deletion tasks.

This is a **Model Context Protocol (MCP)** server that enables AI assistants (such as Claude Desktop, Antigravity, etc.) to interact directly with **Azure DevOps**.

It provides a rich suite of tools to manage Work Items (Bugs, User Stories, Tasks), interact with Git repositories (read files, commit/push, manage Pull Requests), trigger and monitor Pipelines, and search for users or groups within the organization.

---

### Key Features

- **Credential Security**: Credentials (Username and PAT) are stored locally in encrypted form (`.azure-devops-config.enc` in the working directory) using the **AES-256-GCM** encryption algorithm. The key is safely generated and stored in your user profile folder (`~/.antigravity-devops-key`).
- **Multi-Organization and Multi-Project Support**: Seamlessly configure and interact with multiple Azure DevOps projects and organizations.
- **Offline API Database**: Includes a local cache (`api-directory.json`) of Microsoft Azure DevOps API specs to allow fast, offline endpoint searches.
- **Flexible REST Client**: Includes a generic tool (`api_call`) capable of executing any HTTP request (GET, POST, PATCH, etc.) against the Azure DevOps REST APIs.
- **Remote HTTP Mode**: Optionally serves the same tools over Streamable HTTP (`/mcp`) and legacy SSE (`/sse`), with bearer-token or Microsoft Entra ID authentication and per-session credentials. See [Remote Mode (HTTP)](#remote-mode-http).

---

### Exposed Tools

#### Configuration & Connection
- `connection_configure`: Save credentials (URL, Username, PAT) for a specific organization/project.
- `connection_test`: Verify connection and PAT validity for the default organization.

#### Generic REST Client & API Directory
- `api_call`: Execute arbitrary HTTP REST requests (GET, POST, PATCH, DELETE, etc.) against Azure DevOps.
- `api_docs`: Search the offline API directory for matching endpoints or schemas.
- `api_info`: Retrieve details of a specific endpoint schema, including required parameters.

#### Work Item Tracking (WIT)
- `workitem_get`: Retrieve details of a work item by ID.
- `workitem_create`: Create a new work item (Bug, Task, User Story).
- `workitem_update`: Update fields of an existing work item.
- `workitem_query`: Run complex searches using the **WIQL** (Work Item Query Language) format (automatically scoped to `@project` when a project is configured, with detail retrieval chunked in batches of 200 items).
- `workitem_comment`: Add discussion comments to a work item.
- `workitem_link`: Link two work items (e.g., Parent/Child, Related, Duplicate).

#### Git Integration
- `git_repos`: List Git repositories within the configured project.
- `git_file`: Read file contents from a specific repository and branch (default: `main`).
- `git_push`: Commit and push file modifications, additions, or deletions directly to a remote branch.
- `git_pr_create`: Create a new Pull Request.
- `git_pr_get`: Retrieve Pull Request status and details.
- `git_pr_update`: Update Pull Request status (e.g., to `completed`, `abandoned`, `active`).
- `git_pr_comment_create`: Create review comments on specific files and lines inside a PR.
- `git_pr_comment_list`: Retrieve all comment threads for a PR.

#### Pipeline Management
- `pipeline_run`: Trigger a pipeline run with optional parameters.
- `pipeline_get`: Retrieve status of a pipeline run.
- `pipeline_logs`: Fetch combined log text for a pipeline run.

#### Identity Search
- `identity_search`: Search for users or groups in the organization by name or email.

---

### Prerequisites

- **Node.js** (version 18 or higher)
- **npm** (included with Node.js)

---

### Installing via Smithery

To install Azure DevOps MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/servers/github-y8ge/mcp-azure-devops):

```bash
npx -y @smithery/cli install github-y8ge/mcp-azure-devops --client claude
```

> [!NOTE]
> **Zero-Config Install**: The Smithery installation is completely zero-config and will not prompt you for any API keys or credentials.
> Instead, credentials (organization, username, PAT) are configured dynamically by the AI agent itself at runtime using the `connection_configure` tool when first connecting to a new organization or project.

---

### Manual Installation

1. Install **Node.js 18 or newer** (includes npm).
2. Clone the repository and install the dependencies:
   ```bash
   git clone https://github.com/varnierg/MCP-for-AZURE-Devops.git
   cd MCP-for-AZURE-Devops
   npm install
   ```
3. The compiled server (`dist/index.js`) is already included. Rebuild it only if you change the TypeScript sources:
   ```bash
   npm run build
   ```

---

### Configuration

The server needs your Azure DevOps organization (or a project/dashboard URL), your e-mail/username and an Azure DevOps **Personal Access Token (PAT)**.

#### Generate a PAT in Azure DevOps
1. Open your Azure DevOps portal.
2. Click on the user settings icon in the top right, and select **Personal Access Tokens**.
3. Click **New Token**.
4. Select the necessary scopes. To use all MCP tools, we recommend:
   - **Code**: `Read & Write` (required for Git pushes, PRs, and reading files)
   - **Work Items**: `Read & Write` (required for managing tasks, stories, and bugs)
   - **Build**: `Read & Execute` (if you want to trigger and view pipeline runs)
   - **Graph**: `Read` (required for searching identities/users)
5. Copy the generated token (it won't be shown again).

#### How to provide the credentials (choose one)
- **At runtime (default)**: the AI agent calls `connection_configure` with URL, username and PAT the first time it connects to an organization. Credentials are encrypted and saved locally.
- **Setup wizard**: run `npm run setup` and enter the project URL, username and PAT. The wizard tests the connection before saving.
- **Startup arguments / environment variables**: `--org`, `--username`, `--pat`, `--project`, or `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_USERNAME`, `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_PROJECT`.

> [!TIP]
> The PAT field also accepts a **Microsoft Entra ID access token** issued for Azure DevOps. It is sent as a `Bearer` token.

---

### Running & Usage

#### Integrate with AI Clients (stdio)
Add the server to your client's MCP configuration. Example for **Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "mcp-azure-devops": {
      "command": "node",
      "args": [
        "C:\\Path\\To\\MCP-for-AZURE-Devops\\dist\\index.js"
      ]
    }
  }
}
```

*Note: replace the path with the absolute path of the cloned repository (on macOS/Linux e.g. `/Users/<you>/MCP-for-AZURE-Devops/dist/index.js`). The same `command` + `args` block works in other stdio clients (Antigravity, Cursor, VS Code, …).*

> [!NOTE]
> On **macOS/Linux** the process also opens the HTTP listener on port `8080` by default (on Windows only when a port is set). It listens on `127.0.0.1` only, so it is not reachable from other machines.

---

### Remote Mode (HTTP)

The server can also expose its tools over HTTP, so that one instance can be shared by several clients or run in a container. Full guide: [Remote HTTP Mode (wiki)](https://github.com/varnierg/MCP-for-AZURE-Devops/wiki/Remote-HTTP-Mode).

**Start**: `node dist/index.js --port 8080` (or `PORT` / `MCP_PORT`; Linux/macOS and containers default to `8080`). The stdio transport stays active too.

**Listen address**: `127.0.0.1` by default (local clients only). To accept connections from other machines use `--host 0.0.0.0` or `MCP_HOST=0.0.0.0` (the Docker image already sets it), and enable authentication.

| Endpoint | Purpose |
|---|---|
| `/mcp` | **Streamable HTTP** (current MCP specification) |
| `/sse` + `/messages` | **Legacy SSE** (older clients) |
| `/.well-known/mcp/server-card.json` | Server card |
| `/.well-known/oauth-protected-resource` | OAuth 2.1 protected-resource metadata (RFC 9728) |
| `/.well-known/oauth-authorization-server` | OAuth 2.0 authorization-server metadata (RFC 8414) |
| `/oauth/authorize` + `/oauth/token` | OAuth 2.0 proxy endpoints for Microsoft Entra ID v2.0 (strip RFC 8707 `resource` parameter and normalize Azure DevOps scopes) |

**Authentication of the MCP endpoint** (combinable):

| Variable / Flag | Description |
|---|---|
| `MCP_AUTH_TOKEN` / `--auth-token` | Clients must send `Authorization: Bearer <token>`. |
| `ENTRA_TENANT_ID` / `--tenant-id` | Validate Microsoft Entra ID tokens (tenant ID, comma-separated list, `common` or `organizations`). |
| `ENTRA_CLIENT_ID` / `--client-id` | Also accept tokens issued for your Entra app registration. |
| `ENTRA_ALLOWED_USERS` / `--allowed-users` | Optional comma-separated allow-list of user e-mails/UPNs. |

Without any of them the server runs in **open mode** (only for localhost/testing). More than 5 failed authentication attempts (with an invalid `Authorization` header) from an IP within 10 minutes lock that IP out for 30 minutes; unauthenticated OAuth discovery probes return `401 WWW-Authenticate` without counting toward the lockout. An Entra ID token issued for Azure DevOps is also used to call Azure DevOps on behalf of the user, so no PAT is needed.

**Azure DevOps credentials**:
- **Per session / per authenticated user (multi-user)**: headers `X-Azure-DevOps-Org`, `X-Azure-DevOps-PAT`, `X-Azure-DevOps-Username`, `X-Azure-DevOps-Project` (recommended), or query parameters `organization`, `pat`, … / `config=<base64 JSON>` (Smithery format). `connection_configure` keeps credentials **in memory only** (never on disk); when signed in via Microsoft OAuth, only `url` is required (omit `token` to use your OAuth session, or pass a custom PAT to connect as a different DevOps user). For authenticated requests (Microsoft Entra ID UPN or Bearer token), in-memory credentials also persist per authenticated user (12-hour TTL) so stateless HTTP MCP clients that open a new session per tool call retain their configured organization/project. Idle `Mcp-Session-Id` transports are dropped after 30 minutes.
- **Server-wide (single user)**: `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_USERNAME`, `AZURE_DEVOPS_PROJECT`. In this case authentication is **mandatory**.

**Docker (local)**:
```bash
docker build -t mcp-azure-devops .
docker run -p 8080:8080 -e MCP_AUTH_TOKEN=a-long-random-secret mcp-azure-devops
# Client endpoint: http://localhost:8080/mcp
```

**Client configuration** (clients with remote support; the key may be `url` or `serverUrl` depending on the client):
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
For stdio-only clients use the bridge: `npx -y mcp-remote http://localhost:8080/mcp --header "Authorization: Bearer a-long-random-secret"`.

> [!CAUTION]
> Never expose the HTTP endpoint on a public network without authentication and HTTPS (reverse proxy).

---

### Verification
Run the integrated test suite to verify internal helper functions (URL parser, crypto, config store, offline API database):
```bash
npm run test
```

> [!IMPORTANT]
> The tests are self-contained (placeholder organizations `my-org` / `anotherorg`, fake tokens): no changes to `src/test.ts` are required. The config-store test writes these dummy entries into your local `.azure-devops-config.enc`, so back it up first if it already contains real credentials.

#### Setting up a Test Environment / Creating Test Data
To test the Azure DevOps MCP tools (Work Items, Git, Pipelines, and Identities), you can set up a dedicated sandbox environment:
1. **Create a Test Organization**: Go to [dev.azure.com](https://dev.azure.com) and create a free personal organization (e.g., `my-sandbox-org`).
2. **Create a Test Project**: Within your organization, create a new private project (e.g., `TestProject`).
3. **Populate Test Data**:
   - **Git Repository**: Initialize the default repository with a `main` branch and add a few sample files (e.g., `README.md`, `index.html`) to test the Git tools.
   - **Work Items**: Create a couple of sample Work Items (e.g., a Bug with title "Test Bug" and a Task with title "Test Task") to test WIT tools.
   - **Pipelines**: Create a basic pipeline (e.g., using a simple starter YAML template) to test pipeline runs and log retrieval.
   - **Identities**: Add at least one other user or group in your project settings to test identity search.

---
---

<a name="italiano"></a>
## Versione Italiana

**Autore:** Varnier Gatto (mcp_dev@jitime.com)

> [!CAUTION]
> **Avviso Importante su Eliminazioni e Permessi API**:
> Questo server MCP consente all'assistente AI di eseguire **qualsiasi** chiamata REST API in Azure DevOps (comprese operazioni distruttive come l'eliminazione di repository, build o work item).
> **Si prega di notare che Azure DevOps NON conserva un Cestino per i work item eliminati tramite le API REST.** Una volta che un work item (es. Bug, Task, User Story) viene eliminato tramite l'API, viene distrutto in modo permanente e non può essere ripristinato. Prestare la massima attenzione quando si autorizzano compiti di eliminazione.

Questo è un server **Model Context Protocol (MCP)** che consente ai modelli di intelligenza artificiale (come Claude Desktop, Antigravity, ecc.) di interagire direttamente con **Azure DevOps**.

Il server fornisce una ricca suite di strumenti per gestire Work Item (Bug, User Story, Task), interagire con i repository Git (leggere file, effettuare commit/push, gestire Pull Request), monitorare pipeline ed eseguire ricerche di identità all'interno dell'organizzazione.

---

### Caratteristiche Principali

- **Sicurezza delle Credenziali**: Le credenziali (Username e PAT) vengono salvate localmente in formato cifrato (`.azure-devops-config.enc` nella directory di lavoro) tramite algoritmo **AES-256-GCM**. La chiave di cifratura viene generata in modo sicuro e memorizzata nella cartella utente (`~/.antigravity-devops-key`).
- **Supporto Multi-Organization e Multi-Project**: È possibile configurare e gestire molteplici progetti e organizzazioni DevOps.
- **Cache API Offline**: Include un database locale (`api-directory.json`) contenente la documentazione delle API Microsoft Azure DevOps per permettere ricerche rapide offline degli endpoint.
- **Client REST flessibile**: Oltre ai comandi specifici, espone uno strumento generico (`api_call`) in grado di eseguire qualsiasi richiesta HTTP (GET, POST, PATCH, ecc.) verso le API REST di Azure DevOps.
- **Modalità Remota HTTP**: Opzionalmente espone gli stessi strumenti via Streamable HTTP (`/mcp`) e SSE legacy (`/sse`), con autenticazione tramite bearer token o Microsoft Entra ID e credenziali per singola sessione. Vedi [Modalità Remota (HTTP)](#modalità-remota-http).

---

### Elenco degli Strumenti (Tools) Esposti

#### Configurazione e Connessione
- `connection_configure`: Configura le credenziali (URL, Username, PAT) per un'organizzazione o progetto.
- `connection_test`: Verifica la connessione e la validità del PAT per l'organizzazione configurata di default.

#### Client REST Generico & Elenco API (Directory)
- `api_call`: Esegue qualsiasi richiesta REST HTTP (GET, POST, PATCH, DELETE, ecc.) verso Azure DevOps.
- `api_docs`: Cerca all'interno dell'elenco API locale per trovare endpoint o schemi corrispondenti.
- `api_info`: Recupera i dettagli sullo schema di uno specifico endpoint, inclusi i parametri richiesti.

#### Gestione Work Items (WIT)
- `workitem_get`: Recupera i dettagli di un determinato work item tramite ID.
- `workitem_create`: Crea un nuovo work item (Bug, Task, User Story).
- `workitem_update`: Aggiorna i campi di un work item esistente.
- `workitem_query`: Esegue ricerche complesse tramite il linguaggio di query **WIQL** (Work Item Query Language), filtrando automaticamente per il progetto configurato (`@project`) e recuperando i dettagli in blocchi da 200 elementi.
- `workitem_comment`: Aggiunge commenti all'area di discussione di un work item.
- `workitem_link`: Collega due work item tra loro (es. Parent/Child, correlati, duplicati).

#### Integrazione Git
- `git_repos`: Elenca i repository Git presenti nel progetto configurato.
- `git_file`: Legge il contenuto di un file direttamente da un repository e da un ramo specifico (default: `main`).
- `git_push`: Consente di effettuare commit/push di modifiche (aggiunta, modifica, eliminazione di file) direttamente sul server remoto.
- `git_pr_create`: Crea una nuova Pull Request.
- `git_pr_get`: Legge lo stato e i dettagli di una specifica Pull Request.
- `git_pr_update`: Modifica lo stato di una Pull Request (es. impostandolo su `completed`, `abandoned`, `active`).
- `git_pr_comment_create`: Crea discussioni/commenti specifici per la revisione del codice su righe precise di un file in una PR.
- `git_pr_comment_list`: Elenca tutti i thread e commenti relativi a una PR.

#### Monitoraggio Pipelines
- `pipeline_run`: Avvia una pipeline specificando eventuali variabili di runtime.
- `pipeline_get`: Recupera lo stato di avanzamento di una specifica esecuzione.
- `pipeline_logs`: Estrae i log combinati di un'esecuzione per facilitare il debugging.

#### Ricerca Utenti
- `identity_search`: Cerca utenti o gruppi all'interno della directory DevOps per nome o email.

---

### Requisiti

- **Node.js** (versione 18 o superiore)
- **npm** (incluso nell'installazione di Node.js)

---

### Installazione tramite Smithery

Per installare automaticamente Azure DevOps MCP Server per Claude Desktop tramite [Smithery](https://smithery.ai/servers/github-y8ge/mcp-azure-devops):

```bash
npx -y @smithery/cli install github-y8ge/mcp-azure-devops --client claude
```

> [!NOTE]
> **Installazione Zero-Config**: L'installazione tramite Smithery è completamente priva di configurazione iniziale e non ti chiederà chiavi API o credenziali.
> Al contrario, le credenziali (organizzazione, username, PAT) vengono configurate dinamicamente dall'assistente IA stesso a runtime tramite lo strumento `connection_configure` durante la prima connessione a una nuova organizzazione o progetto.

---

### Installazione Manuale

1. Installa **Node.js 18 o superiore** (include npm).
2. Clona il repository e installa le dipendenze:
   ```bash
   git clone https://github.com/varnierg/MCP-for-AZURE-Devops.git
   cd MCP-for-AZURE-Devops
   npm install
   ```
3. Il server compilato (`dist/index.js`) è già incluso. Ricompila solo se modifichi i sorgenti TypeScript:
   ```bash
   npm run build
   ```

---

### Configurazione

Il server necessita dell'organizzazione Azure DevOps (o di un URL di progetto/dashboard), dell'email/username utente e di un **Personal Access Token (PAT)** di Azure DevOps.

#### Generare un PAT in Azure DevOps
1. Accedi al tuo portale Azure DevOps.
2. In alto a destra, clicca sull'icona delle impostazioni utente e seleziona **Personal Access Tokens**.
3. Clicca su **New Token**.
4. Seleziona i permessi necessari (scopi). Per utilizzare tutti gli strumenti del server MCP, si raccomandano i seguenti permessi:
   - **Code**: `Read & Write` (necessario per push, pull request e lettura dei file)
   - **Work Items**: `Read & Write` (necessario per gestire i task e i bug)
   - **Build**: `Read & Execute` (se desideri avviare ed esaminare i log delle pipeline)
   - **Graph**: `Read` (necessario per cercare identità e utenti)
5. Copia il token generato (non sarà più visibile successivamente).

#### Come fornire le credenziali (scegline una)
- **A runtime (predefinito)**: l'assistente IA chiama `connection_configure` con URL, username e PAT alla prima connessione a un'organizzazione. Le credenziali vengono cifrate e salvate localmente.
- **Configurazione guidata**: esegui `npm run setup` e inserisci URL del progetto, username e PAT. Lo script verifica la connessione prima di salvare.
- **Argomenti di avvio / variabili d'ambiente**: `--org`, `--username`, `--pat`, `--project`, oppure `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_USERNAME`, `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_PROJECT`.

> [!TIP]
> Il campo PAT accetta anche un **access token Microsoft Entra ID** emesso per Azure DevOps, che viene inviato come token `Bearer`.

---

### Avvio ed Utilizzo

#### Configurazione nei client AI (stdio)
Aggiungi il server alla configurazione MCP del tuo client. Esempio per **Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json` su Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` su macOS):

```json
{
  "mcpServers": {
    "mcp-azure-devops": {
      "command": "node",
      "args": [
        "C:\\Percorso\\Della\\Cartella\\MCP-for-AZURE-Devops\\dist\\index.js"
      ]
    }
  }
}
```

*Nota: sostituisci il percorso con quello assoluto del repository clonato (su macOS/Linux ad es. `/Users/<utente>/MCP-for-AZURE-Devops/dist/index.js`). Lo stesso blocco `command` + `args` funziona anche negli altri client stdio (Antigravity, Cursor, VS Code, …).*

> [!NOTE]
> Su **macOS/Linux** il processo apre per impostazione predefinita anche il listener HTTP sulla porta `8080` (su Windows solo se la porta è impostata). Il listener è in ascolto solo su `127.0.0.1`, quindi non è raggiungibile da altre macchine.

---

### Modalità Remota (HTTP)

Il server può esporre gli stessi strumenti anche via HTTP, così un'unica istanza può essere condivisa da più client o eseguita in un container. Guida completa (in inglese): [Remote HTTP Mode (wiki)](https://github.com/varnierg/MCP-for-AZURE-Devops/wiki/Remote-HTTP-Mode).

**Avvio**: `node dist/index.js --port 8080` (oppure `PORT` / `MCP_PORT`; su Linux/macOS e nei container la porta predefinita è `8080`). Il trasporto stdio resta comunque attivo.

**Indirizzo di ascolto**: `127.0.0.1` per impostazione predefinita (solo client locali). Per accettare connessioni da altre macchine usa `--host 0.0.0.0` o `MCP_HOST=0.0.0.0` (l'immagine Docker lo imposta già) e attiva l'autenticazione.

| Endpoint | Scopo |
|---|---|
| `/mcp` | **Streamable HTTP** (specifica MCP attuale) |
| `/sse` + `/messages` | **SSE legacy** (client meno recenti) |
| `/.well-known/mcp/server-card.json` | Server card |
| `/.well-known/oauth-protected-resource` | Metadati risorsa protetta OAuth 2.1 (RFC 9728) |
| `/.well-known/oauth-authorization-server` | Metadati authorization server OAuth 2.0 (RFC 8414) |
| `/oauth/authorize` + `/oauth/token` | Endpoint proxy OAuth 2.0 per Microsoft Entra ID v2.0 (rimuovono il parametro `resource` RFC 8707 e normalizzano gli scope Azure DevOps) |

**Autenticazione dell'endpoint MCP** (combinabili):

| Variabile / Flag | Descrizione |
|---|---|
| `MCP_AUTH_TOKEN` / `--auth-token` | I client devono inviare `Authorization: Bearer <token>`. |
| `ENTRA_TENANT_ID` / `--tenant-id` | Valida i token Microsoft Entra ID (ID tenant, elenco separato da virgole, `common` o `organizations`). |
| `ENTRA_CLIENT_ID` / `--client-id` | Accetta anche i token emessi per la tua app registration Entra. |
| `ENTRA_ALLOWED_USERS` / `--allowed-users` | Elenco opzionale (separato da virgole) di email/UPN autorizzati. |

Senza nessuna di queste opzioni il server funziona in **modalità aperta** (solo per localhost/test). Più di 5 tentativi di autenticazione falliti (con un header `Authorization` non valido) da uno stesso IP in 10 minuti bloccano quell'IP per 30 minuti; le sonde di discovery OAuth prive di autenticazione restituiscono `401 WWW-Authenticate` senza essere conteggiate nel blocco. Un token Entra ID emesso per Azure DevOps viene usato anche per chiamare Azure DevOps per conto dell'utente, senza bisogno di PAT.

**Credenziali Azure DevOps**:
- **Per sessione / per utente autenticato (multi-utente)**: header `X-Azure-DevOps-Org`, `X-Azure-DevOps-PAT`, `X-Azure-DevOps-Username`, `X-Azure-DevOps-Project` (consigliati), oppure parametri query `organization`, `pat`, … / `config=<JSON base64>` (formato Smithery). `connection_configure` mantiene le credenziali **solo in memoria** (mai su disco); quando si accede tramite Microsoft OAuth è sufficiente passare `url` (ometti `token` per usare la sessione OAuth, oppure fornisci un PAT personalizzato per connetterti con un'altra utenza DevOps). Per le richieste autenticate (UPN Microsoft Entra ID o Bearer token), le credenziali in memoria vengono inoltre mantenute per singolo utente autenticato (TTL di 12 ore), così i client MCP HTTP stateless che aprono una nuova sessione per ogni chiamata agli strumenti mantengono organizzazione e progetto configurati. Le sessioni `Mcp-Session-Id` inattive da più di 30 minuti vengono eliminate.
- **Globali (utente singolo)**: `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_USERNAME`, `AZURE_DEVOPS_PROJECT`. In questo caso l'autenticazione è **obbligatoria**.

**Docker (locale)**:
```bash
docker build -t mcp-azure-devops .
docker run -p 8080:8080 -e MCP_AUTH_TOKEN=un-segreto-lungo-e-casuale mcp-azure-devops
# Endpoint client: http://localhost:8080/mcp
```

**Configurazione del client** (client con supporto remoto; la chiave può essere `url` o `serverUrl` a seconda del client):
```json
{
  "mcpServers": {
    "azure-devops": {
      "url": "http://localhost:8080/mcp",
      "headers": {
        "Authorization": "Bearer un-segreto-lungo-e-casuale",
        "X-Azure-DevOps-Org": "my-org",
        "X-Azure-DevOps-PAT": "<il-tuo-pat>"
      }
    }
  }
}
```
Per i client solo stdio usa il bridge: `npx -y mcp-remote http://localhost:8080/mcp --header "Authorization: Bearer un-segreto-lungo-e-casuale"`.

> [!CAUTION]
> Non esporre mai l'endpoint HTTP su una rete pubblica senza autenticazione e HTTPS (reverse proxy).

---

### Test di Autovalutazione
Per verificare il corretto funzionamento dei moduli interni (parsing degli URL, crittografia locale, configuration store, ricerca nel database offline), puoi eseguire la suite di test integrata:
```bash
npm run test
```

> [!IMPORTANT]
> I test sono autonomi (organizzazioni fittizie `my-org` / `anotherorg`, token finti): non è necessario modificare `src/test.ts`. Il test del configuration store scrive queste voci fittizie nel file locale `.azure-devops-config.enc`: se contiene già credenziali reali, fanne prima una copia di backup.

#### Configurazione dell'Ambiente di Test / Creazione dei Dati di Test
Per testare gli strumenti MCP di Azure DevOps (Work Item, Git, Pipeline e Identità), puoi configurare un ambiente sandbox dedicato:
1. **Creare un'Organizzazione di Test**: Accedi a [dev.azure.com](https://dev.azure.com) e crea un'organizzazione personale gratuita (es. `my-sandbox-org`).
2. **Creare un Progetto di Test**: All'interno dell'organizzazione, crea un nuovo progetto privato (es. `TestProject`).
3. **Popolare i Dati di Test**:
   - **Repository Git**: Inizializza il repository predefinito con un ramo `main` e aggiungi alcuni file di esempio (es. `README.md`, `index.html`) per testare gli strumenti Git.
   - **Work Items**: Crea un paio di Work Item di esempio (es. un Bug intitolato "Test Bug" e un Task intitolato "Test Task") per testare la visualizzazione e modifica dei task.
   - **Pipeline**: Configura una pipeline di base (es. usando un semplice template YAML "Starter pipeline") per testare l'avvio delle pipeline e il recupero dei log.
   - **Identità**: Aggiungi almeno un altro utente o gruppo nelle impostazioni del progetto per testare lo strumento di ricerca identità.
