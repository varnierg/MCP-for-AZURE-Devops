import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const DB_FILE = path.join(__dirname, 'api-directory.json');

export interface ApiSpec {
  area: string;
  resource: string;
  method: string;
  path: string;
  version: string;
  description: string;
  parameters: any[];
  requestBody?: any;
}

const AREA_MAPPINGS: Record<string, string> = {
  git: 'git',
  wit: 'workitemtracking',
  build: 'build',
  pipelines: 'pipelines',
  release: 'release',
  core: 'core'
};

export async function fetchSpecFromGitHub(area: string, version: string): Promise<any> {
  const fileName = AREA_MAPPINGS[area] || area;
  // Standard raw GitHub URL for vsts-rest-api-specs
  const url = `https://raw.githubusercontent.com/MicrosoftDocs/vsts-rest-api-specs/master/specification/${area}/${version}/${fileName}.json`;
  
  const response = await axios.get(url, { timeout: 10000 });
  return response.data;
}

export function parseSwagger(swagger: any, area: string, version: string): ApiSpec[] {
  const apis: ApiSpec[] = [];
  const paths = swagger.paths || {};

  for (const [pathKey, pathObj] of Object.entries<any>(paths)) {
    for (const [method, operation] of Object.entries<any>(pathObj)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
        const resource = pathKey.split('/').pop() || '';
        
        apis.push({
          area,
          resource,
          method: method.toUpperCase(),
          path: pathKey,
          version,
          description: operation.description || operation.summary || '',
          parameters: (operation.parameters || []).map((p: any) => ({
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

export async function checkAndUpdateDatabase(organization: string, pat: string): Promise<boolean> {
  try {
    const token = Buffer.from(`:${pat}`).toString('base64');
    const response = await axios.get(
      `https://dev.azure.com/${organization}/_apis/resourceAreas?api-version=7.1-preview.1`,
      {
        headers: {
          Authorization: `Basic ${token}`
        },
        timeout: 5000
      }
    );

    const areas = response.data.value || [];
    const gitArea = areas.find((a: any) => a.name === 'git');
    if (!gitArea) return false;

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
      const newApis: ApiSpec[] = [];
      
      for (const area of Object.keys(AREA_MAPPINGS)) {
        try {
          const swagger = await fetchSpecFromGitHub(area, remoteVersion);
          const parsed = parseSwagger(swagger, area, remoteVersion);
          newApis.push(...parsed);
        } catch (e) {
          // Silent catch if a specific file doesn't exist
        }
      }

      if (newApis.length > 0) {
        dbContent.version = remoteVersion;
        const apiMap = new Map<string, ApiSpec>();
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
  } catch (error) {
    // Fail silently so startup is not disrupted
  }
  return false;
}

export function searchLocalDatabase(query: string, area?: string): ApiSpec[] {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return [];
    }
    const dbContent = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    let apis = dbContent.apis as ApiSpec[];

    if (area) {
      apis = apis.filter(a => a.area.toLowerCase() === area.toLowerCase());
    }

    const q = query.toLowerCase();
    return apis.filter(
      a =>
        a.path.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.resource.toLowerCase().includes(q)
    );
  } catch (e) {
    return [];
  }
}

export async function fetchSingleApiInfoOnline(method: string, pathStr: string, version: string): Promise<ApiSpec | null> {
  // Extract area from path (e.g., /_apis/git/repositories -> git)
  const parts = pathStr.split('/');
  const apisIdx = parts.findIndex(p => p.toLowerCase() === '_apis');
  if (apisIdx === -1 || apisIdx === parts.length - 1) return null;
  const area = parts[apisIdx + 1].toLowerCase();

  try {
    const swagger = await fetchSpecFromGitHub(area, version);
    const parsed = parseSwagger(swagger, area, version);
    const match = parsed.find(
      a =>
        a.method.toLowerCase() === method.toLowerCase() &&
        a.path.toLowerCase().replace(/\/+$/, '') === pathStr.toLowerCase().replace(/\/+$/, '')
    );
    
    if (match) {
      // Cache it back to the database
      if (fs.existsSync(DB_FILE)) {
        const dbContent = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const apiMap = new Map<string, ApiSpec>();
        for (const api of dbContent.apis) {
          apiMap.set(`${api.method}:${api.path}`.toLowerCase(), api);
        }
        apiMap.set(`${match.method}:${match.path}`.toLowerCase(), match);
        dbContent.apis = Array.from(apiMap.values());
        fs.writeFileSync(DB_FILE, JSON.stringify(dbContent, null, 2), 'utf8');
      }
      return match;
    }
  } catch (error) {
    // Ignore error
  }
  return null;
}
