import path from "node:path";
import fs from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = path.resolve(process.cwd(), "../../.embedded-postgres");
const databaseName = "acompanhamento_financeiro";

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port: 5432,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: (message) => process.stdout.write(String(message)),
  onError: (message) => process.stderr.write(`${String(message)}\n`),
});

async function databaseExists(name: string) {
  const client = pg.getPgClient();
  await client.connect();
  try {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    return result.rowCount > 0;
  } finally {
    await client.end();
  }
}

async function main() {
  const versionFile = path.join(databaseDir, "PG_VERSION");
  await fs.access(versionFile).catch(async () => {
    await pg.initialise();
  });

  await pg.start();

  if (!(await databaseExists(databaseName))) {
    await pg.createDatabase(databaseName);
  }

  console.log(`Embedded Postgres ready on localhost:5432/${databaseName}`);
  await new Promise(() => undefined);
}

main().catch(async (error) => {
  console.error(error);
  await pg.stop().catch(() => undefined);
  process.exit(1);
});
