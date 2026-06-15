import { spawn } from "node:child_process";

const commands = [
  ["api", "node", ["server/api.js"]],
  ["vite", "npm", ["run", "dev"]]
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, { shell: true, stdio: "pipe" });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code) => {
    if (code) console.error(`[${name}] exited with ${code}`);
  });
  return child;
});

process.on("SIGINT", () => {
  for (const child of children) child.kill("SIGINT");
  process.exit();
});
