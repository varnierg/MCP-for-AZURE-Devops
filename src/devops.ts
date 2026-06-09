// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

export class DevOpsClient {
  private organization: string;
  private project: string;
  private username: string;
  private pat: string;

  constructor(organization: string, project: string, username: string, pat: string) {
    this.organization = organization;
    this.project = project;
    this.username = username;
    this.pat = pat;
  }

  private getAuthHeader(): string {
    const token = Buffer.from(`${this.username}:${this.pat}`).toString('base64');
    return `Basic ${token}`;
  }

  /**
   * Helper to perform raw HTTP requests to Azure DevOps
   */
  public async request(config: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    const headers = {
      Authorization: this.getAuthHeader(),
      Accept: 'application/json',
      ...config.headers
    };

    const urlHost = config.url?.startsWith('http') 
      ? config.url 
      : `https://dev.azure.com/${this.organization}/${this.project ? `${this.project}/` : ''}${config.url?.replace(/^\//, '')}`;

    const finalConfig: AxiosRequestConfig = {
      ...config,
      url: urlHost,
      headers
    };

    try {
      return await axios(finalConfig);
    } catch (error: any) {
      this.handleError(error, config);
      throw error;
    }
  }

  private handleError(error: any, config: AxiosRequestConfig): void {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const message = data?.message || error.message;

      // Handle Read-Only or Write-Only credential errors (401 / 403)
      if (status === 401 || status === 403) {
        const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method?.toUpperCase() || '');
        if (isWriteOperation) {
          throw new Error(
            `[PERMISSION ERROR] Azure DevOps API returned HTTP ${status}: ${message}\n` +
            `Rationale: The configured Personal Access Token (PAT) does not have write permissions for this resource.\n` +
            `Action Required: Please provide a token with read/write access (e.g. 'vso.code_write' or 'vso.work_write') using the configure_connection tool.`
          );
        } else {
          throw new Error(
            `[AUTHENTICATION ERROR] Azure DevOps API returned HTTP ${status}: ${message}\n` +
            `Rationale: The credentials could be expired, revoked, or lack read permission.\n` +
            `Action Required: Please check your username and PAT, and reconfigure if necessary.`
          );
        }
      }
      throw new Error(`Azure DevOps API error (HTTP ${status}): ${message}`);
    }
    throw error;
  }

  /**
   * Retrieves resources areas to discover remote API version
   */
  public async getResourceAreas(): Promise<any[]> {
    const res = await this.request({
      url: `https://dev.azure.com/${this.organization}/_apis/resourceAreas`,
      method: 'GET',
      params: { 'api-version': '7.1-preview.1' }
    });
    return res.data.value || [];
  }

  // ==========================================
  // Work Item Helpers
  // ==========================================

  public async getWorkItem(id: number): Promise<any> {
    const res = await this.request({
      url: `_apis/wit/workitems/${id}`,
      method: 'GET',
      params: { 'api-version': '7.1' }
    });
    return res.data;
  }

  public async createWorkItem(type: string, title: string, description?: string, extraFields?: Record<string, any>): Promise<any> {
    const patch = [
      { op: 'add', path: '/fields/System.Title', value: title }
    ];

    if (description) {
      // Description field is different depending on work item type (System.Description vs Microsoft.VSTS.TCM.Steps, etc.)
      const descField = type.toLowerCase() === 'bug' ? 'System.Description' : 'System.Description';
      patch.push({ op: 'add', path: `/fields/${descField}`, value: description });
    }

    if (extraFields) {
      for (const [key, value] of Object.entries(extraFields)) {
        patch.push({ op: 'add', path: `/fields/${key}`, value });
      }
    }

    const res = await this.request({
      url: `_apis/wit/workitems/$${type}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json-patch+json' },
      params: { 'api-version': '7.1' },
      data: patch
    });
    return res.data;
  }

  public async updateWorkItem(id: number, fields: Record<string, any>): Promise<any> {
    const patch = Object.entries(fields).map(([key, value]) => ({
      op: 'add',
      path: `/fields/${key}`,
      value
    }));

    const res = await this.request({
      url: `_apis/wit/workitems/${id}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json-patch+json' },
      params: { 'api-version': '7.1' },
      data: patch
    });
    return res.data;
  }

  public async queryWorkItems(wiql: string): Promise<any[]> {
    const res = await this.request({
      url: `_apis/wit/wiql`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      params: { 'api-version': '7.1' },
      data: { query: wiql }
    });

    const workItems = res.data.workItems || [];
    if (workItems.length === 0) return [];

    // Fetch details of all returned work items (batch fetch)
    const ids = workItems.map((w: any) => w.id).join(',');
    const detailsRes = await this.request({
      url: `_apis/wit/workitems`,
      method: 'GET',
      params: {
        ids,
        fields: 'System.Id,System.Title,System.State,System.WorkItemType,System.AssignedTo',
        'api-version': '7.1'
      }
    });

    return detailsRes.data.value || [];
  }

  public async addWorkItemComment(id: number, text: string): Promise<any> {
    const res = await this.request({
      url: `_apis/wit/workitems/${id}/comments`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      params: { 'api-version': '7.1-preview.3' },
      data: { text }
    });
    return res.data;
  }

  public async linkWorkItems(sourceId: number, targetId: number, relationType: string): Promise<any> {
    const patch = [
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: relationType,
          url: `https://dev.azure.com/${this.organization}/${this.project}/_apis/wit/workItems/${targetId}`
        }
      }
    ];

    const res = await this.request({
      url: `_apis/wit/workitems/${sourceId}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json-patch+json' },
      params: { 'api-version': '7.1' },
      data: patch
    });
    return res.data;
  }

  // ==========================================
  // Git Helpers
  // ==========================================

  public async listRepositories(): Promise<any[]> {
    const res = await this.request({
      url: `_apis/git/repositories`,
      method: 'GET',
      params: { 'api-version': '7.1' }
    });
    return res.data.value || [];
  }

  public async getGitFile(repositoryId: string, filePath: string, branch: string = 'main'): Promise<string> {
    const res = await this.request({
      url: `_apis/git/repositories/${repositoryId}/items`,
      method: 'GET',
      params: {
        path: filePath,
        'versionDescriptor.version': branch,
        includeContent: 'true',
        'api-version': '7.1'
      }
    });
    return typeof res.data === 'object' ? JSON.stringify(res.data, null, 2) : String(res.data);
  }

  public async createGitPush(
    repositoryId: string,
    branchName: string,
    commitMessage: string,
    changes: Array<{ changeType: 'add' | 'edit' | 'delete'; path: string; content?: string }>
  ): Promise<any> {
    // 1. Get the current commit SHA (oldObjectId) of the branch.
    let oldObjectId = '0000000000000000000000000000000000000000';
    try {
      const refRes = await this.request({
        url: `_apis/git/repositories/${repositoryId}/refs`,
        method: 'GET',
        params: {
          filter: `heads/${branchName}`,
          'api-version': '7.1'
        }
      });
      const refs = refRes.data.value || [];
      if (refs.length > 0) {
        oldObjectId = refs[0].objectId;
      }
    } catch (e) {
      // If ref doesn't exist, we assume it's a new branch
    }

    // 2. Build the push payload
    const formattedChanges = changes.map(c => {
      const change: any = {
        changeType: c.changeType,
        item: { path: c.path }
      };
      if (c.changeType !== 'delete' && c.content !== undefined) {
        change.newContent = {
          content: c.content,
          contentType: 'rawtext'
        };
      }
      return change;
    });

    const payload = {
      refUpdates: [
        {
          name: `refs/heads/${branchName}`,
          oldObjectId
        }
      ],
      commits: [
        {
          comment: commitMessage,
          changes: formattedChanges
        }
      ]
    };

    const res = await this.request({
      url: `_apis/git/repositories/${repositoryId}/pushes`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      params: { 'api-version': '7.1' },
      data: payload
    });

    return res.data;
  }

  public async createPullRequest(
    repositoryId: string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string
  ): Promise<any> {
    const res = await this.request({
      url: `_apis/git/repositories/${repositoryId}/pullrequests`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      params: { 'api-version': '7.1' },
      data: {
        sourceRefName: sourceBranch.startsWith('refs/') ? sourceBranch : `refs/heads/${sourceBranch}`,
        targetRefName: targetBranch.startsWith('refs/') ? targetBranch : `refs/heads/${targetBranch}`,
        title,
        description
      }
    });
    return res.data;
  }

  public async getPullRequest(repositoryId: string, pullRequestId: number): Promise<any> {
    const res = await this.request({
      url: `_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}`,
      method: 'GET',
      params: { 'api-version': '7.1' }
    });
    return res.data;
  }

  public async updatePullRequest(
    repositoryId: string,
    pullRequestId: number,
    status: 'active' | 'abandoned' | 'completed',
    reviewerVote?: number
  ): Promise<any> {
    const payload: any = { status };
    
    const res = await this.request({
      url: `_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      params: { 'api-version': '7.1' },
      data: payload
    });
    return res.data;
  }

  public async createPullRequestThread(
    repositoryId: string,
    pullRequestId: number,
    filePath: string,
    line: number,
    content: string
  ): Promise<any> {
    const payload = {
      comments: [
        {
          parentCommentId: 0,
          content: content,
          commentType: 1 // text comment
        }
      ],
      status: 1, // Active
      threadContext: {
        filePath: filePath,
        rightFileStart: { line: line, character: 1 },
        rightFileEnd: { line: line, character: 100 }
      }
    };

    const res = await this.request({
      url: `_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      params: { 'api-version': '7.1' },
      data: payload
    });
    return res.data;
  }

  public async listPullRequestThreads(repositoryId: string, pullRequestId: number): Promise<any[]> {
    const res = await this.request({
      url: `_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads`,
      method: 'GET',
      params: { 'api-version': '7.1' }
    });
    return res.data.value || [];
  }

  // ==========================================
  // Pipeline Helpers
  // ==========================================

  public async runPipeline(pipelineId: number, variables: Record<string, any> = {}): Promise<any> {
    const formattedVariables: Record<string, any> = {};
    for (const [key, value] of Object.entries(variables)) {
      formattedVariables[key] = { value };
    }

    const res = await this.request({
      url: `_apis/pipelines/${pipelineId}/runs`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      params: { 'api-version': '7.1-preview.1' },
      data: { variables: formattedVariables }
    });
    return res.data;
  }

  public async getPipelineRun(pipelineId: number, runId: number): Promise<any> {
    const res = await this.request({
      url: `_apis/pipelines/${pipelineId}/runs/${runId}`,
      method: 'GET',
      params: { 'api-version': '7.1-preview.1' }
    });
    return res.data;
  }

  public async getPipelineRunLogs(pipelineId: number, runId: number): Promise<string> {
    // 1. Get run metadata to list log sections
    const runRes = await this.request({
      url: `_apis/pipelines/${pipelineId}/runs/${runId}/logs`,
      method: 'GET',
      params: { 'api-version': '7.1-preview.1' }
    });

    const logs = runRes.data.logs || [];
    if (logs.length === 0) {
      return 'No logs found for this pipeline run.';
    }

    // 2. Fetch log contents (combine all logs)
    let combinedLogs = '';
    for (const log of logs) {
      try {
        const logContentRes = await this.request({
          url: log.url,
          method: 'GET',
          headers: { Accept: 'text/plain' }
        });
        combinedLogs += `\n--- Log Section: ${log.id} ---\n${logContentRes.data}\n`;
      } catch (e) {
        // Continue if one log section fails
      }
    }
    return combinedLogs;
  }

  // ==========================================
  // Identity Helpers
  // ==========================================

  public async searchIdentities(query: string): Promise<any[]> {
    // Identities API is hosted on VSSPS service, which uses vssps.dev.azure.com hostname
    const url = `https://vssps.dev.azure.com/${this.organization}/_apis/identities`;
    const res = await this.request({
      url,
      method: 'GET',
      params: {
        searchFilter: 'General',
        filterValue: query,
        'api-version': '6.0'
      }
    });
    return res.data.value || [];
  }
}
