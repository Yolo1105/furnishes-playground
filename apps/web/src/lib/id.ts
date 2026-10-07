import { randomBytes } from "node:crypto";

/** a random id for a row the server makes: base64url, `bytes` long
    before encoding (6 for a short link, 8 for the rest) */
export const randomId = (bytes = 8) => randomBytes(bytes).toString("base64url");
