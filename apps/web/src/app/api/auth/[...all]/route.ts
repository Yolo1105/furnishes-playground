import { toNextJsHandler } from "better-auth/next-js";
import { authReady, getAuth } from "@/lib/auth";

/** every account route, served by Better Auth once the database is
    migrated */
export const runtime = "nodejs";

const serve = async (req: Request, method: "GET" | "POST") => {
  await authReady();
  return toNextJsHandler(getAuth())[method](req);
};
export const GET = (req: Request) => serve(req, "GET");
export const POST = (req: Request) => serve(req, "POST");
