import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const envFile = readArgValue("--env-file");
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (envFile) {
  loadEnvFile(path.resolve(rootDir, envFile));
}

const checks = [
  checkRequired("DATABASE_URL"),
  checkDatabaseUrl(),
  checkRequired("AUTH_SECRET"),
  checkAuthSecret(),
  checkRequired("NEXTAUTH_URL"),
  checkNextAuthUrl(),
  checkAuthTrustHost(),
  checkSeedEmail(),
  checkSeedPassword(),
  checkDefaultExcelPath(),
];

const failures = checks.filter((check) => check.level === "fail");
const warnings = checks.filter((check) => check.level === "warn");

for (const check of checks) {
  const marker = check.level === "pass" ? "OK" : check.level === "warn" ? "WARN" : "FAIL";
  process.stdout.write(`[${marker}] ${check.message}\n`);
}

if (warnings.length && args.has("--strict-warnings")) {
  process.stdout.write("\nWarnings tratados como falha por --strict-warnings.\n");
  process.exit(1);
}

if (failures.length) {
  process.stdout.write(`\n${failures.length} falha(s) bloqueiam o deploy.\n`);
  process.exit(1);
}

process.stdout.write("\nPronto para deploy: variaveis essenciais estao consistentes.\n");

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Arquivo de ambiente nao encontrado: ${filePath}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    process.env[key] = value;
  }
}

function checkRequired(name) {
  return process.env[name]?.trim() ? pass(`${name} definido.`) : fail(`${name} ausente.`);
}

function checkDatabaseUrl() {
  const value = process.env.DATABASE_URL ?? "";
  if (!value) return fail("DATABASE_URL ausente.");
  if (!value.startsWith("postgresql://") && !value.startsWith("postgres://")) return fail("DATABASE_URL deve apontar para Postgres.");
  if (/localhost|127\.0\.0\.1/i.test(value)) return fail("DATABASE_URL de producao nao pode apontar para localhost.");
  return pass("DATABASE_URL parece ser Postgres remoto.");
}

function checkAuthSecret() {
  const value = process.env.AUTH_SECRET ?? "";
  if (!value) return fail("AUTH_SECRET ausente.");
  if (value.includes("replace-with") || value.includes("troque") || value.length < 32) {
    return fail("AUTH_SECRET deve ser uma string secreta forte com pelo menos 32 caracteres.");
  }
  return pass("AUTH_SECRET tem tamanho minimo adequado.");
}

function checkNextAuthUrl() {
  const value = process.env.NEXTAUTH_URL ?? "";
  if (!value) return fail("NEXTAUTH_URL ausente.");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return fail("NEXTAUTH_URL de producao deve usar HTTPS.");
    if (/localhost|127\.0\.0\.1/i.test(url.hostname)) return fail("NEXTAUTH_URL de producao nao pode ser localhost.");
    return pass("NEXTAUTH_URL usa HTTPS publico.");
  } catch {
    return fail("NEXTAUTH_URL invalida.");
  }
}

function checkAuthTrustHost() {
  return process.env.AUTH_TRUST_HOST === "true" ? pass("AUTH_TRUST_HOST=true definido.") : warn("AUTH_TRUST_HOST nao esta como true.");
}

function checkSeedEmail() {
  const value = process.env.SEED_EMAIL ?? "";
  if (!value) return warn("SEED_EMAIL ausente; seed usara bruno@example.com se executado.");
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? pass("SEED_EMAIL valido.") : fail("SEED_EMAIL invalido.");
}

function checkSeedPassword() {
  const value = process.env.SEED_PASSWORD ?? "";
  if (!value) return warn("SEED_PASSWORD ausente; seed nao deve ser executado em producao sem senha forte.");
  const blocked = new Set(["admin123", "troque-esta-senha", "password", "senha123"]);
  if (value.length < 12 || blocked.has(value.toLowerCase())) return fail("SEED_PASSWORD de producao deve ter 12+ caracteres e nao pode ser padrao.");
  return pass("SEED_PASSWORD tem tamanho minimo adequado.");
}

function checkDefaultExcelPath() {
  const value = process.env.DEFAULT_EXCEL_PATH ?? "";
  if (!value) return pass("DEFAULT_EXCEL_PATH vazio; importacao por upload recomendada em producao.");
  if (/^[A-Za-z]:[\\/]/.test(value)) return warn("DEFAULT_EXCEL_PATH aponta para caminho local Windows; em producao prefira upload.");
  return pass("DEFAULT_EXCEL_PATH nao parece ser caminho local Windows.");
}

function pass(message) {
  return { level: "pass", message };
}

function warn(message) {
  return { level: "warn", message };
}

function fail(message) {
  return { level: "fail", message };
}
