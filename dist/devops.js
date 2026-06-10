"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevOpsClient = void 0;
// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
const axios_1 = __importDefault(require("axios"));
class DevOpsClient {
    organization;
    project;
    username;
    pat;
    constructor(organization, project, username, pat) {
        this.organization = organization;
        this.project = project;
        this.username = username;
        this.pat = pat;
    }
    getAuthHeader() {
        const token = Buffer.from(`${this.username}:${this.pat}`).toString('base64');
        return `Basic ${token}`;
    }
    /**
     * Helper to perform raw HTTP requests to Azure DevOps
     */
    async request(config) {
        const headers = {
            Authorization: this.getAuthHeader(),
            Accept: 'application/json',
            ...config.headers
        };
        const urlHost = config.url?.startsWith('http')
            ? config.url
            : `https://dev.azure.com/${this.organization}/${this.project ? `${this.project}/` : ''}${config.url?.replace(/^\//, '')}`;
        const finalConfig = {
            ...config,
            url: urlHost,
            headers
        };
        try {
            return await (0, axios_1.default)(finalConfig);
        }
        catch (error) {
            this.handleError(error, config);
            throw error;
        }
    }
    handleError(error, config) {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            const message = data?.message || error.message;
            // Handle Read-Only or Write-Only credential errors (401 / 403)
            if (status === 401 || status === 403) {
                const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method?.toUpperCase() || '');
                if (isWriteOperation) {
                    throw new Error(`[PERMISSION ERROR] Azure DevOps API returned HTTP ${status}: ${message}\n` +
                        `Rationale: The configured Personal Access Token (PAT) does not have write permissions for this resource.\n` +
                        `Action Required: Please provide a token with read/write access (e.g. 'vso.code_write' or 'vso.work_write') using the configure_connection tool.`);
                }
                else {
                    throw new Error(`[AUTHENTICATION ERROR] Azure DevOps API returned HTTP ${status}: ${message}\n` +
                        `Rationale: The credentials could be expired, revoked, or lack read permission.\n` +
                        `Action Required: Please check your username and PAT, and reconfigure if necessary.`);
                }
            }
            throw new Error(`Azure DevOps API error (HTTP ${status}): ${message}`);
        }
        throw error;
    }
    /**
     * Retrieves resources areas to discover remote API version
     */
    async getResourceAreas() {
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
    async getWorkItem(id) {
        const res = await this.request({
            url: `_apis/wit/workitems/${id}`,
            method: 'GET',
            params: { 'api-version': '7.1' }
        });
        return res.data;
    }
    async createWorkItem(type, title, description, extraFields) {
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
    async updateWorkItem(id, fields) {
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
    async queryWorkItems(wiql) {
        const res = await this.request({
            url: `_apis/wit/wiql`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            params: { 'api-version': '7.1' },
            data: { query: wiql }
        });
        const workItems = res.data.workItems || [];
        if (workItems.length === 0)
            return [];
        // Fetch details of all returned work items (batch fetch)
        const ids = workItems.map((w) => w.id).join(',');
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
    async addWorkItemComment(id, text) {
        const res = await this.request({
            url: `_apis/wit/workitems/${id}/comments`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            params: { 'api-version': '7.1-preview.3' },
            data: { text }
        });
        return res.data;
    }
    async linkWorkItems(sourceId, targetId, relationType) {
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
    async listRepositories() {
        const res = await this.request({
            url: `_apis/git/repositories`,
            method: 'GET',
            params: { 'api-version': '7.1' }
        });
        return res.data.value || [];
    }
    async getGitFile(repositoryId, filePath, branch = 'main') {
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
    async createGitPush(repositoryId, branchName, commitMessage, changes) {
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
        }
        catch (e) {
            // If ref doesn't exist, we assume it's a new branch
        }
        // 2. Build the push payload
        const formattedChanges = changes.map(c => {
            const change = {
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
    async createPullRequest(repositoryId, sourceBranch, targetBranch, title, description) {
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
    async getPullRequest(repositoryId, pullRequestId) {
        const res = await this.request({
            url: `_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}`,
            method: 'GET',
            params: { 'api-version': '7.1' }
        });
        return res.data;
    }
    async updatePullRequest(repositoryId, pullRequestId, status, reviewerVote) {
        const payload = { status };
        const res = await this.request({
            url: `_apis/git/repositories/${repositoryId}/pullrequests/${pullRequestId}`,
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            params: { 'api-version': '7.1' },
            data: payload
        });
        return res.data;
    }
    async createPullRequestThread(repositoryId, pullRequestId, filePath, line, content) {
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
    async listPullRequestThreads(repositoryId, pullRequestId) {
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
    async runPipeline(pipelineId, variables = {}) {
        const formattedVariables = {};
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
    async getPipelineRun(pipelineId, runId) {
        const res = await this.request({
            url: `_apis/pipelines/${pipelineId}/runs/${runId}`,
            method: 'GET',
            params: { 'api-version': '7.1-preview.1' }
        });
        return res.data;
    }
    async getPipelineRunLogs(pipelineId, runId) {
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
            }
            catch (e) {
                // Continue if one log section fails
            }
        }
        return combinedLogs;
    }
    // ==========================================
    // Identity Helpers
    // ==========================================
    async searchIdentities(query) {
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
exports.DevOpsClient = DevOpsClient;
