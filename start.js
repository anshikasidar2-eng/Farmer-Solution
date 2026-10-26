// Launcher: checks the Node.js version first (older versions cannot load the built-in SQLite), then starts the server.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`\nAgriSmart needs Node.js 22.5 or newer (you have ${process.versions.node}).\nInstall the current LTS from https://nodejs.org and run again.\n`);
  process.exit(1);
}
const { server } = await import('./src/index.js');
const { config } = await import('./src/config.js');
server.listen(config.port, '0.0.0.0', () => console.log(`AgriSmart running on http://localhost:${config.port} (photo check: ${config.diseaseProvider})`));
