import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { elevation, extrude, obliqueView, profiles, projectSolid, stationRun } from "../src/geometry.mjs";
import { renderAFrameSheet } from "../src/render-sheet.mjs";
import { renderCheckpointSheet } from "../src/render-checkpoint.mjs";
import { hall } from "../src/specs/hall.mjs";
import { shell6 } from "../src/specs/shell6.mjs";
import { shell6d } from "../src/specs/shell6d.mjs";
import { shell8 } from "../src/specs/shell8.mjs";

const clean = (html) => html.replace(/[ \t]+$/gm, "");
const golden = (name) => readFile(new URL(`./golden/${name}.html`, import.meta.url), "utf8");

test("every sheet still matches its saved drawing", async () => {
  for (const spec of [hall, shell6, shell6d, shell8]) {
    assert.equal(clean(renderAFrameSheet(spec)), await golden(spec.id), `${spec.id} sheet`);
    assert.equal(clean(renderCheckpointSheet(spec)), await golden(`${spec.id}-checkpoint`), `${spec.id} checkpoint`);
  }
});

test("a profile extruded through stations gives frames, rails and true distances", () => {
  const profile = profiles.aframe({ widthMm: 12000, heightMm: 10500 });
  const solid = extrude(profile, [stationRun("F", 6)], { lengthMm: 13500 });
  assert.equal(Object.keys(solid.nodes).length, 18);
  assert.equal(solid.edges.filter(([, , kind]) => kind === "frame").length, 18);
  assert.equal(solid.edges.filter(([, , kind]) => kind === "rail").length, 15);
  assert.deepEqual(
    { x: solid.nodes.F3C.x, y: solid.nodes.F3C.y, z: solid.nodes.F3C.z },
    { x: 5400, y: 6000, z: 10500 },
    "the apex at the third of six frames"
  );
  assert.equal(solid.nodes.F6A.x, 13500);
});

test("separate runs leave a gap: no rail crosses from one run to the next", () => {
  const profile = profiles.aframe({ widthMm: 12000, heightMm: 10500 });
  const solid = extrude(profile, [stationRun("E", 2, 0, 0.2), stationRun("F", 3, 0.4, 1)], { lengthMm: 10000 });
  assert.ok(!solid.edges.some(([from, to]) => from.startsWith("E") && to.startsWith("F")));
  assert.equal(solid.nodes.F1A.x, 4000);
});

test("an oblique view places the section's corners where its vectors say", () => {
  const profile = profiles.aframe({ widthMm: 12000, heightMm: 10500 });
  const view = obliqueView({ origin: [100, 500], along: [200, -80], across: [40, 30], up: [0, -100] });
  assert.deepEqual(view.at(profile, 0, profile.vertices.A), [100, 500]);
  assert.deepEqual(view.at(profile, 0, profile.vertices.B), [140, 530]);
  assert.deepEqual(view.at(profile, 1, profile.vertices.A), [300, 420]);
  assert.deepEqual(view.at(profile, 0.5, profile.vertices.C), [220, 375]);
  const sketch = projectSolid(extrude(profile, [stationRun("F", 2)], { lengthMm: 5000 }), view);
  assert.deepEqual(sketch.nodes.F2B, [340, 450]);
});

test("the end elevation is the profile fitted into its box", () => {
  const section = elevation(profiles.aframe({ widthMm: 12000, heightMm: 10500 }), { left: 560, right: 880, top: 82, base: 330 });
  assert.deepEqual(section.outline, [[720, 82], [560, 330], [880, 330]]);
  assert.equal(section.edges.length, 3);
});

test("bad geometry is refused", () => {
  const profile = profiles.aframe({ widthMm: 12000, heightMm: 10500 });
  assert.throws(() => profiles.aframe({ widthMm: 0, heightMm: 10 }), /positive widthMm/);
  assert.throws(() => extrude(profile, [stationRun("F", 2), stationRun("F", 2)], { lengthMm: 1 }), /Duplicate node/);
  assert.throws(() => extrude(profile, [stationRun("F", 2)], { lengthMm: 0 }), /positive lengthMm/);
  assert.throws(() => stationRun("F", 1), /at least two/);
  assert.throws(() => obliqueView({ origin: [0, 0], along: [1, 1], across: [1], up: [0, 1] }), /across/);
  assert.throws(() => renderAFrameSheet({ ...shell6, structure: { ...shell6.structure, profile: "dome" } }), /Unknown section profile/);
});
