/**
 * The shop is in Kenya, so receipts and reports show Nairobi time whatever
 * the device clock is set to.
 */
export const SHOP_TIME_ZONE = "Africa/Nairobi";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateOnly = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const timeOnly = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatDateTime(epochMs: number): string {
  return dateTime.format(new Date(epochMs));
}

export function formatDate(epochMs: number): string {
  return dateOnly.format(new Date(epochMs));
}

export function formatTime(epochMs: number): string {
  return timeOnly.format(new Date(epochMs));
}

/** Start of a Nairobi day, as epoch ms, for report and list filters. */
export function startOfShopDay(epochMs: number): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epochMs));
  // Kenya is UTC+3 year round, with no daylight saving to account for.
  return Date.parse(`${parts}T00:00:00+03:00`);
}

export function endOfShopDay(epochMs: number): number {
  return startOfShopDay(epochMs) + 24 * 60 * 60 * 1000 - 1;
}

/** Parses a yyyy-mm-dd picker value into the start of that Nairobi day. */
export function shopDayFromInput(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const ms = Date.parse(`${value}T00:00:00+03:00`);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Formats an epoch as the yyyy-mm-dd a date input expects. */
export function toDateInput(epochMs: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(epochMs));
}
