const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const serverProcess = cp.spawn('node', ['dist/index.js']);
let output = '';

serverProcess.stdout.on('data', (data) => {
  output += data.toString();
  try {
    // Attempt to parse the captured output line by line as JSON-RPC response
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('{')) {
        const json = JSON.parse(line.trim());
        if (json.id === 1 && json.result && json.result.tools) {
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

          console.log('Successfully generated /.well-known/mcp/server-card.json');
          serverProcess.kill();
          process.exit(0);
        }
      }
    }
  } catch (err) {
    // Keep buffering until we have a complete JSON message
  }
});

serverProcess.stderr.on('data', (data) => {
  // Ignore stderr logs during capture
});

serverProcess.on('exit', () => {
  console.error('Server process exited before tools/list response was captured.');
});

// Send tools/list request after starting the process
setTimeout(() => {
  serverProcess.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    }) + '\n'
  );
}, 500);

// Set safety timeout to prevent hanging
setTimeout(() => {
  console.error('Timeout waiting for tools/list response.');
  serverProcess.kill();
  process.exit(1);
}, 5000);
