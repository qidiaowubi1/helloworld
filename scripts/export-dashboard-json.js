import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildDashboardFromSqlite } from "../server/dashboard-export.js";

const outputPath = resolve(process.cwd(), process.argv[2] || "data/dashboard.json");
const dashboard = buildDashboardFromSqlite();

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");

console.log(`Exported dashboard snapshot to ${outputPath}`);
console.log(`Snapshot lastUpdated=${dashboard.meta.lastUpdated || "none"} assets=${dashboard.assets.length}`);
