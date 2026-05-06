import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(rootDir, "apps", "web");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;
const port = readPort();
const children = [];

function readPort() {
  const index = process.argv.indexOf("--port");
  const raw = index >= 0 ? process.argv[index + 1] : process.env.PORT;
  const parsed = Number(raw ?? 3001);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3001;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function pipeWithPrefix(child, label) {
  child.stdout?.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
      log(`[${label}] ${line}`);
    }
  });
  child.stderr?.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) {
      log(`[${label}] ${line}`);
    }
  });
}

function spawnProcess(label, args, cwd = rootDir) {
  const command = npmExecPath ? process.execPath : npmCommand;
  const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
  const child = spawn(command, commandArgs, {
    cwd,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipeWithPrefix(child, label);
  children.push(child);
  return child;
}

function runStep(label, args, cwd = rootDir) {
  return new Promise((resolve, reject) => {
    log(`> ${label}`);
    const child = spawnProcess(label, args, cwd);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} saiu com codigo ${code}`));
    });
  });
}

async function runDbStep(label, args, cwd = rootDir) {
  await ensurePostgres();
  try {
    await runStep(label, args, cwd);
  } catch (error) {
    log(`> ${label} falhou. Revalidando Postgres e tentando novamente.`);
    await ensurePostgres();
    await runStep(label, args, cwd);
  }
}

async function ensurePostgres() {
  if (await isPortOpen(5432)) {
    log("> Postgres esta ativo em localhost:5432");
    return;
  }

  log("> Subindo Postgres embutido em localhost:5432");
  spawnProcess("db", ["run", "db:embedded"], rootDir);
  await waitForPort(5432, "Postgres", 90000);
}

function isPortOpen(targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForPort(targetPort, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(targetPort)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} nao abriu a porta ${targetPort} em ${timeoutMs / 1000}s.`);
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

async function main() {
  log("Acompanhamento Financeiro local");

  await ensurePostgres();

  await runStep("prisma:generate", ["run", "prisma:generate"], rootDir);
  await runDbStep("prisma:migrate:deploy", ["run", "prisma:migrate:deploy"], rootDir);
  await runDbStep("db:seed-if-empty", ["run", "db:seed-if-empty"], rootDir);

  if (await isPortOpen(port)) {
    log(`> Next ja esta ativo em http://localhost:${port}`);
    return;
  }

  log(`> Subindo Next em http://localhost:${port}`);
  const next = spawnProcess("web", ["run", "dev", "--", "-p", String(port)], webDir);
  await waitForPort(port, "Next", 90000);
  log(`> App pronto: http://localhost:${port}/dashboard`);

  next.on("exit", (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  shutdown();
  process.exit(1);
});
