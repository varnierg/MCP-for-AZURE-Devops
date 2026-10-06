# Testing and Sandbox Setup

This page describes how to run the automated tests and set up a safe, isolated sandbox environment to test the Azure DevOps MCP server tools without impacting production projects.

> [!CAUTION]
> **CRITICAL WARNING: Destructive Actions & Work Item Deletions**
> * Using the testing commands or playing with the API can lead to unintended deletions.
> * **Azure DevOps does NOT keep a recycle bin or trashcan for work items deleted via the REST API.** Always test deletions and other modification tools inside a sandbox environment rather than a live production organization.

---

## 🧪 1. Set Up a Sandbox Environment

To test the tools safely, we recommend creating a free Azure DevOps sandbox organization:

1. Go to [Azure DevOps (dev.azure.com)](https://dev.azure.com).
2. Sign in with a personal Microsoft Account (MSA) or corporate identity.
3. Create a new organization (e.g., `my-mcp-sandbox-org`).
4. Create a new private project (e.g., `TestProject`).

---

## 📁 2. Populate Test Data

To make sure all tools (Git, WIT, Pipelines, and Identities) have resources to interact with, populate the project with some test data:

### Git Repository
1. Navigate to **Repos** > **Files**.
2. If the repository is empty, click **Initialize** to create a default repository with a `main` branch and a `README.md`.
3. Optionally, add a folder (e.g., `src/`) and a few dummy files (e.g., `src/index.html` or `src/config.json`).

### Work Items
1. Navigate to **Boards** > **Work Items**.
2. Create at least two work items:
   * A **Bug** with the title `Test Bug` and a basic description.
   * A **Task** with the title `Test Task`.
3. Note the IDs of these work items (they will be integers like `1`, `2`, etc.).

### Pipelines
1. Navigate to **Pipelines** > **Pipelines**.
2. Click **Create Pipeline**.
3. Choose **Azure Repos Git** and select your repository.
4. Select **Starter pipeline** (this generates a simple pipeline that runs echo commands).
5. Click **Save and Run**.
6. Note the Pipeline ID (visible in the URL, e.g., `definitionId=1`).

### Identities
1. Navigate to **Project Settings** > **Permissions** or **Teams**.
2. Invite a second test email or note your own display name and email address to verify identity search.

---

## 🏃 3. Running Automated Tests

The codebase includes an integrated test suite in [`src/test.ts`](https://github.com/varnierg/MCP-for-AZURE-Devops/blob/main/src/test.ts) that tests internal helper functions (URL parser, crypto, config store, offline API database).

To run these tests:
```bash
npm run test
```

### ⚠️ Important Test Suite Note
The tests are self-contained and use placeholder organizations (`my-org`, `anotherorg`) with fake tokens, so **no changes to `src/test.ts` are required** and no network access to Azure DevOps is needed.

However, the configuration-store test **writes these dummy entries into your local encrypted credential file** (`.azure-devops-config.enc` in the project folder). If you already saved real credentials there, back the file up before running the tests and restore it afterwards (or simply re-run `npm run setup`).

---
## Quick Navigation Sidebar
* [Home](Home)
* [Configuration & Setup](Configuration-and-Setup)
* [Remote HTTP Mode](Remote-HTTP-Mode)
* [Tools Reference](Tools-Reference)
* [Generic REST Client & API Directory](Generic-REST-Client)
* [Testing & Sandbox Setup](Testing-and-Sandbox)
