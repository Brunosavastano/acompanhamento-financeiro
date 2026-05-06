export function asMonthStart(value: string | Date): Date {
  if (typeof value === "string") {
    const normalized = value.length === 7 ? `${value}-01` : value;
    const [year, month] = normalized.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1));
  }
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export function formatPeriod(value: string | Date): string {
  const date = asMonthStart(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function displayMonth(value: string | Date): string {
  const date = asMonthStart(value);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function nextMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
}

const ptMonthIndexes = new Map([
  ["jan", 0],
  ["janeiro", 0],
  ["fev", 1],
  ["fevereiro", 1],
  ["mar", 2],
  ["marco", 2],
  ["abr", 3],
  ["abril", 3],
  ["mai", 4],
  ["maio", 4],
  ["jun", 5],
  ["junho", 5],
  ["jul", 6],
  ["julho", 6],
  ["ago", 7],
  ["agosto", 7],
  ["set", 8],
  ["setembro", 8],
  ["out", 9],
  ["outubro", 9],
  ["nov", 10],
  ["novembro", 10],
  ["dez", 11],
  ["dezembro", 11],
]);

export function parseMonthOrNull(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : asMonthStart(value);
  if (!value) return null;
  const text = value.trim();
  const isoMatch = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(text);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    if (month >= 1 && month <= 12) return new Date(Date.UTC(year, month - 1, 1));
  }

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const ptMatch = /^([a-z]+)[/ -]+(\d{2}|\d{4})$/.exec(normalized);
  if (!ptMatch) return null;
  const month = ptMonthIndexes.get(ptMatch[1]);
  if (month === undefined) return null;
  const rawYear = Number(ptMatch[2]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return new Date(Date.UTC(year, month, 1));
}
