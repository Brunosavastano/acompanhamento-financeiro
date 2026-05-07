import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBacenSelicMetaAnnual } from "@/server/interest-rates";

describe("interest rates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts Bacen Selic percentage to annual decimal rate", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify([{ data: "01/05/2026", valor: "14.75" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rate = await fetchBacenSelicMetaAnnual(new Date("2026-05-01T00:00:00.000Z"));

    expect(rate).toEqual({ annualRate: "0.14750000", providerDate: "01/05/2026" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/bcdata.sgs.432/dados");
  });
});
