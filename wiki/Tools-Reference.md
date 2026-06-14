# Tools Reference

This page lists all **23 tools** exposed by the Azure DevOps MCP server, grouped by functionality.

> [!CAUTION]
> **CRITICAL WARNING: Destructive Actions & Work Item Deletions**
> * Tools that modify data (e.g. `git.push.create`, `work_item.update`, `git.pull_request.update`) and the generic client `api.call` can perform destructive operations.
> * **Azure DevOps does NOT keep a recycle bin or trashcan for work items deleted via the REST API.** Once deleted via the API, a work item is permanently lost and cannot be recovered. Ensure you double-check any deletion actions.

---

## Index of Categories
1. [Configuration & Connection](#1-configuration--connection)
2. [Generic REST Client & API Directory](#2-generic-rest-client--api-directory)
3. [Work Item Tracking (WIT)](#3-work-item-tracking-wit)
4. [Git Integration](#4-git-integration)
5. [Pipeline Management](#5-pipeline-management)
6. [Identity Search](#6-identity-search)

---

## 1. Configuration & Connection

### `connection.configure`
Configures and encrypts Azure DevOps credentials (Username & Personal Access Token) for a specific organization/project URL. Must be called before other tools if no prior configuration exists.
* **Parameters**:
  * `url` (string, **required**): The project or dashboard URL (e.g. `https://dev.azure.com/my-org/Test`).
  * `username` (string, **required**): Your username or email.
  * `token` (string, **required**): Your Personal Access Token (PAT).
* **Output**: A success message indicating that configuration was encrypted and saved.

### `connection.test`
Verifies connection to Azure DevOps for a configured organization.
* **Parameters**:
  * `organization` (string, optional): Organization name override. If omitted, uses the default organization.
* **Output**: Connection status and organization verification.

---

## 2. Generic REST Client & API Directory

### `api.call`
Executes an arbitrary REST API call against Azure DevOps. Supports **all** DevOps endpoints.
* **Parameters**:
  * `method` (string, **required**, enum: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`): The HTTP method.
  * `path` (string, **required**): The API path (e.g., `/_apis/git/repositories` or `_apis/wit/workitems/123`).
  * `body` (object, optional): Request body JSON object.
  * `apiVersion` (string, optional): API version override (defaults to `7.1`).
  * `organization` (string, optional): Organization name override.
  * `project` (string, optional): Project name override.
* **Output**: The JSON response returned by the Azure DevOps API.

### `api.docs.search`
Searches the offline local database of Azure DevOps APIs and parameters to find the correct endpoint paths.
* **Parameters**:
  * `query` (string, **required**): Search term (e.g., `"pull requests"`, `"workitems"`).
  * `area` (string, optional): Area filter (e.g., `"wit"`, `"git"`, `"pipelines"`).
* **Output**: A list of matching endpoints, methods, and descriptions.

### `api.info.get`
Gets documentation for a specific API endpoint. Checks the local database first and falls back to Microsoft specs online.
* **Parameters**:
  * `method` (string, **required**, enum: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`): The HTTP method.
  * `path` (string, **required**): The full API path (e.g., `/_apis/git/repositories`).
* **Output**: Endpoint description, required parameters, and request body schema.

---

## 3. Work Item Tracking (WIT)

### `work_item.get`
Retrieves details for a specific Azure DevOps work item by ID.
* **Parameters**:
  * `id` (number, **required**): Work Item ID.
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: The work item object, including field values (System.Title, System.State, System.Description, etc.) and relations.

### `work_item.create`
Creates a new work item in Azure DevOps.
* **Parameters**:
  * `type` (string, **required**): Work item type (e.g., `"Bug"`, `"Task"`, `"User Story"`).
  * `title` (string, **required**): Title of the work item.
  * `description` (string, optional): Description or steps to reproduce (supports HTML or plain text).
  * `fields` (object, optional): Key-value object of extra fields (e.g., `{"System.AssignedTo": "user@email.com"}`).
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: The newly created work item details including its ID.

### `work_item.update`
Updates field values on an existing work item.
* **Parameters**:
  * `id` (number, **required**): Work Item ID.
  * `fields` (object, **required**): Key-value object of fields to update (e.g., `{"System.State": "Done", "System.AssignedTo": "user@email.com"}`).
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: The updated work item details.

### `work_item.query`
Searches work items using Work Item Query Language (WIQL) and returns batch details.
* **Parameters**:
  * `wiql` (string, **required**): WIQL query string (e.g. `Select [System.Id] From WorkItems Where [System.WorkItemType] = 'Bug'`).
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: A list of matching work items with their ID, Type, Title, State, and Assigned To fields.

### `work_item.comment.add`
Adds a discussion comment to a work item.
* **Parameters**:
  * `id` (number, **required**): Work Item ID.
  * `text` (string, **required**): Comment text (supports HTML).
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: The added comment details.

### `work_item.link`
Links two work items together using a relation type.
* **Parameters**:
  * `sourceId` (number, **required**): Source Work Item ID.
  * `targetId` (number, **required**): Target Work Item ID.
  * `relationType` (string, **required**): Relation type link name (e.g. `"System.LinkTypes.Hierarchy-Forward"` for Child, `"System.LinkTypes.Hierarchy-Reverse"` for Parent, `"System.LinkTypes.Related"` for Related).
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: Details of the newly created link.

---

## 4. Git Integration

### `git.repository.list`
Lists all Git repositories in the configured project.
* **Parameters**:
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: Array of repositories (Name, ID, URL).

### `git.file.get`
Reads the content of a file from an Azure DevOps Git repository.
* **Parameters**:
  * `repositoryId` (string, **required**): Name or ID of the repository.
  * `path` (string, **required**): Path to the file in the repository (e.g., `"/src/app.ts"`).
  * `branch` (string, optional): Branch name (defaults to `"main"`).
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: The text content of the file.

### `git.push.create`
Pushes file changes (additions, modifications, deletions) directly to a repository branch as a single push/commit.
* **Parameters**:
  * `repositoryId` (string, **required**): Name or ID of the repository.
  * `branchName` (string, **required**): Target branch name.
  * `commitMessage` (string, **required**): Commit message.
  * `changes` (array of objects, **required**): List of file modifications.
    * Each object contains:
      * `changeType` (string, **required**, enum: `add`, `edit`, `delete`): Type of change.
      * `path` (string, **required**): File path in repo (e.g. `"/newfile.txt"`).
      * `content` (string, required for add/edit): File content.
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: Push ID and commit details.

### `git.pull_request.create`
Creates a Pull Request in a Git repository.
* **Parameters**:
  * `repositoryId` (string, **required**): Name or ID of the repository.
  * `sourceBranch` (string, **required**): Source branch (e.g., `"feature-branch"`).
  * `targetBranch` (string, **required**): Target branch (e.g., `"main"`).
  * `title` (string, **required**): PR Title.
  * `description` (string, optional): PR Description.
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: Pull Request details including ID, URL, and Status.

### `git.pull_request.get`
Gets details and status of a Pull Request.
* **Parameters**:
  * `repositoryId` (string, **required**): Name or ID of the repository.
  * `pullRequestId` (number, **required**): PR ID.
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: Pull Request details, status, merge status, and repository.

### `git.pull_request.update`
Updates a Pull Request status (e.g., active, abandoned, completed).
* **Parameters**:
  * `repositoryId` (string, **required**): Name or ID of the repository.
  * `pullRequestId` (number, **required**): PR ID.
  * `status` (string, **required**, enum: `active`, `abandoned`, `completed`): Target status.
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: The updated Pull Request status.

### `git.pull_request.thread.create`
Creates an inline code review comment thread on a file and line number in a PR.
* **Parameters**:
  * `repositoryId` (string, **required**): Name or ID of the repository.
  * `pullRequestId` (number, **required**): PR ID.
  * `filePath` (string, **required**): File path in the repository.
  * `line` (number, **required**): Line number.
  * `content` (string, **required**): Comment text.
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: Thread ID and comment details.

### `git.pull_request.thread.list`
Retrieves all comment threads and replies on a PR.
* **Parameters**:
  * `repositoryId` (string, **required**): Name or ID of the repository.
  * `pullRequestId` (number, **required**): PR ID.
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: A structured list of all comment threads, files, line numbers, and comments.

---

## 5. Pipeline Management

### `pipeline.run`
Triggers a run of a pipeline.
* **Parameters**:
  * `pipelineId` (number, **required**): Pipeline ID.
  * `variables` (object, optional): Runtime variables key-value object (e.g. `{"skipTests": "true"}`).
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: Run details including ID, State, Result, and URL.

### `pipeline.run.get`
Retrieves the status of a specific pipeline run.
* **Parameters**:
  * `pipelineId` (number, **required**): Pipeline ID.
  * `runId` (number, **required**): Run ID.
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: Current state, result, creation time, and finished time.

### `pipeline.run.logs.get`
Retrieves combined log content for a pipeline run.
* **Parameters**:
  * `pipelineId` (number, **required**): Pipeline ID.
  * `runId` (number, **required**): Run ID.
  * `organization` (string, optional): Organization override.
  * `project` (string, optional): Project override.
* **Output**: Full logs text content from the run.

---

## 6. Identity Search

### `identity.search`
Searches for users or groups in the organization by name or email.
* **Parameters**:
  * `query` (string, **required**): Search query (name, email, etc.).
  * `organization` (string, optional): Organization override.
* **Output**: Array of matched identities containing DisplayName, MailAddress, and ID.

---
## Quick Navigation Sidebar
* [Home](Home)
* [Configuration & Setup](Configuration-and-Setup)
* [Tools Reference](Tools-Reference)
* [Generic REST Client & API Directory](Generic-REST-Client)
* [Testing & Sandbox Setup](Testing-and-Sandbox)
