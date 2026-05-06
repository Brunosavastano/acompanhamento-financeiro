import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const accountDefinitions = [
  { person: "Bruno", name: "Nubank", accountType: "cash" as const },
  { person: "Bruno", name: "VR", accountType: "benefit" as const },
  { person: "Bruno", name: "VA", accountType: "benefit" as const },
  { person: "Bruno", name: "Investimentos", accountType: "investment" as const },
  { person: "Bruno", name: "Cashback", accountType: "cashback" as const },
  { person: "Tatiane", name: "Caixa", accountType: "cash" as const },
  { person: "Tatiane", name: "Investimentos", accountType: "investment" as const },
];

async function main() {
  const email = process.env.SEED_EMAIL ?? "bruno@example.com";
  const password = process.env.SEED_PASSWORD ?? "admin123";
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && isUnsafeProductionPassword(password)) {
    throw new Error("Defina SEED_PASSWORD forte antes de rodar seed em producao. A senha padrao/local nao pode ser usada em deploy.");
  }

  const household = await prisma.household.upsert({
    where: { id: "family-savastano" },
    create: { id: "family-savastano", name: "Familia Savastano", baseCurrency: "BRL" },
    update: { name: "Familia Savastano" },
  });

  const bruno = await prisma.person.upsert({
    where: { id: "person-bruno" },
    create: { id: "person-bruno", householdId: household.id, name: "Bruno", role: "owner" },
    update: { householdId: household.id, name: "Bruno", role: "owner" },
  });

  const tatiane = await prisma.person.upsert({
    where: { id: "person-tatiane" },
    create: { id: "person-tatiane", householdId: household.id, name: "Tatiane", role: "spouse" },
    update: { householdId: household.id, name: "Tatiane", role: "spouse" },
  });

  const persons = new Map([
    ["Bruno", bruno],
    ["Tatiane", tatiane],
  ]);

  for (const definition of accountDefinitions) {
    const person = persons.get(definition.person);
    if (!person) continue;
    await prisma.account.upsert({
      where: { personId_name: { personId: person.id, name: definition.name } },
      create: {
        personId: person.id,
        name: definition.name,
        accountType: definition.accountType,
      },
      update: {
        accountType: definition.accountType,
        isActive: true,
      },
    });
  }

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Bruno",
      passwordHash: await bcrypt.hash(password, 12),
      householdId: household.id,
    },
    update: {
      name: "Bruno",
      passwordHash: await bcrypt.hash(password, 12),
      householdId: household.id,
    },
  });

  console.log(isProduction ? `Seeded ${household.name}. Login: ${email}` : `Seeded ${household.name}. Login: ${email} / ${password}`);
}

function isUnsafeProductionPassword(password: string) {
  const blocked = new Set(["admin123", "troque-esta-senha", "password", "senha123"]);
  return password.length < 12 || blocked.has(password.toLowerCase());
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
