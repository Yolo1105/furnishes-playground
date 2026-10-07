import path from "node:path";
import { str } from "./env";

/** where a local server keeps its files: the PGlite database under
    pglite/ and the kept mail, in DATA_DIR or .data beside the app */
export const dataDir = () =>
  str("DATA_DIR") || path.join(process.cwd(), ".data");
