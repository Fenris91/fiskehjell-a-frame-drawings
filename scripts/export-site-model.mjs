import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  serializableSiteModel,
  siteModel,
  validateSiteModel
} from "../src/site-model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dataDir = resolve(root, "output", "data");
const errors = validateSiteModel(siteModel);

if (errors.length > 0) {
  throw new Error(`Invalid site model:\n- ${errors.join("\n- ")}`);
}

await mkdir(dataDir, { recursive: true });
await writeFile(
  resolve(dataDir, "site-model.json"),
  `${JSON.stringify(serializableSiteModel(siteModel), null, 2)}\n`,
  "utf8"
);

console.log("Built output/data/site-model.json");
