const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
}).then(() => {
  console.log('esbuild bundle completed successfully.');
}).catch((err) => {
  console.error('esbuild bundle failed:', err);
  process.exit(1);
});
