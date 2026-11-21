import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { hall } from "../src/specs/hall.mjs";
import { shell6 } from "../src/specs/shell6.mjs";
import { shell6d } from "../src/specs/shell6d.mjs";
import { shell8 } from "../src/specs/shell8.mjs";
import { renderAFrameSheet } from "../src/render-sheet.mjs";
import { renderCheckpointSheet } from "../src/render-checkpoint.mjs";
import { foundationSchedule } from "../src/foundation-schedule.mjs";
import { renderSiteMap } from "../src/render-site-map.mjs";
import {
  serializableSiteModel,
  siteModel,
  validateSiteModel
} from "../src/site-model.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "dist");
const dataDir = resolve(root, "output", "data");
const cleanHtml = (html) => html.replace(/[ \t]+$/gm, "");
const summarizeSpec = (spec) => {
  const startDoors = spec.doors.endGableStartCenters ?? spec.doors.endGableCenters ?? [];
  const endDoors = spec.doors.endGableEndCenters ?? spec.doors.endGableCenters ?? [];
  const exteriorSideDoors = spec.doors.sideDoor?.enabled === false
    ? 0
    : (spec.doors.sideDoor?.setCount ?? (spec.doors.sideDoor?.oppositeSideDashed ? 2 : 1));
  const internalDoors = spec.doors.internalDoorPair?.enabled ? 2 : 0;
  const extensionLengthMm = spec.dimensions.extensionLengthMm ?? 0;
  return {
    id: spec.id,
    name: spec.name,
    drawingNumber: spec.drawingNumber,
    revision: spec.revision,
    status: spec.status,
    dimensions: {
      closedLengthMm: spec.dimensions.closedLengthMm,
      extensionLengthMm,
      totalLengthMm: spec.dimensions.closedLengthMm + extensionLengthMm,
      widthMm: spec.dimensions.widthMm,
      heightMm: spec.dimensions.heightMm
    },
    structure: {
      stations: spec.structure.stations,
      bays: spec.structure.bays,
      extensionFrames: spec.structure.extension?.enabled ? spec.structure.extension.frames : 0
    },
    foundation: {
      anchorCount: foundationSchedule(spec).anchors.length,
      anchorSizeMm: { ...spec.foundation.concreteAnchor }
    },
    doors: {
      endGableSets: startDoors.length + endDoors.length,
      exteriorSideSets: exteriorSideDoors,
      internalSets: internalDoors,
      totalShownSets: startDoors.length + endDoors.length + exteriorSideDoors + internalDoors,
      emergencyColor: spec.doors.emergencyColor
    }
  };
};

await mkdir(outDir, { recursive: true });
await mkdir(dataDir, { recursive: true });
const foundationSchedules = [];
const drawingSummaries = [];
for (const spec of [hall, shell6, shell6d, shell8]) {
  await writeFile(
    resolve(outDir, `${spec.id}.html`),
    cleanHtml(renderAFrameSheet(spec)),
    "utf8"
  );
  await writeFile(
    resolve(outDir, `${spec.id}-checkpoint.html`),
    cleanHtml(renderCheckpointSheet(spec)),
    "utf8"
  );
  foundationSchedules.push(foundationSchedule(spec));
  drawingSummaries.push(summarizeSpec(spec));
  console.log(`Built dist/${spec.id}.html and dist/${spec.id}-checkpoint.html`);
}
await writeFile(
  resolve(dataDir, "foundation-coordinates.json"),
  `${JSON.stringify(foundationSchedules, null, 2)}\n`,
  "utf8"
);
console.log("Built output/data/foundation-coordinates.json");
await writeFile(
  resolve(dataDir, "drawing-summary.json"),
  `${JSON.stringify(drawingSummaries, null, 2)}\n`,
  "utf8"
);
console.log("Built output/data/drawing-summary.json");

const siteModelErrors = validateSiteModel(siteModel);
if (siteModelErrors.length > 0) {
  throw new Error(`Invalid site model:\n- ${siteModelErrors.join("\n- ")}`);
}
await writeFile(
  resolve(dataDir, "site-model.json"),
  `${JSON.stringify(serializableSiteModel(siteModel), null, 2)}\n`,
  "utf8"
);
console.log("Built output/data/site-model.json");
await writeFile(resolve(outDir, "site-map.html"), cleanHtml(renderSiteMap(siteModel)), "utf8");
console.log("Built dist/site-map.html");
