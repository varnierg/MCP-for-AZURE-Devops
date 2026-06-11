# Azure DevOps MCP Server

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
- **Flexible REST Client**: Includes a generic tool (`call_api`) capable of executing any HTTP request (GET, POST, PATCH, etc.) against the Azure DevOps REST APIs.

---

### Exposed Tools

#### Configuration & Connection
- `configure_connection`: Save credentials (URL, Username, PAT) for a specific organization/project.
- `test_connection`: Verify connection and PAT validity for the default organization.

#### Generic REST Client & API Directory
- `call_api`: Execute arbitrary HTTP REST requests (GET, POST, PATCH, DELETE, etc.) against Azure DevOps.
- `search_api_docs`: Search the offline API directory for matching endpoints or schemas.
- `get_api_info`: Retrieve details of a specific endpoint schema, including required parameters.

#### Work Item Tracking (WIT)
- `get_work_item`: Retrieve details of a work item by ID.
- `create_work_item`: Create a new work item (Bug, Task, User Story).
- `update_work_item`: Update fields of an existing work item.
- `query_work_items`: Run complex searches using the **WIQL** (Work Item Query Language) format.
- `add_work_item_comment`: Add discussion comments to a work item.
- `link_work_item`: Link two work items (e.g., Parent/Child, Related, Duplicate).

#### Git Integration
- `list_repositories`: List Git repositories within the configured project.
- `get_git_file`: Read file contents from a specific repository and branch (default: `main`).
- `create_git_push`: Commit and push file modifications, additions, or deletions directly to a remote branch.
- `create_pull_request`: Create a new Pull Request.
- `get_pull_request`: Retrieve Pull Request status and details.
- `update_pull_request`: Update Pull Request status (e.g., to `completed`, `abandoned`, `active`).
- `create_pull_request_thread`: Create review comments on specific files and lines inside a PR.
- `list_pull_request_threads`: Retrieve all comment threads for a PR.

#### Pipeline Management
- `run_pipeline`: Trigger a pipeline run with optional parameters.
- `get_pipeline_run`: Retrieve status of a pipeline run.
- `get_pipeline_run_logs`: Fetch combined log text for a pipeline run.

#### Identity Search
- `search_identities`: Search for users or groups in the organization by name or email.

---

### Prerequisites

- **Node.js** (version 18 or higher)
- **npm** (included with Node.js)

---

### Installation

1. Clone this repository to your local machine.
2. Open your terminal in the project directory and install the required dependencies:
   ```bash
   npm install
   ```

---

### Configuration

The server requires a project or dashboard URL, your email/username, and an Azure DevOps **Personal Access Token (PAT)**.

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

#### Interactive Local Setup
Run the setup wizard:
- On Windows:
  ```cmd
  setup.bat
  ```
- Or via npm:
  ```bash
  npm run setup
  ```
Follow the prompts to configure and save your credentials safely.

---

### Running & Usage

#### Build the TypeScript code
Compile the TypeScript source code to JavaScript before running:
```bash
npm run build
```

