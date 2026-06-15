# Welcome to the Azure DevOps MCP Server Wiki

[![smithery badge](https://smithery.ai/badge/github-y8ge/mcp-azure-devops)](https://smithery.ai/servers/github-y8ge/mcp-azure-devops)

This wiki contains detailed documentation and reference guides for the **Azure DevOps Model Context Protocol (MCP)** server.

> [!CAUTION]
> **CRITICAL WARNING: Destructive Actions & Work Item Deletions**
> * This MCP server is powerful and exposes tools (and a generic REST client) that allow an AI assistant to perform **any** API call in your Azure DevOps organization (such as committing/pushing code, deleting repositories, triggering builds, or altering work items).
> * **Azure DevOps does NOT keep a recycle bin or trashcan for work items deleted via the REST API.** If a work item (e.g., Bug, Task, User Story) is deleted via the API (using `api.call` or other means), it is **permanently destroyed** and cannot be restored.
> * Always review and approve suggested operations carefully, especially when granting write/delete permissions or confirming commands.

---

## Documentation Index

Explore the detailed sections of the documentation:

### 1. ⚙️ [Configuration & Setup](Configuration-and-Setup)
* Learn how to generate a Personal Access Token (PAT) with the correct scopes.
* Understand the credential security architecture (AES-256-GCM local encryption).
* Run the interactive setup wizard and integrate the server with AI clients like Claude Desktop.

### 2. 🛠️ [Tools Reference](Tools-Reference)
* Complete specifications for all 23 exposed tools.
* Parameter lists, required fields, and examples for Work Item Tracking (WIT), Git Integration, Pipeline Management, and Identity Search.

### 3. 🌐 [Generic REST Client & API Directory](Generic-REST-Client)
* How to use the powerful `api.call` tool.
* Explaining the offline API directory (`api.docs` and `api.info`) which helps AI models discover and execute arbitrary Azure DevOps REST API requests.

### 4. 🧪 [Testing & Sandbox Setup](Testing-and-Sandbox)
* How to run the automated unit tests.
* Creating a free sandbox Azure DevOps organization and populating test data to verify the MCP tools safely.

---

## Quick Navigation Sidebar
* [Home](Home)
* [Configuration & Setup](Configuration-and-Setup)
* [Tools Reference](Tools-Reference)
* [Generic REST Client & API Directory](Generic-REST-Client)
* [Testing & Sandbox Setup](Testing-and-Sandbox)
