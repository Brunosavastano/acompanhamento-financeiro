import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { XLSX_FORMATS, excelMonth } from "@/lib/export-workbook";
import { writeExportWorkbook } from "@/server/export-workbook";

describe("writeExportWorkbook", () => {
  it("writes numbers as numbers with their Excel format, plus column widths and the header filter", () => {
    const buffer = writeExportWorkbook([
      {
        name: "Resumo mensal",
        rows: [
          ["Mês", "Patrimônio líquido", "Taxa de poupança"],
          [{ value: excelMonth("2026-10"), format: XLSX_FORMATS.month }, { value: 275223.18, format: XLSX_FORMATS.money }, null],
          [{ value: excelMonth("2026-11"), format: XLSX_FORMATS.month }, { value: -1234.5, format: XLSX_FORMATS.money }, { value: 0.115, format: XLSX_FORMATS.percent }],
          [],
          ["Nota de rodapé"],
        ],
        widths: [9, 21, 19],
        filterRows: 3,
      },
      { name: "Metas", rows: [["Meta"], ["CFA"]], widths: [12] },
    ]);

    const workbook = XLSX.read(buffer, { type: "buffer", cellNF: true, cellStyles: true });
    expect(workbook.SheetNames).toEqual(["Resumo mensal", "Metas"]);
    const summary = workbook.Sheets["Resumo mensal"];
    expect(summary.A1).toMatchObject({ t: "s", v: "Mês" });
    expect(summary.A2).toMatchObject({ t: "n", v: 46296, z: "mmm/yy" });
    expect(summary.B2).toMatchObject({ t: "n", v: 275223.18, z: XLSX_FORMATS.money });
    expect(summary.B3).toMatchObject({ t: "n", v: -1234.5, z: XLSX_FORMATS.money });
    expect(summary.C3).toMatchObject({ t: "n", v: 0.115, z: "0.0%" });
    // Célula vazia não vira zero nem texto vazio.
    expect(summary.C2).toBeUndefined();
    expect(summary.A5).toMatchObject({ t: "s", v: "Nota de rodapé" });
    expect(summary["!cols"]?.map((column) => column.wch)).toEqual([9, 21, 19]);
    expect(summary["!autofilter"]).toEqual({ ref: "A1:C3" });
    expect(workbook.Sheets.Metas["!autofilter"]).toBeUndefined();
  });
});
