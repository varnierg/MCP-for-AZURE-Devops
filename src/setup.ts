import * as readline from 'readline';
import { addProjectConfig, loadConfig, getCredentialsForProject } from './config';
import { DevOpsClient } from './devops';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (query: string): Promise<string> => {
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

    let organization: string;
    let project: string;
    try {
      const parsed = addProjectConfig(urlInput, 'temp_user', 'temp_pat'); // temporary write to test parsing
      organization = parsed.organization;
      project = parsed.project;
    } catch (e: any) {
      console.log(`Error: ${e.message}`);
      rl.close();
      return;
    }

    console.log(`\nDetected Organization: ${organization}`);
    console.log(`Detected Project: ${project || 'None (Organization level)'}`);

    // Check if organization already exists in configuration
    const existingConfig = loadConfig();
    let existingOrg = existingConfig?.organizations[organization];
    let matchingOrgKey = organization;
    if (!existingOrg && existingConfig) {
      const matchingKey = Object.keys(existingConfig.organizations).find(
        k => k.toLowerCase() === organization.toLowerCase()
      );
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
      const client = new DevOpsClient(organization, project, username.trim(), pat.trim());
      
      try {
        // Fetch resource areas to test authentication
        await client.getResourceAreas();
        console.log('Success: Connection validated successfully!');
      } catch (err: any) {
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
    addProjectConfig(urlInput, username.trim(), pat.trim());
    console.log(`\nSuccessfully saved configuration to .azure-devops-config.enc!`);
    console.log(`The key is stored securely in your user profile folder.`);
  } catch (error: any) {
    console.log(`An error occurred: ${error.message}`);
  } finally {
    rl.close();
  }
}

runSetup();
