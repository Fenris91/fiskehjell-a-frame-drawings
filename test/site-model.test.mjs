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
  const html = renderSiteMap();
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
  assert.notEqual(renderSiteMap(moved), html);

  // An invalid model is refused instead of drawn.
  const outside = structuredClone(siteModel);
  outside.structures.find(({ id }) => id === "sauna").east = 500;
  assert.throws(() => renderSiteMap(outside), /outside the perimeter/);
});
