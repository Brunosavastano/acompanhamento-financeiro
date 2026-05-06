import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function getRequiredHouseholdId(): Promise<string> {
  const session = await auth();
  if (session?.user?.householdId) return session.user.householdId;

  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_NO_AUTH === "true") {
    const household = await prisma.household.findFirst({ orderBy: { createdAt: "asc" } });
    if (household) return household.id;
  }

  throw new Response("Unauthorized", { status: 401 });
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function getRequiredPageHouseholdId(): Promise<string> {
  const session = await auth();
  if (session?.user?.householdId) return session.user.householdId;

  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_NO_AUTH === "true") {
    const household = await prisma.household.findFirst({ orderBy: { createdAt: "asc" } });
    if (household) return household.id;
  }

  redirect("/login");
}
