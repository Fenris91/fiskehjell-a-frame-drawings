import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildingModel } from "../src/building.mjs";
import { buildings, cabin, dome, lavvo, rack, segmentalHall, shed, wedge } from "../src/buildings/index.mjs";
import { convexHull, prismSolid, profiles, radiusAt, revolvedSolid } from "../src/geometry.mjs";
import { renderBuildingSheet } from "../src/render-building.mjs";

const clean = (html) => html.replace(/[ \t]+$/gm, "");
const failed = (model) => model.checks.filter((item) => !item.ok).map((item) => item.text);

test("every example building passes its own audit and matches its saved drawing", async () => {
  assert.equal(buildings.length, 9);
  for (const building of buildings) {
    const model = buildingModel(building);
    assert.deepEqual(failed(model), [], building.id);
    assert.ok(model.checks.length >= 3, `${building.id} is checked`);
    const saved = await readFile(new URL(`./golden/${building.id}.html`, import.meta.url), "utf8");
    assert.equal(clean(renderBuildingSheet(building)), saved, `${building.id} sheet`);
  }
});

test("the sheet has all four views and schedules, with the audit layer off until asked for", () => {
  const html = renderBuildingSheet(cabin);
  for (const label of ["PLAN / PLANTEGNING", "3D SKETCH / 3D-SKISSE", "SIDE ELEVATION / LANGFASADE", "END ELEVATION / GAVLFASADE", "OPENINGS / ÅPNINGER", "KEY FIGURES / NØKKELTALL"]) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, /<svg class="sheet" /);
  assert.match(html, /data-failed="0"/);
  // The audit layer is always in the page, so the switch and #audit can show it.
  assert.match(html, /class="audit-layer"/);
  assert.match(html, /\.audit-layer \{ display: none; \}/);
  assert.match(renderBuildingSheet(cabin, { audit: true }), /<svg class="sheet audit" /);
  for (const opening of cabin.openings) assert.ok(html.includes(`data-opening="${opening.id}"`), opening.id);
  assert.equal(html.split("data-pad=").length - 1, 8, "a pad under each post of four frames");
});

test("box sections: flat, mono-pitch and gable roofs", () => {
  const flat = profiles.box({ widthMm: 4000, wallHeightMm: 2500 });
  assert.equal(flat.heightMm, 2500);
  const mono = profiles.box({ widthMm: 3600, wallHeightMm: 2200, roof: { kind: "monopitch", riseMm: 900 } });
  assert.deepEqual([mono.vertices.E, mono.vertices.D], [[0, 2200], [3600, 3100]], "low on the near side, high on the far side");
  const gable = profiles.box({ widthMm: 6000, wallHeightMm: 2400, roof: { kind: "gable", riseMm: 1500 } });
  assert.deepEqual(gable.vertices.C, [3000, 3900]);
  assert.throws(() => profiles.box({ widthMm: 6000, wallHeightMm: 2400, roof: { kind: "gable" } }), /positive riseMm/);
  assert.throws(() => profiles.box({ widthMm: 6000, wallHeightMm: 2400, roof: { kind: "dome", riseMm: 1 } }), /Unknown roof kind/);
  assert.equal(buildingModel(cabin).facts.roofPitchDeg, 26.6);
  assert.equal(buildingModel(shed).facts.roofPitchDeg, 14);
});

test("arch sections: semicircle, segmental and pointed", () => {
  const semi = profiles.arch({ widthMm: 10000 });
  assert.equal(semi.heightMm, 5000);
  assert.deepEqual(semi.vertices[semi.ridge].map(Math.round), [5000, 5000]);
  // Every point of a semicircle is one radius from the centre of the span.
  for (const [y, z] of Object.values(semi.vertices)) assert.ok(Math.abs(Math.hypot(y - 5000, z) - 5000) < 1e-6);
  const flat = profiles.arch({ widthMm: 12000, riseMm: 3000, kind: "segmental" });
  assert.equal(Math.round(flat.radiusMm), 7500);
  for (const [y, z] of Object.values(flat.vertices)) assert.ok(Math.abs(Math.hypot(y - 6000, z - (3000 - 7500)) - 7500) < 1e-6);
  const pointed = profiles.arch({ widthMm: 8000, riseMm: 7000, kind: "pointed" });
  assert.deepEqual(pointed.vertices[pointed.ridge].map(Math.round), [4000, 7000]);
  assert.deepEqual([pointed.vertices.P0, pointed.vertices.P12], [[0, 0], [8000, 0]]);
  assert.throws(() => profiles.arch({ widthMm: 8000, riseMm: 5000, kind: "segmental" }), /cannot rise more than half/);
  assert.throws(() => profiles.arch({ widthMm: 8000, riseMm: 3000, kind: "pointed" }), /at least half/);
});

test("the A-frame section and the segmental arch are drawn by the same sheet", () => {
  const frame = buildingModel(rack);
  assert.deepEqual(failed(frame), []);
  assert.equal(frame.solid.profile.kind, "aframe");
  // A door fits under the apex of the gable but not out by a foot, where the frame is low.
  const tall = { id: "D9", kind: "door", wall: "start", widthMm: 1800, heightMm: 2200 };
  assert.deepEqual(failed(buildingModel({ ...rack, openings: [{ ...tall, center: 0.5 }] })), []);
  assert.match(failed(buildingModel({ ...rack, openings: [{ ...tall, center: 0.2 }] })).join("|"), /D9: head/);
  // An A-frame has no upright side walls to put an opening in.
  assert.match(failed(buildingModel({ ...rack, openings: [{ ...tall, wall: "near", center: 0.5 }] })).join("|"), /D9: head/);
  const low = buildingModel(segmentalHall);
  assert.deepEqual(failed(low), []);
  assert.equal(Math.round(low.facts.radiusMm), Math.round((6000 ** 2 + 3500 ** 2) / 7000));
  assert.match(renderBuildingSheet(segmentalHall), /Rise \/ Pilhøyde/);
});

