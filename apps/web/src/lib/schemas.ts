import { z } from "zod";
import { LINE_MIN, PHONE, POSTAL, RECIPIENT_MIN } from "./address";
import { EMAIL, EMAIL_MAX } from "./email";

/** the fields more than one route reads, checked the one way */
export const EmailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX)
  .regex(EMAIL);

export const AddressSchema = z.object({
  recipient: z.string().trim().min(RECIPIENT_MIN).max(80),
  line1: z.string().trim().min(LINE_MIN).max(200),
  postal: z.string().trim().regex(POSTAL),
  phone: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(z.string().regex(PHONE)),
});

/** the one shape every route answers a bad request or a refusal with */
export const BAD_REQUEST = { error: "bad request" } as const;
