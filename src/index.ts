// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getCredentialsForProject, addProjectConfig, loadConfig } from './config';
import { DevOpsClient } from './devops';
import { checkAndUpdateDatabase, searchLocalDatabase, fetchSingleApiInfoOnline } from './docs/updater';
import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';

// Global error handlers to capture and log any hidden startup exceptions
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err.stack || err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const TOOLS = [
  {
    name: 'connection.configure',
    description: 'Configures Azure DevOps credentials (Username & PAT) for a specific organization/project URL. Must be called first if not configured.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The project or dashboard URL (e.g. https://dev.azure.com/my-org/Test)' },
        username: { type: 'string', description: 'Your username or email' },
        token: { type: 'string', description: 'Your Personal Access Token (PAT)' }
      },
      required: ['url', 'username', 'token']
    },
    outputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Confirmation message of the configuration success' }
      },
      required: ['message']
    },
    annotations: {
      title: 'Configure Connection',
      idempotentHint: true
    }
  },
  {
    name: 'connection.test',
    description: 'Verifies connection to Azure DevOps for a configured organization.',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Optional organization name. If omitted, uses the default organization.' }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Connection status (e.g. SUCCESS)' },
        message: { type: 'string', description: 'Detailed success message with authorized user and API version' }
      },
      required: ['status', 'message']
    },
    annotations: {
      title: 'Test Connection',
      idempotentHint: true
    }
  },
  {
    name: 'api.call',
    description: 'Executes a generic Azure DevOps REST API call. Supports ALL DevOps endpoints. (Default API Version: 7.1)',
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
    },
    outputSchema: {
      type: 'object',
      description: 'The raw JSON response from the Azure DevOps API'
    },
    annotations: {
      title: 'Call API'
    }
  },
  {
    name: 'api.docs',
    description: 'Searches the local database of Azure DevOps APIs and parameters to find the correct endpoints offline.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (e.g., "pull requests", "workitems")' },
        area: { type: 'string', description: 'Optional API area filter (e.g., "wit", "git", "pipelines")' }
      },
      required: ['query']
    },
    outputSchema: {
      type: 'object',
      properties: {
        endpoints: {
          type: 'array',
          description: 'List of matching API endpoints with description, parameters, and template URL',
          items: { type: 'object' }
        }
      },
      required: ['endpoints']
    },
    annotations: {
      title: 'Search API Documentation',
      readOnlyHint: true,
      idempotentHint: true
    }
  },
  {
    name: 'api.info',
    description: 'Gets full documentation for a specific Azure DevOps API endpoint. Checks the local database first and falls back to Microsoft specs online.',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method of the API endpoint' },
        path: { type: 'string', description: 'Full API path (e.g., "/_apis/git/repositories")' }
      },
      required: ['method', 'path']
    },
    outputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', description: 'HTTP method' },
        path: { type: 'string', description: 'API path template' },
        description: { type: 'string', description: 'Description of the endpoint' },
        parameters: { type: 'array', description: 'List of path, query, and body parameters' }
      },
      required: ['method', 'path']
    },
    annotations: {
      title: 'Get API Info',
      readOnlyHint: true,
      idempotentHint: true
    }
  },
  {
    name: 'workitem.get',
    description: 'Retrieves details for a specific Azure DevOps work item by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Work Item ID' },
        organization: { type: 'string', description: 'Optional organization override' },
        project: { type: 'string', description: 'Optional project override' }
      },
      required: ['id']
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The work item ID' },
        fields: { type: 'object', description: 'Key-value pairs of all work item fields' }
      },
      required: ['id', 'fields']
    },
    annotations: {
      title: 'Get Work Item',
      readOnlyHint: true,
      idempotentHint: true
    }
  },
  {
    name: 'workitem.create',
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
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The newly created work item ID' },
        fields: { type: 'object', description: 'Key-value pairs of the work item fields' }
      },
      required: ['id']
    },
    annotations: {
      title: 'Create Work Item'
    }
  },
  {
    name: 'workitem.update',
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
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The updated work item ID' },
        fields: { type: 'object', description: 'Key-value pairs of the updated fields' }
      },
      required: ['id']
    },
    annotations: {
      title: 'Update Work Item'
    }
  },
  {
    name: 'workitem.query',
    description: 'Searches work items using Work Item Query Language (WIQL) and returns batch details.',
    inputSchema: {
      type: 'object',
      properties: {
        wiql: { type: 'string', description: 'WIQL query string (e.g., "Select [System.Id] From WorkItems Where [System.WorkItemType] = \'Bug\'")' },
        organization: { type: 'string', description: 'Optional organization override' },
        project: { type: 'string', description: 'Optional project override' }
      },
      required: ['wiql']
    },
    outputSchema: {
      type: 'object',
      properties: {
        workItems: {
          type: 'array',
          description: 'List of matching work items with their fields and IDs',
          items: { type: 'object' }
        }
      },
      required: ['workItems']
    },
    annotations: {
      title: 'Query Work Items',
      readOnlyHint: true,
      idempotentHint: true
    }
  },
  {
    name: 'workitem.comment',
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
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The comment ID' },
        text: { type: 'string', description: 'The comment content' }
      }
    },
    annotations: {
      title: 'Add Work Item Comment'
    }
  },
  {
    name: 'workitem.link',
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
    },
    outputSchema: {
      type: 'object',
      description: 'JSON response containing the updated work item relations'
    },
    annotations: {
      title: 'Link Work Items'
    }
  },
  {
    name: 'git.repos',
    description: 'Lists all Git repositories in the configured project.',
    inputSchema: {
      type: 'object',
      properties: {
        organization: { type: 'string', description: 'Optional organization override' },
        project: { type: 'string', description: 'Optional project override' }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        repositories: {
          type: 'array',
          description: 'List of repositories in the project',
          items: { type: 'object' }
        }
      },
      required: ['repositories']
    },
    annotations: {
      title: 'List Repositories',
      readOnlyHint: true,
      idempotentHint: true
    }
  },
  {
    name: 'git.file',
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
    },
    outputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The raw file content text' }
      },
      required: ['content']
    },
    annotations: {
      title: 'Get Git File',
      readOnlyHint: true,
      idempotentHint: true
    }
  },
  {
    name: 'git.push',
    description: 'Pushes file changes (adds, modifications, deletes) directly to a repository branch.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: { type: 'string', description: 'Name or ID of the repository' },
        branchName: { type: 'string', description: 'Target branch name' },
        commitMessage: { type: 'string', description: 'Commit message' },
        changes: {
          type: 'array',
          description: 'Array of file changes to apply in this commit',
          items: {
            type: 'object',
            properties: {
              changeType: { type: 'string', enum: ['add', 'edit', 'delete'], description: 'Type of change: add, edit, or delete' },
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
    },
    outputSchema: {
      type: 'object',
      description: 'JSON response from the git push operation'
    },
    annotations: {
      title: 'Create Git Push'
    }
  },
  {
    name: 'git.pr.create',
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
    },
    outputSchema: {
      type: 'object',
      description: 'JSON response of the newly created pull request'
    },
    annotations: {
      title: 'Create Pull Request'
    }
  },
  {
    name: 'git.pr.get',
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
    },
    outputSchema: {
      type: 'object',
      description: 'JSON response of the pull request details'
    },
    annotations: {
      title: 'Get Pull Request',
      readOnlyHint: true,
      idempotentHint: true
    }
  },
  {
    name: 'git.pr.update',
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
    },
    outputSchema: {
      type: 'object',
      description: 'JSON response of the updated pull request'
    },
    annotations: {
      title: 'Update Pull Request'
    }
  },
  {
    name: 'git.pr.comment.create',
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
    },
    outputSchema: {
      type: 'object',
      description: 'JSON response of the newly created thread and comments'
    },
    annotations: {
      title: 'Create Pull Request Thread'
    }
  },
  {
    name: 'git.pr.comment.list',
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
    },
    outputSchema: {
      type: 'object',
      properties: {
        threads: {
          type: 'array',
          description: 'List of PR comment threads',
          items: { type: 'object' }
        }
      },
      required: ['threads']
    },
    annotations: {
      title: 'List Pull Request Threads',
      readOnlyHint: true,
      idempotentHint: true
    }
  },
  {
    name: 'pipeline.run',
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
    },
    outputSchema: {
      type: 'object',
      description: 'JSON response of the newly started run'
    },
    annotations: {
      title: 'Run Pipeline'
    }
  },
  {
    name: 'pipeline.get',
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
    },
    outputSchema: {
      type: 'object',
      description: 'JSON response of the run status details'
    },
    annotations: {
      title: 'Get Pipeline Run',
      readOnlyHint: true,
      idempotentHint: true
    }
  },
  {
    name: 'pipeline.logs',
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
    },
    outputSchema: {
      type: 'object',
      properties: {
        logs: { type: 'string', description: 'The pipeline run log contents' }
      },
      required: ['logs']
    },
    annotations: {
      title: 'Get Pipeline Run Logs',
      readOnlyHint: true,
      idempotentHint: true
    }
  },
  {
    name: 'identity.search',
    description: 'Searches for users or groups in the organization by name or email.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (name, email, etc.)' },
        organization: { type: 'string', description: 'Optional organization override' }
      },
      required: ['query']
    },
    outputSchema: {
      type: 'object',
      properties: {
        identities: {
          type: 'array',
          description: 'List of matching identities',
          items: { type: 'object' }
        }
      },
      required: ['identities']
    },
    annotations: {
      title: 'Search Identities',
      readOnlyHint: true,
      idempotentHint: true
    }
  }
];

