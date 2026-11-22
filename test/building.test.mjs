import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildingModel } from "../src/building.mjs";
import { buildings, cabin, dome, lavvo, lodge, rack, segmentalHall, shed, taper, wedge } from "../src/buildings/index.mjs";
import { convexHull, prismSolid, profiles, radiusAt, revolvedSolid, roofOver } from "../src/geometry.mjs";
import { renderBuildingSheet } from "../src/render-building.mjs";

const clean = (html) => html.replace(/[ \t]+$/gm, "");
const failed = (model) => model.checks.filter((item) => !item.ok).map((item) => item.text);

test("every example building passes its own audit and matches its saved drawing", async () => {
  assert.equal(buildings.length, 11);
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
  assert.equal(buildingModel({ ...wedge, form: { ...wedge.form, roof: undefined } }).facts.heightMm, 3000, "flat unless a roof is asked for");
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

test("a roof is the lowest of its planes: mono-pitch, gable and hip over a rectangle", () => {
  const rect = [[0, 0], [8000, 0], [8000, 6000], [0, 6000]];
  const rise = (degrees, run) => Math.tan(degrees * Math.PI / 180) * run;
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);
  const mono = roofOver(rect, 2400, { kind: "monopitch", pitchDeg: 10 });
  near(mono.heightAt(4000, 0), 2400); near(mono.heightAt(4000, 6000), 2400 + rise(10, 6000));
  const gable = roofOver(rect, 2400, { kind: "gable", pitchDeg: 30 });
  near(gable.heightAt(0, 0), 2400); near(gable.heightAt(1234, 3000), 2400 + rise(30, 3000));
  near(gable.heightAt(500, 1000), gable.heightAt(500, 5000));
  assert.equal(gable.faces.length, 2);
  // Turn the ridge and the roof turns with it.
  near(roofOver(rect, 2400, { kind: "gable", pitchDeg: 30, ridge: [0, 1] }).heightAt(4000, 100), 2400 + rise(30, 4000));
  const hip = roofOver(rect, 2400, { kind: "hip", pitchDeg: 30 });
  assert.equal(hip.faces.length, 4);
  near(hip.heightAt(4000, 3000), 2400 + rise(30, 3000));
  near(hip.heightAt(1000, 3000), 2400 + rise(30, 1000));
  for (const [x, y] of rect) near(hip.heightAt(x, y), 2400);
  assert.equal(roofOver(rect, 2400).heightAt(1, 1), 2400);

  const solid = prismSolid({ footprint: rect, wallHeightMm: 2400, roof: { kind: "hip", pitchDeg: 30 } });
  const count = (kind) => solid.edges.filter(([, , k]) => k === kind).length;
  assert.deepEqual([count("roof"), count("ridge"), count("wall")], [4, 5, 4], "four eaves, a ridge and four hips, four corners");
  assert.equal(Math.round(solid.dims.heightMm), Math.round(2400 + rise(30, 3000)));
  const gabled = prismSolid({ footprint: rect, wallHeightMm: 2400, roof: { kind: "gable", pitchDeg: 30 } });
  assert.equal(gabled.edges.filter(([, , k]) => k === "ridge").length, 1);
  assert.equal(gabled.edges.filter(([, , k]) => k === "roof").length, 6, "each gable wall is split where the ridge meets it");
});

test("roofs refuse what they cannot cover", () => {
  const ell = [[0, 0], [6000, 0], [6000, 2000], [2000, 2000], [2000, 6000], [0, 6000]];
  assert.throws(() => roofOver(ell, 3000, { kind: "hip", pitchDeg: 20 }), /without notches/);
  assert.throws(() => roofOver(ell, 3000, { kind: "gable", pitchDeg: 20 }), /without notches/);
  assert.equal(Math.round(roofOver(ell, 3000, { kind: "monopitch", pitchDeg: 10 }).heightAt(0, 6000)), Math.round(3000 + Math.tan(Math.PI / 18) * 6000));
  assert.throws(() => roofOver(ell, 3000, { kind: "monopitch", pitchDeg: 0 }), /pitchDeg between/);
  assert.throws(() => roofOver(ell, 3000, { kind: "monopitch", pitchDeg: 10, rise: [0, 0] }), /direction/);
  assert.throws(() => roofOver(ell, 3000, { kind: "mansard", pitchDeg: 10 }), /Unknown roof kind/);
});

test("walls climb with the roof, and the audit uses the real wall height", () => {
  // The wedge's roof rises toward the far side: its low wall stays at 3000, its high wall is higher.
  const model = buildingModel(wedge);
  const high = 3000 + Math.tan(8 * Math.PI / 180) * 6000;
  assert.equal(Math.round(model.facts.heightMm), Math.round(high));
  const tall = { id: "D9", kind: "door", widthMm: 1000, heightMm: 3400, center: 0.5 };
  assert.match(failed(buildingModel({ ...wedge, openings: [{ ...tall, wall: 1 }] })).join("|"), /D9: head at 3400 mm/, "too tall for the low wall");
  assert.deepEqual(failed(buildingModel({ ...wedge, openings: [{ ...tall, wall: 4 }] })), [], "fits the high wall");
  // Under a gable the end wall is highest under the ridge and lowest at the eaves.
  const gableEnd = { id: "W9", kind: "window", wall: 4, widthMm: 1200, heightMm: 1500, sillMm: 2200 };
  assert.deepEqual(failed(buildingModel({ ...taper, openings: [{ ...gableEnd, center: 0.5 }] })), []);
  assert.match(failed(buildingModel({ ...taper, openings: [{ ...gableEnd, center: 0.15 }] })).join("|"), /W9: head/);
  for (const building of [lodge, taper, wedge]) {
    assert.match(buildingModel(building).checks.map((item) => item.text).join("|"), /roof at \d+°: eaves from/);
    assert.match(renderBuildingSheet(building), /Roof pitch \/ Takvinkel/);
  }
  // Five walls: a hip from each of the five corners, and two ridges where they meet.
  assert.equal(renderBuildingSheet(lodge).split('class="ridge-line"').length - 1, 7, "the lodge's hips and ridges are drawn on its plan");
});

test("audit detail is numbered on the plan and written out in a list", () => {
  const html = renderBuildingSheet(wedge, { audit: true });
  const markers = html.split('class="keynote" data-keynote=').length - 1;
  // Four openings, five walls and one brace.
  assert.equal(markers, 10);
  assert.equal(html.split('class="keynote-key"').length - 1, markers, "every marker has its line in the list");
  assert.match(html, /KEYNOTES \/ NØKKELNOTER/);
  assert.match(html, />W2: 4 243 mm long, bearing 45°</);
  assert.match(html, />D1 door, wall 2: 1 521 from the wall start, 1 200 wide, sill 0, head 2 100</);
  // No two markers share a spot.
  const spots = [...html.matchAll(/class="keynote" data-keynote="\d+"><circle cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  for (let i = 0; i < spots.length; i += 1) for (let j = i + 1; j < spots.length; j += 1) {
    assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) >= 13, `markers ${i + 1} and ${j + 1} overlap`);
  }
});

test("an opening on a framed wall must sit in a bay, never across a frame post", () => {
  // The cabin's first layout: a door across frame 2 and a window across frame 3.
  const crossing = { ...cabin, openings: [
    { id: "D1", kind: "door", wall: "near", center: 0.3, widthMm: 900, heightMm: 2100 },
    { id: "W1", kind: "window", wall: "near", center: 0.72, widthMm: 1500, heightMm: 1200, sillMm: 900 }
  ] };
  const found = failed(buildingModel(crossing)).join("\n");
  assert.match(found, /D1: crosses the frame at x 3000 on near side/);
  assert.match(found, /W1: crosses the frame at x 6000 on near side/);
  // Running into a post (within half a wall thickness of the frame) also counts; ending at its face is fine.
  const touching = { ...cabin, openings: [{ id: "W9", kind: "window", wall: "near", center: (3000 - 50 - 600) / 9000, widthMm: 1200, heightMm: 1200, sillMm: 900 }] };
  assert.match(failed(buildingModel(touching)).join("\n"), /W9: crosses the frame at x 3000/);
  const atFace = { ...cabin, openings: [{ id: "W8", kind: "window", wall: "near", center: (3000 - 100 - 600) / 9000, widthMm: 1200, heightMm: 1200, sillMm: 900 }] };
  assert.deepEqual(failed(buildingModel(atFace)), []);
  // End walls run across the frames, so they are not checked for it.
  const model = buildingModel(cabin);
  assert.ok(model.checks.some((c) => c.ok && /D1: sits in a bay on near side/.test(c.text)));
  assert.ok(!model.checks.some((c) => /W2: .*bay/.test(c.text)));
});

test("elevations draw doors and windows with frames, glass, sills and a lever at 1 050 mm", () => {
  const html = renderBuildingSheet(cabin);
  const side = html.slice(html.indexOf('id="side-view"'), html.indexOf('id="end-view"'));
  assert.equal((side.match(/class="glass"/g) || []).length, 2, "W1 and W4, one sash each");
  assert.equal((side.match(/class="sill-board"/g) || []).length, 2);
  assert.equal((side.match(/class="leaf"/g) || []).length, 1, "a 1 000 mm door has one leaf");
  assert.equal((side.match(/class="handle-lever"/g) || []).length, 1);
  const wide = renderBuildingSheet({ ...cabin, openings: [{ id: "D9", kind: "door", wall: "near", center: 0.5, widthMm: 1600, heightMm: 2100 }, { id: "W9", kind: "window", wall: "far", center: 0.5, widthMm: 1800, heightMm: 1200, sillMm: 900 }] });
  const wideSide = wide.slice(wide.indexOf('id="side-view"'), wide.indexOf('id="end-view"'));
  assert.equal((wideSide.match(/class="leaf"/g) || []).length, 2, "a 1 600 mm door is a pair of leaves");
});
