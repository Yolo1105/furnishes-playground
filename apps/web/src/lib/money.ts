/**
 * Money, in one place: the studio sells in Singapore dollars, shown as
 * "S$1,540" everywhere (Intl gives a bare "$" for SGD in the Singapore
 * locale, so the symbol is set here) and charged in the same currency.
 */
export const CURRENCY = "SGD";

const format = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});
export const sgd = (n: number) =>
  format
    .formatToParts(n)
    .map((p) => (p.type === "currency" ? "S$" : p.value))
    .join("");
