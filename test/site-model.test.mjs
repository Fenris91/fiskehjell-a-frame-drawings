import test from "node:test";
import assert from "node:assert/strict";
import { hall } from "../src/specs/hall.mjs";
import { shell6 } from "../src/specs/shell6.mjs";
import { shell6d } from "../src/specs/shell6d.mjs";
import { shell8 } from "../src/specs/shell8.mjs";
import {
  pointInsidePerimeter,
  siteMetrics,
  siteModel,
  structureCorners,
  validateSiteModel
} from "../src/site-model.mjs";

test("site model validates", () => {
  assert.deepEqual(validateSiteModel(siteModel), []);
});

test("A-frame site dimensions match the authoritative building specs", () => {
  const specs = new Map([
    ["hall", hall],
    ["shell6", shell6],
    ["shell6d", shell6d],
    ["shell8", shell8]
  ]);

  for (const structure of siteModel.structures.filter(
    ({ category }) => category === "aframe"
  )) {
    const spec = specs.get(structure.id);
    assert.ok(spec, `missing spec for ${structure.id}`);
    assert.ok(Math.abs(structure.width * 1000 - spec.dimensions.widthMm) < 0.001);
    assert.ok(Math.abs(structure.length * 1000 - spec.dimensions.closedLengthMm) < 0.001);
    assert.ok(Math.abs(structure.height * 1000 - spec.dimensions.heightMm) < 0.001);
  }
});

test("all default structure footprint corners are inside the perimeter", () => {
  for (const structure of siteModel.structures) {
    for (const corner of structureCorners(structure)) {
      assert.ok(
        pointInsidePerimeter(corner),
        `${structure.id} corner E${corner.east.toFixed(2)} N${corner.north.toFixed(2)} is outside`
      );
    }
  }
});

test("the example site keeps its stated size and encloses every structure", () => {
  const metrics = siteMetrics();
  assert.equal(metrics.structureCount, 12);
  assert.equal(metrics.enclosedStructureCount, 12);
  assert.equal(metrics.eastWestSpan, 90);
  assert.equal(metrics.northSouthSpan, 70);
  assert.ok(Math.abs(metrics.borderLength - 311.8) < 0.1);
});

test("no two example structures overlap", () => {
  // Every example footprint is axis-aligned (0 or 90 degrees), so boxes are exact.
  const boxes = siteModel.structures.map((structure) => {
    assert.ok([0, 90].includes(structure.angleDeg), `${structure.id} must stay axis-aligned`);
    const corners = structureCorners(structure);
    const east = corners.map((corner) => corner.east);
    const north = corners.map((corner) => corner.north);
    return { id: structure.id, e0: Math.min(...east), e1: Math.max(...east), n0: Math.min(...north), n1: Math.max(...north) };
  });
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i], b = boxes[j];
      const apart = a.e1 <= b.e0 || b.e1 <= a.e0 || a.n1 <= b.n0 || b.n1 <= a.n0;
      assert.ok(apart, `${a.id} overlaps ${b.id}`);
    }
  }
});

test("site model retains outdoor, dock and circulation layers", () => {
  assert.deepEqual(
    siteModel.zones.map(({ kind }) => kind),
    ["outdoor", "dock", "circulation"]
  );
  assert.equal(siteModel.exits.length, 4);
});

test("validation rejects coordinate drift and out-of-bounds footprints", () => {
  const movedReference = structuredClone(siteModel);
  movedReference.structures[0].east = 1;
  assert.match(validateSiteModel(movedReference).join("\n"), /E=0, N=0/);

  const outside = structuredClone(siteModel);
  outside.structures.find(({ id }) => id === "shell6d").east = 1000;
  assert.match(validateSiteModel(outside).join("\n"), /outside the perimeter/);
});

test("the site map is drawn from the model: every structure, zone and gate, nothing else", async () => {
  const { renderSiteMap } = await import("../src/render-site-map.mjs");
  const page = renderSiteMap();
  // The drawing only; the page's editor script follows it.
  const html = page.slice(0, page.indexOf("<script"));
  for (const structure of siteModel.structures) {
    assert.equal(html.split(`data-structure="${structure.id}"`).length - 1, 1, structure.id);
    assert.ok(html.includes(`>${structure.name}<`), `${structure.name} is labelled`);
  }
  assert.equal(html.split("data-structure=").length - 1, siteModel.structures.length);
  assert.equal(html.split("data-zone=").length - 1, siteModel.zones.length);
  assert.equal(html.split("data-exit=").length - 1, siteModel.exits.length);
  assert.match(html, /INVENTED EXAMPLE LAYOUT/);

  // Moving a structure in the model moves it on the map.
  const moved = structuredClone(siteModel);
  moved.structures.find(({ id }) => id === "sauna").north = -24;
  assert.notEqual(renderSiteMap(moved), page);

  // An invalid model is refused instead of drawn.
  const outside = structuredClone(siteModel);
  outside.structures.find(({ id }) => id === "sauna").east = 500;
  assert.throws(() => renderSiteMap(outside), /outside the perimeter/);
});

test("a structure at any angle is drawn with readable text and tested for overlap", async () => {
  const { cornersOf, footprintsOverlap, siteMapView, structureMarkup } = await import("../src/render-site-map.mjs");
  const view = siteMapView();
  const hall = siteModel.structures.find(({ id }) => id === "hall");
  // Rotating by 180 degrees is the same footprint, and the name is never upside down.
  for (const angleDeg of [0, 30, 90, 135, 180, -120]) {
    const markup = structureMarkup({ ...hall, angleDeg }, view);
    const turn = Number(/rotate\((-?[\d.]+) /.exec(markup)?.[1] ?? 0);
    assert.ok(turn >= -90 && turn <= 90, `${angleDeg} degrees turns the text ${turn}`);
  }
  const sorted = (corners) => corners.map(([e, n]) => `${e.toFixed(6)},${n.toFixed(6)}`).sort();
  assert.deepEqual(sorted(cornersOf({ ...hall, angleDeg: 180 })), sorted(cornersOf(hall)));

  const box = { east: 0, north: 0, width: 4, length: 10, angleDeg: 0 };
  assert.equal(footprintsOverlap(box, { ...box, east: 3 }), true);
  assert.equal(footprintsOverlap(box, { ...box, east: 4 }), false, "touching walls do not overlap");
  // Diagonal neighbours: bounding boxes cross, footprints do not.
  assert.equal(footprintsOverlap({ ...box, angleDeg: 45 }, { ...box, angleDeg: 45, east: 5, north: -5 }), false);
  assert.equal(footprintsOverlap({ ...box, angleDeg: 45 }, { ...box, angleDeg: -45 }), true);
});

test("the page carries the editor and its data, and the exporter asks for the static drawing", async () => {
  const { renderSiteMap } = await import("../src/render-site-map.mjs");
  const { readFile } = await import("node:fs/promises");
  const page = renderSiteMap();
  const data = JSON.parse(/<script type="application\/json" id="site-data">(.*?)<\/script>/s.exec(page)[1]);
  assert.equal(data.structures.length, siteModel.structures.length);
  assert.equal(data.origin, "hall");
  assert.match(page, /location\.hash === "#static"/);
  assert.match(page, /startEditor\(\);/);
  const exporter = await readFile(new URL("../scripts/export.py", import.meta.url), "utf8");
  assert.match(exporter, /site-map\.html"[\s\S]*#static/);
});