#### Integrate with AI Clients (e.g. Claude Desktop)
Add the server to your Claude Desktop configuration file `claude_desktop_config.json` (usually located at `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mcp-azure-devops": {
      "command": "cmd.exe",
      "args": [
        "/c",
        "C:\\Path\\To\\Your\\MCP devops\\start.bat"
      ]
    }
  }
}
```

*Note: Replace `C:\\Path\\To\\Your\\MCP devops` with the actual absolute path to the project directory on your machine.*

---

### Verification
Run the integrated test suite to verify internal helper functions (crypto, config store, URL parser):
```bash
npm run test
```

> [!IMPORTANT]
> The test suite in `src/test.ts` uses the placeholder organization `my-org`. Before running tests, you should substitute occurrences of `my-org` in `src/test.ts` with your actual Azure DevOps organization name, or the mock URL parser and configuration store tests will fail.

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
- **Client REST flessibile**: Oltre ai comandi specifici, espone uno strumento generico (`call_api`) in grado di eseguire qualsiasi richiesta HTTP (GET, POST, PATCH, ecc.) verso le API REST di Azure DevOps.

---

### Elenco degli Strumenti (Tools) Esposti

#### Configurazione e Connessione
- `configure_connection`: Configura le credenziali (URL, Username, PAT) per un'organizzazione o progetto.
- `test_connection`: Verifica la connessione e la validità del PAT per l'organizzazione configurata di default.

#### Client REST Generico & Elenco API (Directory)
- `call_api`: Esegue qualsiasi richiesta REST HTTP (GET, POST, PATCH, DELETE, ecc.) verso Azure DevOps.
- `search_api_docs`: Cerca all'interno dell'elenco API locale per trovare endpoint o schemi corrispondenti.
- `get_api_info`: Recupera i dettagli sullo schema di uno specifico endpoint, inclusi i parametri richiesti.

#### Gestione Work Items (WIT)
- `get_work_item`: Recupera i dettagli di un determinato work item tramite ID.
- `create_work_item`: Crea un nuovo work item (Bug, Task, User Story).
- `update_work_item`: Aggiorna i campi di un work item esistente.
- `query_work_items`: Esegue ricerche complesse tramite il linguaggio di query **WIQL** (Work Item Query Language).
- `add_work_item_comment`: Aggiunge commenti all'area di discussione di un work item.
- `link_work_item`: Collega due work item tra loro (es. Parent/Child, correlati, duplicati).

#### Integrazione Git
- `list_repositories`: Elenca i repository Git presenti nel progetto configurato.
- `get_git_file`: Legge il contenuto di un file direttamente da un repository e da un ramo specifico (default: `main`).
- `create_git_push`: Consente di effettuare commit/push di modifiche (aggiunta, modifica, eliminazione di file) direttamente sul server remoto.
- `create_pull_request`: Crea una nuova Pull Request.
- `get_pull_request`: Legge lo stato e i dettagli di una specifica Pull Request.
- `update_pull_request`: Modifica lo stato di una Pull Request (es. impostandolo su `completed`, `abandoned`, `active`).
- `create_pull_request_thread`: Crea discussioni/commenti specifici per la revisione del codice su righe precise di un file in una PR.
- `list_pull_request_threads`: Elenca tutti i thread e commenti relativi a una PR.

#### Monitoraggio Pipelines
- `run_pipeline`: Avvia una pipeline specificando eventuali variabili di runtime.
- `get_pipeline_run`: Recupera lo stato di avanzamento di una specifica esecuzione.
- `get_pipeline_run_logs`: Estrae i log combinati di un'esecuzione per facilitare il debugging.

#### Ricerca Utenti
- `search_identities`: Cerca utenti o gruppi all'interno della directory DevOps per nome o email.

---

### Requisiti

- **Node.js** (versione 18 o superiore)
- **npm** (incluso nell'installazione di Node.js)

---

### Installazione

1. Clona questo repository sul tuo computer locale.
2. Apri il terminale nella cartella del progetto ed esegui il comando seguente per installare le dipendenze richieste:
   ```bash
   npm install
   ```

---

### Configurazione

Il server necessita di un URL di progetto (o dashboard), dell'email/username utente e di un **Personal Access Token (PAT)** di Azure DevOps.

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

#### Configurazione guidata locale
Puoi avviare lo script di setup interattivo eseguendo:
- Su Windows:
  ```cmd
  setup.bat
  ```
- Oppure tramite npm:
  ```bash
  npm run setup
  ```
Lo script ti guiderà nell'inserimento dell'URL, dello username e del PAT, verificando la connessione prima di salvare in sicurezza il file cifrato.

---

### Avvio ed Utilizzo

#### Compilazione del codice TypeScript
Prima di avviare il server, è necessario compilare i sorgenti in codice JavaScript:
```bash
npm run build
```

#### Configurazione nei client AI (es. Claude Desktop)
Per utilizzare questo server all'interno di **Claude Desktop**, modifica il file di configurazione `claude_desktop_config.json` (solitamente situato in `%APPDATA%\Claude\claude_desktop_config.json`) aggiungendo il server MCP appena configurato:

```json
{
  "mcpServers": {
    "mcp-azure-devops": {
      "command": "cmd.exe",
      "args": [
        "/c",
        "C:\\Percorso\\Della\\Cartella\\MCP devops\\start.bat"
      ]
    }
  }
}
```

*Nota: Sostituisci `C:\\Percorso\\Della\\Cartella\\MCP devops` con il percorso assoluto della cartella del progetto sul tuo computer.*

---

### Test di Autovalutazione
Per verificare il corretto funzionamento dei moduli interni (parsing degli URL, crittografia locale, ricerca nel database offline), puoi eseguire la suite di test integrata:
```bash
npm run test
```

> [!IMPORTANT]
> La suite di test in `src/test.ts` utilizza l'organizzazione fittizia `my-org`. Prima di eseguire i test, è necessario sostituire le occorrenze di `my-org` in `src/test.ts` con il nome reale della tua organizzazione Azure DevOps, altrimenti i test del parser URL e del configuration store falliranno.

#### Configurazione dell'Ambiente di Test / Creazione dei Dati di Test
Per testare gli strumenti MCP di Azure DevOps (Work Item, Git, Pipeline e Identità), puoi configurare un ambiente sandbox dedicato:
1. **Creare un'Organizzazione di Test**: Accedi a [dev.azure.com](https://dev.azure.com) e crea un'organizzazione personale gratuita (es. `my-sandbox-org`).
2. **Creare un Progetto di Test**: All'interno dell'organizzazione, crea un nuovo progetto privato (es. `TestProject`).
3. **Popolare i Dati di Test**:
   - **Repository Git**: Inizializza il repository predefinito con un ramo `main` e aggiungi alcuni file di esempio (es. `README.md`, `index.html`) per testare gli strumenti Git.
   - **Work Items**: Crea un paio di Work Item di esempio (es. un Bug intitolato "Test Bug" e un Task intitolato "Test Task") per testare la visualizzazione e modifica dei task.
   - **Pipeline**: Configura una pipeline di base (es. usando un semplice template YAML "Starter pipeline") per testare l'avvio delle pipeline e il recupero dei log.
   - **Identità**: Aggiungi almeno un altro utente o gruppo nelle impostazioni del progetto per testare lo strumento di ricerca identità.
