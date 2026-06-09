// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getCredentialsForProject, addProjectConfig, loadConfig } from './config';
import { DevOpsClient } from './devops';
import { checkAndUpdateDatabase, searchLocalDatabase, fetchSingleApiInfoOnline } from './docs/updater';

const server = new Server(
  {
    name: 'mcp-azure-devops',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Trigger session background update check for default organization/env credentials
const creds = getCredentialsForProject();
if (creds) {
  checkAndUpdateDatabase(creds.organization, creds.pat).catch(() => {});
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Load local DB version to include in descriptions
  const localDb = loadConfig();
  const dbVer = '7.1'; // fallback

  return {
    tools: [
      {
        name: 'configure_connection',
        description: 'Configures Azure DevOps credentials (Username & PAT) for a specific organization/project URL. Must be called first if not configured.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The project or dashboard URL (e.g. https://dev.azure.com/my-org/Test)' },
            username: { type: 'string', description: 'Your username or email' },
            token: { type: 'string', description: 'Your Personal Access Token (PAT)' }
          },
          required: ['url', 'username', 'token']
        }
      },
      {
        name: 'test_connection',
        description: 'Verifies connection to Azure DevOps for a configured organization.',
        inputSchema: {
          type: 'object',
          properties: {
            organization: { type: 'string', description: 'Optional organization name. If omitted, uses the default organization.' }
          }
        }
      },
      {
        name: 'call_api',
        description: `Executes a generic Azure DevOps REST API call. Supports ALL DevOps endpoints. (Default API Version: ${dbVer})`,
        inputSchema: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP Method' },
            path: { type: 'string', description: 'API Path (e.g. /_apis/git/repositories or _apis/wit/workitems/123)' },
            body: { type: 'object', description: 'Optional request body JSON' },
            apiVersion: { type: 'string', description: 'Optional API version override (defaults to 7.1)' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['method', 'path']
        }
      },
      {
        name: 'search_api_docs',
        description: 'Searches the local database of Azure DevOps APIs and parameters to find the correct endpoints offline.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term (e.g., "pull requests", "workitems")' },
            area: { type: 'string', description: 'Optional API area filter (e.g., "wit", "git", "pipelines")' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_api_info',
        description: 'Gets full documentation for a specific Azure DevOps API endpoint. Checks the local database first and falls back to Microsoft specs online.',
        inputSchema: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            path: { type: 'string', description: 'Full API path (e.g., "/_apis/git/repositories")' }
          },
          required: ['method', 'path']
        }
      },
      {
        name: 'get_work_item',
        description: 'Retrieves details for a specific Azure DevOps work item by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Work Item ID' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['id']
        }
      },
      {
        name: 'create_work_item',
        description: 'Creates a new work item (Bug, Task, User Story) in Azure DevOps.',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Work item type (e.g., "Bug", "Task", "User Story")' },
            title: { type: 'string', description: 'Title of the work item' },
            description: { type: 'string', description: 'Description or steps to reproduce (HTML or text)' },
            fields: { type: 'object', description: 'Optional key-value object representing extra fields (e.g., {"System.AssignedTo": "user@email.com"})' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['type', 'title']
        }
      },
      {
        name: 'update_work_item',
        description: 'Updates field values on an existing work item.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Work Item ID' },
            fields: { type: 'object', description: 'Key-value object of fields to update (e.g., {"System.State": "Done", "System.AssignedTo": "user@email.com"})' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['id', 'fields']
        }
      },
      {
        name: 'query_work_items',
        description: 'Searches work items using Work Item Query Language (WIQL) and returns batch details.',
        inputSchema: {
          type: 'object',
          properties: {
            wiql: { type: 'string', description: 'WIQL query string (e.g., "Select [System.Id] From WorkItems Where [System.WorkItemType] = \'Bug\'")' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['wiql']
        }
      },
      {
        name: 'add_work_item_comment',
        description: 'Adds a new discussion comment to a work item.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'Work Item ID' },
            text: { type: 'string', description: 'Comment text' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['id', 'text']
        }
      },
      {
        name: 'link_work_item',
        description: 'Links two work items together using a relation type (e.g., Parent/Child, Duplicate, Related).',
        inputSchema: {
          type: 'object',
          properties: {
            sourceId: { type: 'number', description: 'Source Work Item ID' },
            targetId: { type: 'number', description: 'Target Work Item ID' },
            relationType: { type: 'string', description: 'Relation type (e.g., "System.LinkTypes.Hierarchy-Forward" for Child, "System.LinkTypes.Hierarchy-Reverse" for Parent, "System.LinkTypes.Related" for Related)' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['sourceId', 'targetId', 'relationType']
        }
      },
      {
        name: 'list_repositories',
        description: 'Lists all Git repositories in the configured project.',
        inputSchema: {
          type: 'object',
          properties: {
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          }
        }
      },
      {
        name: 'get_git_file',
        description: 'Reads content of a file from an Azure DevOps Git repository.',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryId: { type: 'string', description: 'Name or ID of the repository' },
            path: { type: 'string', description: 'Path to the file (e.g. "/src/app.ts")' },
            branch: { type: 'string', description: 'Branch name (defaults to "main")' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['repositoryId', 'path']
        }
      },
      {
        name: 'create_git_push',
        description: 'Pushes file changes (adds, modifications, deletes) directly to a repository branch.',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryId: { type: 'string', description: 'Name or ID of the repository' },
            branchName: { type: 'string', description: 'Target branch name' },
            commitMessage: { type: 'string', description: 'Commit message' },
            changes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  changeType: { type: 'string', enum: ['add', 'edit', 'delete'] },
                  path: { type: 'string', description: 'File path in repo (e.g. "/newfile.txt")' },
                  content: { type: 'string', description: 'File content (required for add/edit)' }
                },
                required: ['changeType', 'path']
              }
            },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['repositoryId', 'branchName', 'commitMessage', 'changes']
        }
      },
      {
        name: 'create_pull_request',
        description: 'Creates a Pull Request in a Git repository.',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryId: { type: 'string', description: 'Name or ID of the repository' },
            sourceBranch: { type: 'string', description: 'Source branch (e.g., "feature-branch")' },
            targetBranch: { type: 'string', description: 'Target branch (e.g., "main")' },
            title: { type: 'string', description: 'PR Title' },
            description: { type: 'string', description: 'PR Description' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['repositoryId', 'sourceBranch', 'targetBranch', 'title']
        }
      },
      {
        name: 'get_pull_request',
        description: 'Gets details and status of a Pull Request.',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryId: { type: 'string', description: 'Name or ID of the repository' },
            pullRequestId: { type: 'number', description: 'PR ID' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['repositoryId', 'pullRequestId']
        }
      },
      {
        name: 'update_pull_request',
        description: 'Updates a Pull Request status (active, abandoned, completed).',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryId: { type: 'string', description: 'Name or ID of the repository' },
            pullRequestId: { type: 'number', description: 'PR ID' },
            status: { type: 'string', enum: ['active', 'abandoned', 'completed'], description: 'Target status' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['repositoryId', 'pullRequestId', 'status']
        }
      },
      {
        name: 'create_pull_request_thread',
        description: 'Creates an inline code review comment thread on a file and line number in a PR.',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryId: { type: 'string', description: 'Name or ID of the repository' },
            pullRequestId: { type: 'number', description: 'PR ID' },
            filePath: { type: 'string', description: 'File path in the repo' },
            line: { type: 'number', description: 'Line number' },
            content: { type: 'string', description: 'Comment content' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['repositoryId', 'pullRequestId', 'filePath', 'line', 'content']
        }
      },
      {
        name: 'list_pull_request_threads',
        description: 'Retrieves all threads and comments on a PR.',
        inputSchema: {
          type: 'object',
          properties: {
            repositoryId: { type: 'string', description: 'Name or ID of the repository' },
            pullRequestId: { type: 'number', description: 'PR ID' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['repositoryId', 'pullRequestId']
        }
      },
      {
        name: 'run_pipeline',
        description: 'Triggers a run of a pipeline.',
        inputSchema: {
          type: 'object',
          properties: {
            pipelineId: { type: 'number', description: 'Pipeline ID' },
            variables: { type: 'object', description: 'Optional run-time variables key-value object' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['pipelineId']
        }
      },
      {
        name: 'get_pipeline_run',
        description: 'Retrieves status of a pipeline run.',
        inputSchema: {
          type: 'object',
          properties: {
            pipelineId: { type: 'number', description: 'Pipeline ID' },
            runId: { type: 'number', description: 'Run ID' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['pipelineId', 'runId']
        }
      },
      {
        name: 'get_pipeline_run_logs',
        description: 'Retrieves combined log content for a pipeline run.',
        inputSchema: {
          type: 'object',
          properties: {
            pipelineId: { type: 'number', description: 'Pipeline ID' },
            runId: { type: 'number', description: 'Run ID' },
            organization: { type: 'string', description: 'Optional organization override' },
            project: { type: 'string', description: 'Optional project override' }
          },
          required: ['pipelineId', 'runId']
        }
      },
      {
        name: 'search_identities',
        description: 'Searches for users or groups in the organization by name or email.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (name, email, etc.)' },
            organization: { type: 'string', description: 'Optional organization override' }
          },
          required: ['query']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const anyArgs = (args || {}) as any;

  // 1. Handle configure_connection separately (does not require existing configuration)
  if (name === 'configure_connection') {
    try {
      const { url, username, token } = anyArgs;
      const parsed = addProjectConfig(url, username, token);
      
      // Perform background version check post-config
      checkAndUpdateDatabase(parsed.organization, token).catch(() => {});
      
      return {
        content: [{
          type: 'text',
          text: `Successfully configured and saved credentials for organization: "${parsed.organization}"` +
                (parsed.project ? `, project: "${parsed.project}"` : '')
        }]
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Configuration failed: ${e.message}` }]
      };
    }
  }

  // 2. Handle search_api_docs separately (offline database lookup)
  if (name === 'search_api_docs') {
    try {
      const results = searchLocalDatabase(anyArgs.query, anyArgs.area);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }]
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Search failed: ${e.message}` }]
      };
    }
  }

  // 3. Handle get_api_info separately (local + online fallback spec lookup)
  if (name === 'get_api_info') {
    try {
      const { method, path: pathStr } = anyArgs;
      // Search local first
      const localResults = searchLocalDatabase(pathStr);
      const exactMatch = localResults.find(r => r.method.toLowerCase() === method.toLowerCase());
      
      if (exactMatch) {
        return {
          content: [{ type: 'text', text: JSON.stringify(exactMatch, null, 2) }]
        };
      }

      // Fallback to online github fetch
      // Retrieve the current configured version
      const dbContent = searchLocalDatabase(''); // returns all
      const dbVersion = dbContent.length > 0 ? dbContent[0].version : '7.1';
      
      const onlineMatch = await fetchSingleApiInfoOnline(method, pathStr, dbVersion);
      if (onlineMatch) {
        return {
          content: [{ type: 'text', text: JSON.stringify(onlineMatch, null, 2) }]
        };
      }

      return {
        isError: true,
        content: [{ type: 'text', text: `Could not find API documentation for ${method} ${pathStr} locally or on Microsoft github repository.` }]
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to retrieve API info: ${e.message}` }]
      };
    }
  }

  // 4. Resolve credentials for all other tools
  const targetProject = anyArgs.project;
  const targetOrg = anyArgs.organization;
  const creds = getCredentialsForProject(targetProject, targetOrg);

  if (!creds) {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: 'Azure DevOps is not configured. Please use the configure_connection tool first to save your project URL, username, and Personal Access Token (PAT).'
      }]
    };
  }

  const client = new DevOpsClient(creds.organization, creds.project, creds.username, creds.pat);

  // 5. Route tool execution
  try {
    switch (name) {
      case 'test_connection': {
        const areas = await client.getResourceAreas();
        // Warn if server has newer API version
        const gitArea = areas.find((a: any) => a.name === 'git');
        const remoteVersion = gitArea ? (gitArea.releasedVersion || gitArea.maxVersion || '7.1') : '7.1';
        const isNewer = parseFloat(remoteVersion) > 7.1;

        return {
          content: [{
            type: 'text',
            text: `Connection SUCCESS!\nAuthorized User: ${creds.username}\nOrganization: ${creds.organization}\n` +
                  (creds.project ? `Project: ${creds.project}\n` : '') +
                  `Server API Version: ${remoteVersion}` +
                  (isNewer ? `\n[WARNING] Azure DevOps supports a newer API version (${remoteVersion}) than the MCP implementation (7.1).` : '')
          }]
        };
      }

      case 'call_api': {
        const res = await client.request({
          url: anyArgs.path,
          method: anyArgs.method,
          data: anyArgs.body,
          params: anyArgs.apiVersion ? { 'api-version': anyArgs.apiVersion } : { 'api-version': '7.1' }
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }]
        };
      }

      case 'get_work_item': {
        const item = await client.getWorkItem(anyArgs.id);
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }

      case 'create_work_item': {
        const item = await client.createWorkItem(anyArgs.type, anyArgs.title, anyArgs.description, anyArgs.fields);
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }

      case 'update_work_item': {
        const item = await client.updateWorkItem(anyArgs.id, anyArgs.fields);
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }

      case 'query_work_items': {
        const items = await client.queryWorkItems(anyArgs.wiql);
        return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
      }

      case 'add_work_item_comment': {
        const comment = await client.addWorkItemComment(anyArgs.id, anyArgs.text);
        return { content: [{ type: 'text', text: JSON.stringify(comment, null, 2) }] };
      }

      case 'link_work_item': {
        const result = await client.linkWorkItems(anyArgs.sourceId, anyArgs.targetId, anyArgs.relationType);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'list_repositories': {
        const repos = await client.listRepositories();
        return { content: [{ type: 'text', text: JSON.stringify(repos, null, 2) }] };
      }

      case 'get_git_file': {
        const fileContent = await client.getGitFile(anyArgs.repositoryId, anyArgs.path, anyArgs.branch);
        return { content: [{ type: 'text', text: fileContent }] };
      }

      case 'create_git_push': {
        const pushResult = await client.createGitPush(
          anyArgs.repositoryId,
          anyArgs.branchName,
          anyArgs.commitMessage,
          anyArgs.changes
        );
        return { content: [{ type: 'text', text: JSON.stringify(pushResult, null, 2) }] };
      }

      case 'create_pull_request': {
        const pr = await client.createPullRequest(
          anyArgs.repositoryId,
          anyArgs.sourceBranch,
          anyArgs.targetBranch,
          anyArgs.title,
          anyArgs.description
        );
        return { content: [{ type: 'text', text: JSON.stringify(pr, null, 2) }] };
      }

      case 'get_pull_request': {
        const pr = await client.getPullRequest(anyArgs.repositoryId, anyArgs.pullRequestId);
        return { content: [{ type: 'text', text: JSON.stringify(pr, null, 2) }] };
      }

      case 'update_pull_request': {
        const pr = await client.updatePullRequest(anyArgs.repositoryId, anyArgs.pullRequestId, anyArgs.status);
        return { content: [{ type: 'text', text: JSON.stringify(pr, null, 2) }] };
      }

      case 'create_pull_request_thread': {
        const thread = await client.createPullRequestThread(
          anyArgs.repositoryId,
          anyArgs.pullRequestId,
          anyArgs.filePath,
          anyArgs.line,
          anyArgs.content
        );
        return { content: [{ type: 'text', text: JSON.stringify(thread, null, 2) }] };
      }

      case 'list_pull_request_threads': {
        const threads = await client.listPullRequestThreads(anyArgs.repositoryId, anyArgs.pullRequestId);
        return { content: [{ type: 'text', text: JSON.stringify(threads, null, 2) }] };
      }

      case 'run_pipeline': {
        const run = await client.runPipeline(anyArgs.pipelineId, anyArgs.variables);
        return { content: [{ type: 'text', text: JSON.stringify(run, null, 2) }] };
      }

      case 'get_pipeline_run': {
        const run = await client.getPipelineRun(anyArgs.pipelineId, anyArgs.runId);
        return { content: [{ type: 'text', text: JSON.stringify(run, null, 2) }] };
      }

      case 'get_pipeline_run_logs': {
        const logs = await client.getPipelineRunLogs(anyArgs.pipelineId, anyArgs.runId);
        return { content: [{ type: 'text', text: logs }] };
      }

      case 'search_identities': {
        const results = await client.searchIdentities(anyArgs.query);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      default:
        throw new Error(`Tool not found: ${name}`);
    }
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: err.message }]
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Azure DevOps MCP Server] Server running on stdio transport.');
}

main().catch(err => {
  console.error('[CRITICAL] Server startup error:', err);
  process.exit(1);
});
