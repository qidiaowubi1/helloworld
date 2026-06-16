import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { put } from "@vercel/blob";

await loadLocalEnv();

const inputPath = resolve(process.cwd(), process.argv[2] || "data/dashboard.json");
const pathname = process.env.DASHBOARD_BLOB_PATH || "dashboard/latest.json";
const token = process.env.BLOB_READ_WRITE_TOKEN;

const content = await readFile(inputPath, "utf8");
const blob = token ? await publishWithSdk(content).catch(publishWithCli) : await publishWithCli();

await writeFile(
  resolve(process.cwd(), "data/dashboard-blob.json"),
  `${JSON.stringify({ ...blob, pathname, publishedAt: new Date().toISOString() }, null, 2)}\n`,
  "utf8"
);

console.log(`Published dashboard snapshot to ${blob.url}`);
console.log("Set DASHBOARD_BLOB_URL in Vercel production to this URL if it is not already configured.");

async function publishWithSdk(content) {
  return put(pathname, content, {
    access: "public",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
    token
  });
}

async function publishWithCli(error) {
  if (error) console.log(`SDK publish failed; falling back to Vercel CLI: ${error.message}`);
  const scope = process.env.VERCEL_SCOPE || "qidiaowubi1s-projects";
  const cliEnv = { ...process.env };
  delete cliEnv.BLOB_READ_WRITE_TOKEN;
  delete cliEnv.VERCEL_OIDC_TOKEN;
  delete cliEnv.BLOB_STORE_ID;
  const result = spawnSync(
    process.platform === "win32" ? "cmd" : "npx",
    process.platform === "win32"
      ? ["/c", "npx", "vercel@latest", "blob", "put", inputPath, "--pathname", pathname, "--access", "public", "--allow-overwrite", "--scope", scope]
      : ["vercel@latest", "blob", "put", inputPath, "--pathname", pathname, "--access", "public", "--allow-overwrite", "--scope", scope],
    { cwd: process.cwd(), encoding: "utf8", env: cliEnv }
  );
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status || 1);
  }
  const combined = `${result.stdout}\n${result.stderr}`;
  const url = combined.match(/https:\/\/\S+\.blob\.vercel-storage\.com\/\S+/)?.[0];
  if (!url) throw new Error("Vercel CLI upload succeeded but no Blob URL was found in output.");
  return { url, pathname };
}

async function loadLocalEnv() {
  try {
    const content = await readFile(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local is optional in CI when env vars are already injected.
  }
}
