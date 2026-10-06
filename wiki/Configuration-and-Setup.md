# Configuration and Setup

This page guides you through setting up the Azure DevOps MCP server, generating the required credentials, understanding security measures, and integrating it with your AI client.

> [!CAUTION]
> **CRITICAL WARNING: Destructive Actions & Work Item Deletions**
> * This MCP server permits executing any REST API call in Azure DevOps (including deleting repositories, pipelines, or work items).
> * **Azure DevOps does NOT keep a recycle bin or trashcan for work items deleted via the REST API.** Once deleted, they are permanently destroyed. Use extreme caution.

---

## 🔑 1. Generate a Personal Access Token (PAT)

Azure DevOps uses Personal Access Tokens for API authentication. To configure the MCP server, you need to generate a PAT with appropriate scopes:

1. Sign in to your Azure DevOps organization (`https://dev.azure.com/{your-org}`).
2. In the top-right corner, click **User Settings** (icon next to your profile picture) and select **Personal Access Tokens**.
3. Click **New Token**.
4. Configure the token:
   * **Name**: Enter a descriptive name (e.g., `MCP-Server-Key`).
   * **Organization**: Select the specific organization or "All accessible organizations".
   * **Expiration**: Choose the desired lifetime (e.g., 30, 90 days, or custom).
   * **Scopes**: Select **Custom defined** and check the following minimum scopes for full functionality:
     * **Code**: `Read & Write` (required for Git file access, committing, pushing, and Pull Requests).
     * **Work Items**: `Read & Write` (required for viewing, creating, updating, and linking Bugs/Tasks/Stories).
     * **Build**: `Read & Execute` (required for triggering and viewing Pipeline runs and logs).
     * **Graph**: `Read` (required for searching identities/users in the organization).
5. Click **Create** and **copy the generated token immediately**. *Note: Azure DevOps will not show the token again once you close the page.*

---

## 🔒 2. Credential Security & Local Encryption

To ensure your PAT and username are not exposed in plaintext configuration files or environment variables:
* **AES-256-GCM Encryption**: The server encrypts your credentials locally.
* **Encrypted File**: Credentials are saved to a file named `.azure-devops-config.enc` inside the project's root folder.
* **Decryption Key**: A secure encryption key is automatically generated and stored in your user profile folder:
  * Windows: `C:\Users\<YourUsername>\.antigravity-devops-key`
  * Linux/macOS: `~/.antigravity-devops-key`
* **Zero Plaintext Logs**: The PAT is decrypted in-memory only when making API calls and is never written to logs or standard output.

---

## 🧙‍♂️ 3. Install via Smithery

The easiest way to install and configure Azure DevOps MCP Server for Claude Desktop is automatically via [Smithery](https://smithery.ai/servers/github-y8ge/mcp-azure-devops):

```bash
npx -y @smithery/cli install github-y8ge/mcp-azure-devops --client claude
```

> [!NOTE]
> **Zero-Config Install**: The Smithery installation is completely zero-config and will not prompt you for any API keys or credentials.
> Instead, credentials (organization, username, PAT) are configured dynamically by the AI agent itself at runtime using the `connection_configure` tool when first connecting to a new organization or project.

---

## 💻 4. Manual Installation

1. Install **Node.js 18 or newer** (includes npm).
2. Clone the repository and install the dependencies:
   ```bash
   git clone https://github.com/varnierg/MCP-for-AZURE-Devops.git
   cd MCP-for-AZURE-Devops
   npm install
   ```
3. The compiled server (`dist/index.js`) is already included in the repository. Rebuild it only if you change the TypeScript sources:
   ```bash
   npm run build
   ```

### Optional: save credentials with the setup wizard
Instead of letting the AI agent call `connection_configure`, you can store credentials upfront:
```bash
npm run setup
```

The wizard asks for:
1. **Azure DevOps project or dashboard URL** (e.g. `https://dev.azure.com/your-org/YourProject`). The organization and project are taken from the URL.
2. **Username / e-mail** of your Azure DevOps account.
3. **Personal Access Token (PAT)** generated in step 1.

If the organization is already configured, it offers to reuse the saved credentials. It tests the connection before encrypting and saving them.

---

## 🤖 5. AI Client Integration (stdio)

Add the server to your client's MCP configuration. Example for **Claude Desktop**:

* **File location**: `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).
* **Configuration snippet**:

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

On macOS/Linux use a path such as `/Users/<you>/MCP-for-AZURE-Devops/dist/index.js`. The same `command` + `args` block works in other stdio clients (Antigravity, Cursor, VS Code, …).

> [!IMPORTANT]
> Replace the path with the absolute path of the folder where you cloned the repository.

> [!WARNING]
> On **macOS/Linux** the process also opens the HTTP listener on port `8080` by default (on Windows only when a port is set). If the machine is reachable from other hosts, set `MCP_AUTH_TOKEN` in the client's `env` block or firewall the port. See [Remote HTTP Mode](Remote-HTTP-Mode).

Credentials can optionally be passed at startup instead of being stored: arguments `--org`, `--username`, `--pat`, `--project`, or environment variables `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_USERNAME`, `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_PROJECT`.

> [!TIP]
> The PAT field also accepts a **Microsoft Entra ID access token** issued for Azure DevOps. It is sent as a `Bearer` token instead of Basic authentication.

---

## 🌐 6. Remote HTTP Mode

To share one server instance between several clients, or to run it in a container, see **[Remote HTTP Mode](Remote-HTTP-Mode)**.

---
## Quick Navigation Sidebar
* [Home](Home)
* [Configuration & Setup](Configuration-and-Setup)
* [Remote HTTP Mode](Remote-HTTP-Mode)
* [Tools Reference](Tools-Reference)
* [Generic REST Client & API Directory](Generic-REST-Client)
* [Testing & Sandbox Setup](Testing-and-Sandbox)
