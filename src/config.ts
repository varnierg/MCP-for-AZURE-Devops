import * as fs from 'fs';
import * as path from 'path';
import { getEncryptionKey, generateAndSaveKey, encrypt, decrypt } from './crypto';

const CONFIG_FILE = path.join(process.cwd(), '.azure-devops-config.enc');

export interface OrgConfig {
  username: string;
  pat: string;
}

export interface ProjectConfig {
  organization: string;
}

export interface DevOpsConfig {
  organizations: Record<string, OrgConfig>;
  projects: Record<string, ProjectConfig>;
  defaultProject?: string;
}

export function parseProjectUrl(urlStr: string): { organization: string; project: string } {
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
  } catch (e) {
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

export function loadConfig(): DevOpsConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) {
    return null;
  }

  const key = getEncryptionKey();
  if (!key) {
    // Encryption key is lost! Clear the config file to prevent corruption and force re-setup.
    try {
      fs.unlinkSync(CONFIG_FILE);
    } catch (e) {
      // Ignore errors deleting
    }
    return null;
  }

  try {
    const encryptedData = fs.readFileSync(CONFIG_FILE, 'utf8').trim();
    const decryptedData = decrypt(encryptedData, key);
    return JSON.parse(decryptedData) as DevOpsConfig;
  } catch (error) {
    // Decryption failed (corrupt key or file). Force reset.
    try {
      fs.unlinkSync(CONFIG_FILE);
    } catch (e) {}
    return null;
  }
}

export function saveConfig(config: DevOpsConfig): void {
  let key = getEncryptionKey();
  if (!key) {
    key = generateAndSaveKey();
  }

  const serialized = JSON.stringify(config, null, 2);
  const encrypted = encrypt(serialized, key);
  fs.writeFileSync(CONFIG_FILE, encrypted, 'utf8');
}

export function addProjectConfig(
  url: string,
  username: string,
  pat: string
): { organization: string; project: string } {
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

export function getCredentialsForProject(
  projectPath?: string,
  orgName?: string
): { organization: string; project: string; username: string; pat: string } | null {
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
  } else if (project && !organization) {
    // If only project is specified, check if it's in org/project format
    if (project.includes('/')) {
      const parts = project.split('/');
      organization = parts[0];
      project = parts[1];
    } else {
      // Find project in config
      const matchingProjKey = Object.keys(config.projects).find(k => k.endsWith(`/${project}`.toLowerCase()));
      if (matchingProjKey) {
        organization = config.projects[matchingProjKey].organization;
      } else {
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
    const matchingKey = Object.keys(config.organizations).find(
      k => k.toLowerCase() === targetOrg
    );
    if (matchingKey) {
      orgConfig = config.organizations[matchingKey];
      organization = matchingKey;
    } else {
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
