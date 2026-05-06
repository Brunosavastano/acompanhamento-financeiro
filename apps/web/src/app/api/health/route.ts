import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [households, users, snapshots] = await Promise.all([
      prisma.household.count(),
      prisma.user.count(),
      prisma.monthlySnapshot.count(),
    ]);

    return Response.json({
      status: "ok",
      database: "ok",
      households,
      users,
      snapshots,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return Response.json(
      {
        status: "error",
        database: "error",
        message,
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
