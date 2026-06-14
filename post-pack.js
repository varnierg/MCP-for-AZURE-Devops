const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  console.log('1. Cleaning up old temp_mcpb folder if it exists...');
  if (fs.existsSync('temp_mcpb')) {
    fs.rmSync('temp_mcpb', { recursive: true, force: true });
  }

  console.log('2. Copying and extracting bundle...');
  if (fs.existsSync('mcp_build.zip')) {
    fs.unlinkSync('mcp_build.zip');
  }
  fs.copyFileSync('mcp_build.mcpb', 'mcp_build.zip');
  execSync('powershell -ExecutionPolicy Bypass -Command "Expand-Archive -Path mcp_build.zip -DestinationPath temp_mcpb -Force"');
  fs.unlinkSync('mcp_build.zip');

  console.log('3. Reading tools from server-card.json...');
  const cardPath = path.join('.well-known', 'mcp', 'server-card.json');
  const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
  const tools = card.tools;
  console.log(`Found ${tools.length} tools.`);

  console.log('4. Updating manifest.json inside the extracted bundle...');
  const manifestPath = path.join('temp_mcpb', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.tools = tools;
  
  // Ensure defaultProject default: ""
  if (manifest.user_config && manifest.user_config.defaultProject) {
    manifest.user_config.defaultProject.default = "";
  }
  
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('5. Re-compressing bundle...');
  if (fs.existsSync('mcp-azure-devops.zip')) {
    fs.unlinkSync('mcp-azure-devops.zip');
  }
  if (fs.existsSync('mcp-azure-devops.mcpb')) {
    fs.unlinkSync('mcp-azure-devops.mcpb');
  }
  execSync('powershell -ExecutionPolicy Bypass -Command "Compress-Archive -Path temp_mcpb\\* -DestinationPath mcp-azure-devops.zip -Force"');
  fs.renameSync('mcp-azure-devops.zip', 'mcp-azure-devops.mcpb');

  console.log('6. Cleaning up temp folder...');
  fs.rmSync('temp_mcpb', { recursive: true, force: true });

  console.log('Post-pack processing completed successfully!');
} catch (e) {
  console.error('Error during post-pack processing:', e.message);
  process.exit(1);
}