test("a diagonal footprint: angled walls have true lengths and bearings", () => {
  const model = buildingModel(wedge);
  const angled = model.walls.find((wall) => wall.id === "W2");
  assert.equal(Math.round(angled.lengthMm), 4243);
  assert.equal(angled.bearingDeg, 45);
  assert.equal(model.facts.areaM2, 61.5);
  // The door on the angled wall stands on that wall, facing out along its normal.
  const door = model.openings.find((opening) => opening.id === "D1");
  for (const corner of door.quad) assert.ok(Math.abs((corner.x - 8000) - corner.y) < 1e-6, "on the line of the angled wall");
  assert.ok(door.normal[0] > 0 && door.normal[1] < 0);
  assert.throws(() => prismSolid({ footprint: [[0, 0], [0, 5], [5, 5], [5, 0]], wallHeightMm: 3 }), /anticlockwise/);
  assert.throws(() => prismSolid({ footprint: [[0, 0], [5, 0]], wallHeightMm: 3 }), /at least three/);
});

test("round footprints: the wall leans in with height", () => {
  const cone = buildingModel(lavvo);
  assert.equal(radiusAt(cone.solid, 0), 4000);
  assert.equal(radiusAt(cone.solid, 3000), 2200);
  const door = cone.openings[0];
  const reach = (corner) => Math.hypot(corner.x - 4000, corner.y - 4000);
  assert.ok(reach(door.quad[3]) < reach(door.quad[0]), "the head of the door is nearer the centre than its foot");
  const hemisphere = buildingModel({ ...dome, form: { ...dome.form, radiusMm: 5000, heightMm: 5000 } });
  for (const z of [0, 1000, 2500, 4000]) assert.ok(Math.abs(Math.hypot(radiusAt(hemisphere.solid, z), z) - 5000) < 120, `a hemisphere at ${z}`);
  assert.ok(Math.abs(buildingModel(dome).facts.areaM2 - Math.PI * 25) < 1e-9);
  assert.throws(() => revolvedSolid({ curve: [[0, 0], [0, 5]] }), /radius above zero/);
});

test("the audit catches openings that do not fit, and does not cry wolf", () => {
  const withOpenings = (openings) => failed(buildingModel({ ...cabin, openings }));
  // Past the end of the wall.
  assert.match(withOpenings([{ id: "W9", kind: "window", wall: "near", center: 0.98, widthMm: 1200, heightMm: 900, sillMm: 900 }]).join("|"), /W9: inside near side/);
  // Taller than a side wall.
  assert.match(withOpenings([{ id: "D9", kind: "door", wall: "far", center: 0.5, widthMm: 900, heightMm: 2600 }]).join("|"), /D9: head at 2600 mm/);
  // The same door fits under the gable, where the wall is higher in the middle...
  assert.deepEqual(withOpenings([{ id: "D9", kind: "door", wall: "start", center: 0.5, widthMm: 900, heightMm: 2600 }]), []);
  // ...but not near the eaves of that gable.
  assert.match(withOpenings([{ id: "D9", kind: "door", wall: "start", center: 0.12, widthMm: 900, heightMm: 2600 }]).join("|"), /D9: head/);
  // Side by side and overlapping.
  assert.match(withOpenings([
    { id: "A", kind: "window", wall: "near", center: 0.4, widthMm: 1500, heightMm: 900, sillMm: 900 },
    { id: "B", kind: "window", wall: "near", center: 0.5, widthMm: 1500, heightMm: 900, sillMm: 900 }
  ]).join("|"), /A and B do not overlap/);
  // A window above a door shares the wall but not the height: no clash.
  assert.deepEqual(withOpenings([
    { id: "A", kind: "door", wall: "start", center: 0.5, widthMm: 900, heightMm: 2000 },
    { id: "B", kind: "window", wall: "start", center: 0.5, widthMm: 900, heightMm: 600, sillMm: 2300 }
  ]), []);
  assert.match(renderBuildingSheet({ ...cabin, openings: [{ id: "W9", kind: "window", wall: "near", center: 0.98, widthMm: 1200, heightMm: 900 }] }), /data-failed="1"/);
});

test("braces report their true length and slope, and bad references are refused", () => {
  const model = buildingModel(shed);
  const cross = model.braces.find((brace) => brace.id === "X1");
  assert.equal(Math.round(cross.lengthMm), Math.round(Math.hypot(2000, 2200)));
  assert.equal(cross.angleDeg, 47.7);
  assert.throws(() => buildingModel({ ...cabin, braces: [{ id: "Z", wall: "roof", from: [0, 0], to: [1, 1] }] }), /unknown wall/);
  assert.throws(() => buildingModel({ ...wedge, braces: [{ id: "Z", station: 1, from: [0, 0], to: [1, 1] }] }), /this form has none/);
  assert.throws(() => buildingModel({ ...cabin, form: { kind: "tower" } }), /Unknown building form/);
});

test("convex hull keeps only the outline", () => {
  assert.equal(convexHull([[0, 0], [4, 0], [4, 3], [0, 3], [2, 1], [1, 2]]).length, 4);
});
