const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const serverProcess = cp.spawn('node', ['dist/index.js'], { cwd: __dirname });
let buffer = '';

serverProcess.stdout.on('data', (data) => {
  buffer += data.toString();
  try {
    // Process JSON-RPC messages separated by newlines
    const lines = buffer.split('\n');
    // Keep the last partial line in the buffer
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim().startsWith('{')) {
        const json = JSON.parse(line.trim());
        
        // Handle initialize response
        if (json.id === 1 && json.result && json.result.protocolVersion) {
          console.log('Received initialize response. Sending initialized notification and tools/list request...');
          
          // Send notifications/initialized (standard protocol flow)
          serverProcess.stdin.write(
            JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/initialized'
            }) + '\n'
          );

          // Send tools/list
          serverProcess.stdin.write(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/list',
              params: {}
            }) + '\n'
          );
        }

        // Handle tools/list response
        if (json.id === 2 && json.result && json.result.tools) {
          console.log('Received tools/list response.');
          const card = {
            serverInfo: {
              name: 'mcp-azure-devops',
              version: '1.0.0'
            },
            tools: json.result.tools
          };

          const destDir = path.join(__dirname, '.well-known', 'mcp');
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }

          fs.writeFileSync(
            path.join(destDir, 'server-card.json'),
            JSON.stringify(card, null, 2),
            'utf8'
          );

          fs.writeFileSync(
            path.join(__dirname, '.well-known', 'mcp.json'),
            JSON.stringify(card, null, 2),
            'utf8'
          );

          console.log('Successfully generated /.well-known/mcp/server-card.json and /.well-known/mcp.json');

          // Update manifest.json with the tools list
          const manifestPath = path.join(__dirname, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            manifest.tools = json.result.tools;
            
            // Ensure defaultProject in user_config has default: ""
            if (manifest.user_config && manifest.user_config.defaultProject) {
              manifest.user_config.defaultProject.default = "";
            }

            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
            console.log('Successfully updated manifest.json with tools list and optional default config.');
          }
          serverProcess.kill();
          process.exit(0);
        }
      }
    }
  } catch (err) {
    // Parsing error or incomplete line; buffer will handle it
  }
});

serverProcess.stderr.on('data', (data) => {
  console.log(`[Server Stderr]: ${data.toString().trim()}`);
});

serverProcess.on('exit', (code) => {
  console.log(`Server process exited with code ${code}`);
});

// Start the handshake by sending initialize request
setTimeout(() => {
  console.log('Sending initialize request...');
  serverProcess.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'generator',
          version: '1.0.0'
        }
      }
    }) + '\n'
  );
}, 500);

// Set safety timeout to prevent hanging
setTimeout(() => {
  console.error('Timeout waiting for response.');
  serverProcess.kill();
  process.exit(1);
}, 5000);
