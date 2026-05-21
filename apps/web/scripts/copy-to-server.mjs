import { cp, rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const src = resolve(here, "..", "dist");
const dest = resolve(here, "..", "..", "server", "public");

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`copied ${src} → ${dest}`);
