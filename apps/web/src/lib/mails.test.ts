import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { helpReceivedMail, orderPlacedMail, waitlistNoteMail } from "./mails";

/** the studio's letters, kept under a temporary DATA_DIR as a
    development server keeps them */
const dir = mkdtempSync(path.join(tmpdir(), "furnishes-mail-"));
const kept = () =>
  JSON.parse(readFileSync(path.join(dir, "mail.json"), "utf8")) as {
    to: string;
    subject: string;
    text: string;
  }[];
const order = {
  id: "FN-TEST1",
  key: "k1",
  email: "mei@example.com",
  lines: [{ name: "Bookwall", sgd: 1540 }],
  total: 1540,
  address: { recipient: "Mei Lin", line1: "Blk 1 Bedok", postal: "460001" },
};

const was = { dir: process.env.DATA_DIR, key: process.env.RESEND_API_KEY };

describe("mails", () => {
  beforeAll(() => {
    process.env.DATA_DIR = dir;
    delete process.env.RESEND_API_KEY;
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env.DATA_DIR = was.dir;
    process.env.RESEND_API_KEY = was.key;
  });

  it("writes to the buyer in the site's voice, with the pieces and the price", async () => {
    expect(await orderPlacedMail(order)).toBe("kept");
    const [m] = kept();
    expect(m!.to).toBe("mei@example.com");
    expect(m!.subject).toBe("Order FN-TEST1 is placed");
    expect(m!.text).toContain("Hello Mei Lin");
    expect(m!.text).toContain("Bookwall · S$1,540");
    expect(m!.text).toContain("Singapore 460001");
  });

  it("sends nothing to an order with nowhere to go", async () => {
    expect(await orderPlacedMail({ ...order, email: null })).toBe("unsent");
    expect(kept()).toHaveLength(1);
  });

  it("thanks a sender with their own words, and tells the waitlist once", async () => {
    await helpReceivedMail("ask@example.com", "A bench for the balcony.");
    await waitlistNoteMail("wait@example.com");
    const [note, thanks] = kept();
    expect(thanks!.text).toContain("A bench for the balcony.");
    expect(note!.subject).toMatch(/ordering is open$/);
    expect(note!.text).toContain("the only mail the list sends");
  });
});
