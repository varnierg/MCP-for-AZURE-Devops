const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'docs');
const destDir = path.join(__dirname, 'dist', 'docs');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(
  path.join(srcDir, 'api-directory.json'),
  path.join(destDir, 'api-directory.json')
);

// Copy to dist/ root as well to support esbuild bundled runtime
fs.copyFileSync(
  path.join(srcDir, 'api-directory.json'),
  path.join(__dirname, 'dist', 'api-directory.json')
);
console.log('Successfully copied api-directory.json to both dist/docs/ and dist/');
