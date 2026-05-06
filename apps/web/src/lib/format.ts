import Decimal from "decimal.js";

export function toDecimalNumber(value: unknown): number {
  if (value instanceof Decimal) return value.toNumber();
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value ?? 0);
}

export function currency(value: number | Decimal | null | undefined): string {
  const numeric = value instanceof Decimal ? value.toNumber() : Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function percent(value: number | Decimal | null | undefined, digits = 1): string {
  const numeric = value instanceof Decimal ? value.toNumber() : Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}

export function number(value: number | Decimal | null | undefined, digits = 2): string {
  const numeric = value instanceof Decimal ? value.toNumber() : Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}
