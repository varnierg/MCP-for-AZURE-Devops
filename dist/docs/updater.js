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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSpecFromGitHub = fetchSpecFromGitHub;
exports.parseSwagger = parseSwagger;
exports.checkAndUpdateDatabase = checkAndUpdateDatabase;
exports.searchLocalDatabase = searchLocalDatabase;
exports.fetchSingleApiInfoOnline = fetchSingleApiInfoOnline;
// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DB_FILE = path.join(__dirname, 'api-directory.json');
const AREA_MAPPINGS = {
    git: 'git',
    wit: 'workitemtracking',
    build: 'build',
    pipelines: 'pipelines',
    release: 'release',
    core: 'core'
};
async function fetchSpecFromGitHub(area, version) {
    const fileName = AREA_MAPPINGS[area] || area;
    // Standard raw GitHub URL for vsts-rest-api-specs
    const url = `https://raw.githubusercontent.com/MicrosoftDocs/vsts-rest-api-specs/master/specification/${area}/${version}/${fileName}.json`;
    const response = await axios_1.default.get(url, { timeout: 10000 });
    return response.data;
}
function parseSwagger(swagger, area, version) {
    const apis = [];
    const paths = swagger.paths || {};
    for (const [pathKey, pathObj] of Object.entries(paths)) {
        for (const [method, operation] of Object.entries(pathObj)) {
            if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
                const resource = pathKey.split('/').pop() || '';
                apis.push({
                    area,
                    resource,
                    method: method.toUpperCase(),
                    path: pathKey,
                    version,
                    description: operation.description || operation.summary || '',
                    parameters: (operation.parameters || []).map((p) => ({
                        name: p.name,
                        type: p.type || (p.schema ? p.schema.type : 'any'),
                        required: !!p.required,
                        in: p.in,
                        description: p.description || ''
                    }))
                });
            }
        }
    }
    return apis;
}
async function checkAndUpdateDatabase(organization, pat) {
    try {
        const token = Buffer.from(`:${pat}`).toString('base64');
        const response = await axios_1.default.get(`https://dev.azure.com/${organization}/_apis/resourceAreas?api-version=7.1-preview.1`, {
            headers: {
                Authorization: `Basic ${token}`
            },
            timeout: 5000
        });
        const areas = response.data.value || [];
        const gitArea = areas.find((a) => a.name === 'git');
        if (!gitArea)
            return false;
        const remoteVersion = gitArea.releasedVersion || gitArea.maxVersion || '7.1';
        if (!fs.existsSync(DB_FILE)) {
            return false;
        }
        const dbContent = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const localVersion = dbContent.version || '7.1';
        // Parse version strings (e.g. 7.1-preview -> 7.1)
        const localNum = parseFloat(localVersion);
        const remoteNum = parseFloat(remoteVersion);
        if (remoteNum > localNum) {
            const newApis = [];
            for (const area of Object.keys(AREA_MAPPINGS)) {
                try {
                    const swagger = await fetchSpecFromGitHub(area, remoteVersion);
                    const parsed = parseSwagger(swagger, area, remoteVersion);
                    newApis.push(...parsed);
                }
                catch (e) {
                    // Silent catch if a specific file doesn't exist
                }
            }
            if (newApis.length > 0) {
                dbContent.version = remoteVersion;
                const apiMap = new Map();
                for (const api of dbContent.apis) {
                    apiMap.set(`${api.method}:${api.path}`.toLowerCase(), api);
                }
                for (const api of newApis) {
                    apiMap.set(`${api.method}:${api.path}`.toLowerCase(), api);
                }
                dbContent.apis = Array.from(apiMap.values());
                fs.writeFileSync(DB_FILE, JSON.stringify(dbContent, null, 2), 'utf8');
                return true;
            }
        }
    }
    catch (error) {
        // Fail silently so startup is not disrupted
    }
    return false;
}
function searchLocalDatabase(query, area) {
    try {
        if (!fs.existsSync(DB_FILE)) {
            return [];
        }
        const dbContent = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        let apis = dbContent.apis;
        if (area) {
            apis = apis.filter(a => a.area.toLowerCase() === area.toLowerCase());
        }
        const q = query.toLowerCase();
        return apis.filter(a => a.path.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q) ||
            a.resource.toLowerCase().includes(q));
    }
    catch (e) {
        return [];
    }
}
async function fetchSingleApiInfoOnline(method, pathStr, version) {
    // Extract area from path (e.g., /_apis/git/repositories -> git)
    const parts = pathStr.split('/');
    const apisIdx = parts.findIndex(p => p.toLowerCase() === '_apis');
    if (apisIdx === -1 || apisIdx === parts.length - 1)
        return null;
    const area = parts[apisIdx + 1].toLowerCase();
    try {
        const swagger = await fetchSpecFromGitHub(area, version);
        const parsed = parseSwagger(swagger, area, version);
        const match = parsed.find(a => a.method.toLowerCase() === method.toLowerCase() &&
            a.path.toLowerCase().replace(/\/+$/, '') === pathStr.toLowerCase().replace(/\/+$/, ''));
        if (match) {
            // Cache it back to the database
            if (fs.existsSync(DB_FILE)) {
                const dbContent = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
                const apiMap = new Map();
                for (const api of dbContent.apis) {
                    apiMap.set(`${api.method}:${api.path}`.toLowerCase(), api);
                }
                apiMap.set(`${match.method}:${match.path}`.toLowerCase(), match);
                dbContent.apis = Array.from(apiMap.values());
                fs.writeFileSync(DB_FILE, JSON.stringify(dbContent, null, 2), 'utf8');
            }
            return match;
        }
    }
    catch (error) {
        // Ignore error
    }
    return null;
}
