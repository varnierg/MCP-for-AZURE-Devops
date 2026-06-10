"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const devops_1 = require("./devops");
async function main() {
    const project = 'TestProject';
    const org = 'vg3';
    const creds = (0, config_1.getCredentialsForProject)(project, org);
    if (!creds) {
        console.error('No credentials found for project:', project);
        process.exit(1);
    }
    const client = new devops_1.DevOpsClient(creds.organization, creds.project, creds.username, creds.pat);
    const wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType] FROM WorkItems WHERE [System.TeamProject] = '${project}'`;
    try {
        const res = await client.request({
            url: `_apis/wit/wiql`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            params: { 'api-version': '7.1' },
            data: { query: wiql }
        });
        const workItems = res.data.workItems || [];
        console.log(`Found ${workItems.length} work items in destination project.`);
        if (workItems.length > 0) {
            const ids = workItems.map((w) => w.id).join(',');
            const detailsRes = await client.request({
                url: `_apis/wit/workitems`,
                method: 'GET',
                params: {
                    ids,
                    fields: 'System.Id,System.Title,System.WorkItemType',
                    'api-version': '7.1'
                }
            });
            console.log(JSON.stringify(detailsRes.data.value, null, 2));
        }
    }
    catch (err) {
        console.error('Error querying:', err.message);
    }
}
main();
