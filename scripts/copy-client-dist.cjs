const { cpSync, existsSync, mkdirSync, rmSync } = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const src = path.join(root, "client", "dist");
const dest = path.join(root, "server", "dist", "public");
const indexFile = path.join(src, "index.html");

if (!existsSync(indexFile)) {
  console.error(`Client build missing: ${indexFile}`);
  process.exit(1);
}

// Clear first: a plain copy leaves assets deleted from client/public behind,
// so stale files would keep being served after a rebuild.
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied client assets to ${dest}`);
