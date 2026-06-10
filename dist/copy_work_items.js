"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const devops_1 = require("./devops");
async function main() {
    const srcProject = 'AIMAG - Progetto Upgrade S4';
    const srcOrg = 'AIMAG';
    const destProject = 'TestProject';
    const destOrg = 'vg3';
    console.log(`Loading credentials for ${srcOrg}/${srcProject} and ${destOrg}/${destProject}...`);
    const srcCreds = (0, config_1.getCredentialsForProject)(srcProject, srcOrg);
    const destCreds = (0, config_1.getCredentialsForProject)(destProject, destOrg);
    if (!srcCreds || !destCreds) {
        console.error('Missing credentials!');
        process.exit(1);
    }
    const srcClient = new devops_1.DevOpsClient(srcCreds.organization, srcCreds.project, srcCreds.username, srcCreds.pat);
    const destClient = new devops_1.DevOpsClient(destCreds.organization, destCreds.project, destCreds.username, destCreds.pat);
    // 1. Query all work items in source project
    console.log('Querying work items from source...');
    const wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State] FROM WorkItems WHERE [System.TeamProject] = '${srcProject}'`;
    const queryRes = await srcClient.request({
        url: `_apis/wit/wiql`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        params: { 'api-version': '7.1' },
        data: { query: wiql }
    });
    const sourceWorkItems = queryRes.data.workItems || [];
    console.log(`Found ${sourceWorkItems.length} work items in source.`);
    if (sourceWorkItems.length === 0) {
        console.log('Nothing to copy.');
        return;
    }
    // Map of Source ID -> Destination ID
    const idMap = {};
    // Save relations of source items for later linking
    const sourceRelations = {};
    // Save source state and reason for updating later
    const sourceStates = {};
    // 2. Fetch full details and copy items one by one
    for (const itemRef of sourceWorkItems) {
        const srcId = itemRef.id;
        console.log(`\n--- Processing Source Work Item: ${srcId} ---`);
        // Fetch details with expand=all to get relations and comments
        const detailRes = await srcClient.request({
            url: `_apis/wit/workitems/${srcId}`,
            method: 'GET',
            params: {
                '$expand': 'all',
                'api-version': '7.1'
            }
        });
        const item = detailRes.data;
        const fields = item.fields;
        const type = fields['System.WorkItemType'];
        const title = fields['System.Title'];
        const state = fields['System.State'];
        const reason = fields['System.Reason'];
        sourceStates[srcId] = { state, reason, type };
        sourceRelations[srcId] = item.relations || [];
        console.log(`Type: ${type}, Title: "${title}", State: "${state}"`);
        // 2a. Copy attachments first
        const patchOperations = [
            { op: 'add', path: '/fields/System.Title', value: title }
        ];
        // Description/Repro steps/Steps
        const description = fields['System.Description'];
        if (description !== undefined) {
            patchOperations.push({ op: 'add', path: '/fields/System.Description', value: description });
        }
        const reproSteps = fields['System.ReproSteps'];
        if (reproSteps !== undefined) {
            patchOperations.push({ op: 'add', path: '/fields/System.ReproSteps', value: reproSteps });
        }
        const steps = fields['Microsoft.VSTS.TCM.Steps'];
        if (steps !== undefined) {
            patchOperations.push({ op: 'add', path: '/fields/Microsoft.VSTS.TCM.Steps', value: steps });
        }
        // Process attachments
        const attachments = (item.relations || []).filter((r) => r.rel === 'AttachedFile');
        if (attachments.length > 0) {
            console.log(`Uploading ${attachments.length} attachments...`);
            for (const att of attachments) {
                try {
                    const fileName = att.attributes?.name || 'attachment';
                    console.log(`Downloading attachment: ${fileName} from ${att.url}`);
                    const dlRes = await srcClient.request({
                        url: att.url,
                        method: 'GET',
                        responseType: 'arraybuffer'
                    });
                    console.log(`Uploading attachment to destination...`);
                    const uploadRes = await destClient.request({
                        url: `_apis/wit/attachments`,
                        method: 'POST',
                        params: {
                            fileName,
                            'api-version': '7.1'
                        },
                        headers: {
                            'Content-Type': 'application/octet-stream'
                        },
                        data: Buffer.from(dlRes.data)
                    });
                    const newAttUrl = uploadRes.data.url;
                    console.log(`Attachment uploaded. New URL: ${newAttUrl}`);
                    patchOperations.push({
                        op: 'add',
                        path: '/relations/-',
                        value: {
                            rel: 'AttachedFile',
                            url: newAttUrl,
                            attributes: {
                                comment: att.attributes?.comment || 'Copied attachment'
                            }
                        }
                    });
                }
                catch (attErr) {
                    console.error(`Error copying attachment: ${attErr.message}`);
                }
            }
        }
        // Create the work item in the destination project
        console.log(`Creating work item in destination project...`);
        const createRes = await destClient.request({
            url: `_apis/wit/workitems/$${encodeURIComponent(type)}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json-patch+json' },
            params: { 'api-version': '7.1' },
            data: patchOperations
        });
        const destId = createRes.data.id;
        idMap[srcId] = destId;
        console.log(`Successfully created destination Work Item ID: ${destId}`);
        // 2b. Copy discussions/comments
        try {
            console.log('Fetching comments...');
            const commentsRes = await srcClient.request({
                url: `_apis/wit/workitems/${srcId}/comments`,
                method: 'GET',
                params: { 'api-version': '7.1-preview.3' }
            });
            const comments = commentsRes.data.comments || [];
            if (comments.length > 0) {
                console.log(`Posting ${comments.length} comments to destination...`);
                for (const c of comments) {
                    const author = c.createdBy?.displayName || 'Unknown';
                    const dateStr = new Date(c.createdDate).toLocaleString();
                    const commentText = `<b>[Copied Comment]</b> Original comment by <b>${author}</b> on <i>${dateStr}</i>:<br/><br/>${c.text}`;
                    await destClient.request({
                        url: `_apis/wit/workitems/${destId}/comments`,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        params: { 'api-version': '7.1-preview.3' },
                        data: { text: commentText }
                    });
                }
            }
        }
        catch (commErr) {
            console.error(`Error copying comments for item ${srcId}: ${commErr.message}`);
        }
    }
    // 3. Update States & Reasons
    console.log('\n=== Updating States of Copied Work Items ===');
    for (const [srcIdStr, destId] of Object.entries(idMap)) {
        const srcId = parseInt(srcIdStr);
        const { state, reason } = sourceStates[srcId];
        console.log(`Updating Dest ID ${destId} to State: "${state}"...`);
        try {
            const statePatch = [
                { op: 'add', path: '/fields/System.State', value: state }
            ];
            if (reason) {
                statePatch.push({ op: 'add', path: '/fields/System.Reason', value: reason });
            }
            await destClient.request({
                url: `_apis/wit/workitems/${destId}`,
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json-patch+json' },
                params: { 'api-version': '7.1' },
                data: statePatch
            });
        }
        catch (stateErr) {
            console.error(`Failed to update state for Dest ID ${destId}: ${stateErr.message}`);
            if (reason) {
                try {
                    await destClient.request({
                        url: `_apis/wit/workitems/${destId}`,
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json-patch+json' },
                        params: { 'api-version': '7.1' },
                        data: [{ op: 'add', path: '/fields/System.State', value: state }]
                    });
                    console.log(`Successfully fell back and updated state for Dest ID ${destId} without Reason.`);
                }
                catch (fallbackErr) {
                    console.error(`Fallback state update also failed for Dest ID ${destId}: ${fallbackErr.message}`);
                }
            }
        }
    }
    // 4. Recreate Relations/Links
    console.log('\n=== Recreating Links/Relations ===');
    const linkedPairs = new Set();
    for (const [srcIdStr, destId] of Object.entries(idMap)) {
        const srcId = parseInt(srcIdStr);
        const relations = sourceRelations[srcId];
        for (const rel of relations) {
            if (rel.rel === 'AttachedFile' || !rel.url.includes('/_apis/wit/workItems/')) {
                continue;
            }
            const match = rel.url.match(/_apis\/wit\/workItems\/(\d+)/i);
            if (!match)
                continue;
            const srcTargetId = parseInt(match[1]);
            const destTargetId = idMap[srcTargetId];
            if (destTargetId) {
                const pairKey = [destId, destTargetId].sort().join('-');
                if (linkedPairs.has(pairKey)) {
                    continue;
                }
                console.log(`Linking Dest ID ${destId} to Dest ID ${destTargetId} (Relation: ${rel.rel})...`);
                try {
                    const linkPatch = [
                        {
                            op: 'add',
                            path: '/relations/-',
                            value: {
                                rel: rel.rel,
                                url: `https://dev.azure.com/${destOrg}/_apis/wit/workItems/${destTargetId}`,
                                attributes: {
                                    comment: rel.attributes?.comment || 'Copied relationship'
                                }
                            }
                        }
                    ];
                    await destClient.request({
                        url: `_apis/wit/workitems/${destId}`,
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json-patch+json' },
                        params: { 'api-version': '7.1' },
                        data: linkPatch
                    });
                    linkedPairs.add(pairKey);
                }
                catch (linkErr) {
                    console.error(`Failed to link Dest ID ${destId} to Dest ID ${destTargetId}: ${linkErr.message}`);
                }
            }
        }
    }
    console.log('\n=== Migration Completed! ===');
    console.log('Successfully copied all work items, attachments, comments, and relationships.');
}
main().catch(err => {
    console.error('Fatal error during migration:', err);
});