const handleListTools = async () => {
  return {
    tools: TOOLS
  };
};

const handleCallTool = async (request: any) => {
  const { name, arguments: args } = request.params;
  const anyArgs = (args || {}) as any;

  // 1. Handle configure_connection separately (does not require existing configuration)
  if (name === 'connection.configure') {
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
  if (name === 'api.docs.search') {
    try {
      const results = searchLocalDatabase(anyArgs.query, anyArgs.area);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ endpoints: results }, null, 2)
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
  if (name === 'api.info.get') {
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
      case 'connection.test': {
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

      case 'api.call': {
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

      case 'workitem.get': {
        const item = await client.getWorkItem(anyArgs.id);
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }

      case 'workitem.create': {
        const item = await client.createWorkItem(anyArgs.type, anyArgs.title, anyArgs.description, anyArgs.fields);
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }

      case 'workitem.update': {
        const item = await client.updateWorkItem(anyArgs.id, anyArgs.fields);
        return { content: [{ type: 'text', text: JSON.stringify(item, null, 2) }] };
      }

      case 'workitem.query': {
        const items = await client.queryWorkItems(anyArgs.wiql);
        return { content: [{ type: 'text', text: JSON.stringify({ workItems: items }, null, 2) }] };
      }

      case 'workitem.comment': {
        const comment = await client.addWorkItemComment(anyArgs.id, anyArgs.text);
        return { content: [{ type: 'text', text: JSON.stringify(comment, null, 2) }] };
      }

      case 'workitem.link': {
        const result = await client.linkWorkItems(anyArgs.sourceId, anyArgs.targetId, anyArgs.relationType);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'git.repos': {
        const repos = await client.listRepositories();
        return { content: [{ type: 'text', text: JSON.stringify({ repositories: repos }, null, 2) }] };
      }

      case 'git.file': {
        const fileContent = await client.getGitFile(anyArgs.repositoryId, anyArgs.path, anyArgs.branch);
        return { content: [{ type: 'text', text: fileContent }] };
      }

      case 'git.push': {
        const pushResult = await client.createGitPush(
          anyArgs.repositoryId,
          anyArgs.branchName,
          anyArgs.commitMessage,
          anyArgs.changes
        );
        return { content: [{ type: 'text', text: JSON.stringify(pushResult, null, 2) }] };
      }

      case 'git.pr.create': {
        const pr = await client.createPullRequest(
          anyArgs.repositoryId,
          anyArgs.sourceBranch,
          anyArgs.targetBranch,
          anyArgs.title,
          anyArgs.description
        );
        return { content: [{ type: 'text', text: JSON.stringify(pr, null, 2) }] };
      }

      case 'git.pr.get': {
        const pr = await client.getPullRequest(anyArgs.repositoryId, anyArgs.pullRequestId);
        return { content: [{ type: 'text', text: JSON.stringify(pr, null, 2) }] };
      }

      case 'git.pr.update': {
        const pr = await client.updatePullRequest(anyArgs.repositoryId, anyArgs.pullRequestId, anyArgs.status);
        return { content: [{ type: 'text', text: JSON.stringify(pr, null, 2) }] };
      }

      case 'git.pr.comment.create': {
        const thread = await client.createPullRequestThread(
          anyArgs.repositoryId,
          anyArgs.pullRequestId,
          anyArgs.filePath,
          anyArgs.line,
          anyArgs.content
        );
        return { content: [{ type: 'text', text: JSON.stringify(thread, null, 2) }] };
      }

      case 'git.pr.comment.list': {
        const threads = await client.listPullRequestThreads(anyArgs.repositoryId, anyArgs.pullRequestId);
        return { content: [{ type: 'text', text: JSON.stringify({ threads }, null, 2) }] };
      }

      case 'pipeline.run': {
        const run = await client.runPipeline(anyArgs.pipelineId, anyArgs.variables);
        return { content: [{ type: 'text', text: JSON.stringify(run, null, 2) }] };
      }

      case 'pipeline.get': {
        const run = await client.getPipelineRun(anyArgs.pipelineId, anyArgs.runId);
        return { content: [{ type: 'text', text: JSON.stringify(run, null, 2) }] };
      }

      case 'pipeline.logs': {
        const logs = await client.getPipelineRunLogs(anyArgs.pipelineId, anyArgs.runId);
        return { content: [{ type: 'text', text: logs }] };
      }

      case 'identity.search': {
        const results = await client.searchIdentities(anyArgs.query);
        return { content: [{ type: 'text', text: JSON.stringify({ identities: results }, null, 2) }] };
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
};

function createServer(): Server {
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
  server.setRequestHandler(ListToolsRequestSchema, handleListTools);
  server.setRequestHandler(CallToolRequestSchema, handleCallTool);
  return server;
}

async function main() {
  const args = process.argv;
  const getArgValue = (flag: string) => {
    const idx = args.indexOf(flag);
    return (idx !== -1 && idx < args.length - 1) ? args[idx + 1] : undefined;
  };
  const argPort = getArgValue('--port');
  const portStr = process.env.PORT || argPort;

  if (portStr) {
    const port = parseInt(portStr, 10);
    const transports = new Map<string, { transport: SSEServerTransport; server: Server }>();

    const httpServer = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url || '', true);
      const pathname = parsedUrl.pathname;

      // Establish SSE connection
      if (req.method === 'GET' && (pathname === '/sse' || (pathname === '/' && req.headers.accept === 'text/event-stream'))) {
        const transport = new SSEServerTransport('/messages', res);
        const serverInstance = createServer();
        transports.set(transport.sessionId, { transport, server: serverInstance });
        
        res.on('close', () => {
          transports.delete(transport.sessionId);
        });

        await serverInstance.connect(transport);
        return;
      }

      // Handle client incoming messages
      if (req.method === 'POST' && pathname === '/messages') {
        const sessionId = parsedUrl.query.sessionId as string;
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing sessionId parameter');
          return;
        }

        const session = transports.get(sessionId);
        if (!session) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Session not found');
          return;
        }

        let bodyStr = '';
        req.on('data', chunk => {
          bodyStr += chunk;
        });
        req.on('end', async () => {
          try {
            const body = JSON.parse(bodyStr);
            await session.transport.handlePostMessage(req, res, body);
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end(`Invalid JSON body: ${err.message}`);
          }
        });
        return;
      }

      // Serve well-known server card to skip dynamic scanning
      if (req.method === 'GET' && (pathname === '/.well-known/mcp/server-card.json' || pathname === '/.well-known/mcp.json')) {
        const filePath = path.join(__dirname, '..', '.well-known', 'mcp', 'server-card.json');
        fs.readFile(filePath, 'utf8', (err, data) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Internal Server Error: ${err.message}`);
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(data);
        });
        return;
      }

      // Simple health check
      if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    httpServer.listen(port, '0.0.0.0', () => {
      console.error(`[Azure DevOps MCP Server] Server running on SSE transport listening on port ${port}.`);
    });
  } else {
    const serverInstance = createServer();
    const transport = new StdioServerTransport();
    await serverInstance.connect(transport);
    console.error('[Azure DevOps MCP Server] Server running on stdio transport.');
  }
}

main().catch(err => {
  console.error('[CRITICAL] Server startup error:', err);
  process.exit(1);
});
