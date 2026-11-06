import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

// O módulo guarda em cache o "sim" do banco: cada teste importa uma cópia nova.
async function freshModule() {
  vi.resetModules();
  return import("./position-source");
}

describe("positionSourceForWrite", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("grava digitação como manual sem consultar o banco", async () => {
    const { positionSourceForWrite } = await freshModule();
    await expect(positionSourceForWrite(undefined)).resolves.toBe("manual");
    await expect(positionSourceForWrite("manual")).resolves.toBe("manual");
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("grava ai_extracted quando o banco já tem o valor no enum, e lembra disso", async () => {
    queryRaw.mockResolvedValue([{ ready: true }]);
    const { positionSourceForWrite } = await freshModule();
    await expect(positionSourceForWrite("ai_extracted")).resolves.toBe("ai_extracted");
    await expect(positionSourceForWrite("ai_extracted")).resolves.toBe("ai_extracted");
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("cai para manual enquanto a migration não foi aplicada, e confere de novo depois", async () => {
    queryRaw.mockResolvedValueOnce([{ ready: false }]).mockResolvedValueOnce([{ ready: true }]);
    const { positionSourceForWrite } = await freshModule();
    await expect(positionSourceForWrite("ai_extracted")).resolves.toBe("manual");
    await expect(positionSourceForWrite("ai_extracted")).resolves.toBe("ai_extracted");
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("cai para manual se a consulta falhar", async () => {
    queryRaw.mockRejectedValue(new Error("sem conexão"));
    const { positionSourceForWrite } = await freshModule();
    await expect(positionSourceForWrite("ai_extracted")).resolves.toBe("manual");
  });
});
