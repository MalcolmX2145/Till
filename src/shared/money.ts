// All money in the app is integer cents of KES. Never floats.

export function formatKes(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}KSh ${whole.toLocaleString("en-KE")}.${String(frac).padStart(2, "0")}`;
}

/** Parse user input like "1,250.50" into 125050 cents. Returns null if invalid. */
export function parseKes(input: string): number | null {
  const cleaned = input.replace(/[,\s]|KSh/gi, "").trim();
  if (cleaned === "" || !/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [whole = "0", frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}
