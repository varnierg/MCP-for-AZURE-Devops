"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
const readline = __importStar(require("readline"));
const config_1 = require("./config");
const devops_1 = require("./devops");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const ask = (query) => {
    return new Promise(resolve => rl.question(query, resolve));
};
async function runSetup() {
    console.log('\n--- Azure DevOps MCP Configuration Setup ---\n');
    try {
        const urlInput = await ask('Enter Azure DevOps Project or Dashboard URL:\n> ');
        if (!urlInput.trim()) {
            console.log('Error: URL cannot be empty.');
            rl.close();
            return;
        }
        let organization;
        let project;
        try {
            const parsed = (0, config_1.addProjectConfig)(urlInput, 'temp_user', 'temp_pat'); // temporary write to test parsing
            organization = parsed.organization;
            project = parsed.project;
        }
        catch (e) {
            console.log(`Error: ${e.message}`);
            rl.close();
            return;
        }
        console.log(`\nDetected Organization: ${organization}`);
        console.log(`Detected Project: ${project || 'None (Organization level)'}`);
        // Check if organization already exists in configuration
        const existingConfig = (0, config_1.loadConfig)();
        let existingOrg = existingConfig?.organizations[organization];
        let matchingOrgKey = organization;
        if (!existingOrg && existingConfig) {
            const matchingKey = Object.keys(existingConfig.organizations).find(k => k.toLowerCase() === organization.toLowerCase());
            if (matchingKey) {
                existingOrg = existingConfig.organizations[matchingKey];
                matchingOrgKey = matchingKey;
            }
        }
        let username = '';
        let pat = '';
        let shouldPromptCredentials = true;
        if (existingOrg) {
            console.log(`\nFound existing credentials for organization "${matchingOrgKey}" (User: ${existingOrg.username})`);
            const reuseAnswer = await ask('Do you want to reuse these credentials? (y/n):\n> ');
            if (reuseAnswer.trim().toLowerCase() === 'y' || reuseAnswer.trim().toLowerCase() === 'yes') {
                username = existingOrg.username;
                pat = existingOrg.pat;
                shouldPromptCredentials = false;
            }
        }
        if (shouldPromptCredentials) {
            username = await ask('\nEnter your Azure DevOps Username or Email:\n> ');
            pat = await ask('Enter your Azure DevOps Personal Access Token (PAT):\n> ');
            if (!username.trim() || !pat.trim()) {
                console.log('Error: Username and Token cannot be empty.');
                rl.close();
                return;
            }
            console.log('\nValidating credentials against Azure DevOps...');
            const client = new devops_1.DevOpsClient(organization, project, username.trim(), pat.trim());
            try {
                // Fetch resource areas to test authentication
                await client.getResourceAreas();
                console.log('Success: Connection validated successfully!');
            }
            catch (err) {
                console.log(`\nAuthentication Validation Failed: ${err.message}`);
                const proceed = await ask('Do you want to save credentials anyway? (y/n):\n> ');
                if (proceed.trim().toLowerCase() !== 'y' && proceed.trim().toLowerCase() !== 'yes') {
                    console.log('Setup aborted.');
                    rl.close();
                    return;
                }
            }
        }
        // Save final configuration
        (0, config_1.addProjectConfig)(urlInput, username.trim(), pat.trim());
        console.log(`\nSuccessfully saved configuration to .azure-devops-config.enc!`);
        console.log(`The key is stored securely in your user profile folder.`);
    }
    catch (error) {
        console.log(`An error occurred: ${error.message}`);
    }
    finally {
        rl.close();
    }
}
runSetup();
