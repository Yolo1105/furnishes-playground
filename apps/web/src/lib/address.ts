/**
 * A delivery address as the studio takes it, in Singapore only: a
 * recipient, one line (block, street and unit), a six-digit postal
 * code and a local mobile or landline number. The checkout form and
 * the checkout route check the same rules.
 */
export const COUNTRY = "Singapore";
export const POSTAL = /^\d{6}$/;
export const PHONE = /^(\+65\s?)?[689]\d{7}$/;
export const RECIPIENT_MIN = 2;
export const LINE_MIN = 4;

export type Address = {
  recipient: string;
  line1: string;
  postal: string;
  phone: string;
};

/** which fields pass, by name */
export const validAddress = (a: Address) => ({
  recipient: a.recipient.trim().length >= RECIPIENT_MIN,
  line1: a.line1.trim().length >= LINE_MIN,
  postal: POSTAL.test(a.postal.trim()),
  phone: PHONE.test(a.phone.replace(/\s/g, "")),
});

/** the address as one line, for a letter */
export const addressLine = (
  a: Pick<Address, "recipient" | "line1" | "postal">,
) => `${a.recipient}, ${a.line1}, ${COUNTRY} ${a.postal}`;
