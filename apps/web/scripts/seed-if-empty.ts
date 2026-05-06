import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function runSeed() {
  return new Promise<void>((resolve, reject) => {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const npmExecPath = process.env.npm_execpath;
    const command = npmExecPath ? process.execPath : npmCommand;
    const args = npmExecPath ? [npmExecPath, "run", "prisma:seed"] : ["run", "prisma:seed"];
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Seed saiu com codigo ${code}`));
    });
  });
}

async function main() {
  const [households, users] = await Promise.all([
    prisma.household.count(),
    prisma.user.count(),
  ]);

  if (households > 0 && users > 0) {
    console.log("Seed ignorado: banco ja possui household e usuario.");
    return;
  }

  console.log("Banco sem household/usuario. Rodando seed inicial.");
  await runSeed();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
