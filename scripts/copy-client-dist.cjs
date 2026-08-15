const { cpSync, existsSync, mkdirSync } = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const src = path.join(root, "client", "dist");
const dest = path.join(root, "server", "dist", "public");
const indexFile = path.join(src, "index.html");

if (!existsSync(indexFile)) {
  console.error(`Client build missing: ${indexFile}`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied client assets to ${dest}`);
