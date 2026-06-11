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
exports.parseProjectUrl = parseProjectUrl;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
exports.addProjectConfig = addProjectConfig;
exports.getCredentialsForProject = getCredentialsForProject;
// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto_1 = require("./crypto");
const CONFIG_FILE = path.join(process.cwd(), '.azure-devops-config.enc');
function parseProjectUrl(urlStr) {
    let url = urlStr.trim().replace(/\/+$/, '');
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === 'dev.azure.com') {
            const parts = parsed.pathname.split('/').filter(Boolean);
            if (parts.length >= 2) {
                return {
                    organization: parts[0],
                    project: parts[1]
                };
            }
            if (parts.length === 1) {
                return {
                    organization: parts[0],
                    project: ''
                };
            }
        }
        if (hostname.endsWith('.visualstudio.com')) {
            const org = hostname.split('.')[0];
            const parts = parsed.pathname.split('/').filter(Boolean);
            if (parts[0] && parts[0].toLowerCase() === 'defaultcollection') {
                return {
                    organization: org,
                    project: parts[1] || ''
                };
            }
            return {
                organization: org,
                project: parts[0] || ''
            };
        }
    }
    catch (e) {
        // Fallback to regex
    }
    const devAzureRegex = /dev\.azure\.com\/([^/]+)(?:\/([^/]+))?/;
    const vsRegex = /([^/.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)?/;
    let match = url.match(devAzureRegex);
    if (match) {
        return { organization: match[1], project: match[2] || '' };
    }
    match = url.match(vsRegex);
    if (match) {
        return { organization: match[1], project: match[2] || '' };
    }
    throw new Error(`Could not parse Azure DevOps URL: ${urlStr}`);
}
function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        return null;
    }
    const key = (0, crypto_1.getEncryptionKey)();
    if (!key) {
        // Encryption key is lost! Clear the config file to prevent corruption and force re-setup.
        try {
            fs.unlinkSync(CONFIG_FILE);
        }
        catch (e) {
            // Ignore errors deleting
        }
        return null;
    }
    try {
        const encryptedData = fs.readFileSync(CONFIG_FILE, 'utf8').trim();
        const decryptedData = (0, crypto_1.decrypt)(encryptedData, key);
        return JSON.parse(decryptedData);
    }
    catch (error) {
        // Decryption failed (corrupt key or file). Force reset.
        try {
            fs.unlinkSync(CONFIG_FILE);
        }
        catch (e) { }
        return null;
    }
}
function saveConfig(config) {
    let key = (0, crypto_1.getEncryptionKey)();
    if (!key) {
        key = (0, crypto_1.generateAndSaveKey)();
    }
    const serialized = JSON.stringify(config, null, 2);
    const encrypted = (0, crypto_1.encrypt)(serialized, key);
    fs.writeFileSync(CONFIG_FILE, encrypted, 'utf8');
}
function addProjectConfig(url, username, pat) {
    const { organization, project } = parseProjectUrl(url);
    if (!organization || !project) {
        throw new Error('Could not extract organization or project from URL');
    }
    let config = loadConfig();
    if (!config) {
        config = {
            organizations: {},
            projects: {}
        };
    }
    // Save/Update credentials for organization
    config.organizations[organization] = { username, pat };
    // Link project to organization
    const projKey = `${organization}/${project}`.toLowerCase();
    config.projects[projKey] = { organization };
    // Set default project if not set
    if (!config.defaultProject) {
        config.defaultProject = projKey;
    }
    saveConfig(config);
    return { organization, project };
}
function getCredentialsForProject(projectPath, orgName) {
    // Check command-line arguments and environment variables
    const args = process.argv;
    const getArgValue = (flag) => {
        const idx = args.indexOf(flag);
        return (idx !== -1 && idx < args.length - 1) ? args[idx + 1] : undefined;
    };
    const argOrg = getArgValue('--org') || getArgValue('--organization');
    const argUsername = getArgValue('--username');
    const argPat = getArgValue('--pat') || getArgValue('--token');
    const argProject = getArgValue('--project') || getArgValue('--defaultProject');
    const envOrg = argOrg || process.env.AZURE_DEVOPS_ORG || process.env.AZURE_DEVOPS_ORGANIZATION;
    const envUsername = argUsername || process.env.AZURE_DEVOPS_USERNAME;
    const envPat = argPat || process.env.AZURE_DEVOPS_PAT || process.env.AZURE_DEVOPS_TOKEN;
    const envProject = argProject || process.env.AZURE_DEVOPS_PROJECT;
    if (envOrg && envUsername && envPat) {
        if (!orgName || orgName.toLowerCase() === envOrg.toLowerCase()) {
            return {
                organization: orgName || envOrg,
                project: projectPath || envProject || '',
                username: envUsername,
                pat: envPat
            };
        }
    }
    const config = loadConfig();
    if (!config) {
        return null;
    }
    let organization = orgName;
    let project = projectPath;
    // If both are missing, use default project
    if (!organization && !project) {
        if (!config.defaultProject) {
            return null;
        }
        const parts = config.defaultProject.split('/');
        organization = parts[0];
        project = parts[1];
    }
    else if (project && !organization) {
        // If only project is specified, check if it's in org/project format
        if (project.includes('/')) {
            const parts = project.split('/');
            organization = parts[0];
            project = parts[1];
        }
        else {
            // Find project in config
            const matchingProjKey = Object.keys(config.projects).find(k => k.endsWith(`/${project}`.toLowerCase()));
            if (matchingProjKey) {
                organization = config.projects[matchingProjKey].organization;
            }
            else {
                // Fallback: look at the default project organization
                if (config.defaultProject) {
                    organization = config.defaultProject.split('/')[0];
                }
            }
        }
    }
    if (!organization) {
        return null;
    }
    let orgConfig = config.organizations[organization];
    if (!orgConfig) {
        const targetOrg = organization.toLowerCase();
        const matchingKey = Object.keys(config.organizations).find(k => k.toLowerCase() === targetOrg);
        if (matchingKey) {
            orgConfig = config.organizations[matchingKey];
            organization = matchingKey;
        }
        else {
            return null;
        }
    }
    return {
        organization,
        project: project || '',
        username: orgConfig.username,
        pat: orgConfig.pat
    };
}
