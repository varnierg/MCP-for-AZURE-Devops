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

---

## 💻 4. Interactive Manual Setup

You can configure the server interactively by cloning the repository and running the setup script:

### Windows (Command Prompt / PowerShell)
Run the pre-configured batch script in the root directory:
```cmd
setup.bat
```

### Any OS (npm)
Run the setup command via npm:
```bash
npm run setup
```

The script will prompt you for:
1. **Azure DevOps URL**: The full URL (e.g., `https://dev.azure.com/your-org`).
2. **Username / Email**: The email address associated with your Azure DevOps account.
3. **Personal Access Token (PAT)**: The token you generated in Step 1.
4. **Default Project (Optional)**: A fallback project name to use when tools are invoked without a project specified.

The script will automatically test your connection and PAT validity before encrypting and saving them.

---

## 🤖 4. AI Client Integration (e.g., Claude Desktop)

To use the server with **Claude Desktop**, add it to your configuration file:

* **File Location**: `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).
* **Configuration Snippet**:

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

> [!IMPORTANT]
> Make sure to replace `C:\\Path\\To\\Your\\MCP devops` with the actual absolute path to the directory where you cloned the repository.

---
## Quick Navigation Sidebar
* [Home](Home)
* [Configuration & Setup](Configuration-and-Setup)
* [Tools Reference](Tools-Reference)
* [Generic REST Client & API Directory](Generic-REST-Client)
* [Testing & Sandbox Setup](Testing-and-Sandbox)
