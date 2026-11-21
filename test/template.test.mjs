import test from "node:test";
import assert from "node:assert/strict";
import { hall } from "../src/specs/hall.mjs";
import { shell6 } from "../src/specs/shell6.mjs";
import { shell6d } from "../src/specs/shell6d.mjs";
import { shell8 } from "../src/specs/shell8.mjs";
import { normalizeSpec, renderAFrameSheet } from "../src/render-sheet.mjs";
import { foundationSchedule } from "../src/foundation-schedule.mjs";
import { renderCheckpointSheet } from "../src/render-checkpoint.mjs";

const mmLabel = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

test("normalizes one shared station system for every view", () => {
  const spec = normalizeSpec(hall);
  assert.equal(spec.stationRatios.length, 13);
  assert.equal(spec.stationRatios[0], 0);
  assert.equal(spec.stationRatios.at(-1), 1);
  assert.equal(spec.structure.bays, 12);
});

test("rejects inconsistent station and bay counts", () => {
  assert.throws(
    () => normalizeSpec({
      ...hall,
      structure: { ...hall.structure, stations: 13, bays: 11 }
    }),
    /stations must equal bays \+ 1/
  );
});

test("renders all coordinated views and shared dimensions", () => {
  const html = renderAFrameSheet(hall);
  for (const view of ["top-down-view", "gable-view", "axonometric-view", "side-view"]) {
    assert.match(html, new RegExp(`id="${view}"`));
  }
  for (const value of ["27 000", "12 000", "10 500", "11 000"]) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /B1/);
  assert.match(html, /B8/);
  assert.match(html, /L1/);
  assert.match(html, /L2/);
  assert.match(html, /CLEAR PASSAGE \/ ÅPEN PASSASJE/);
  assert.match(html, /clear-interface/);
  assert.match(html, /class="structure-heavy passage-header"/);
  assert.equal((html.match(/class="door gable-middle-door/g) ?? []).length, 2);
});

test("renders continuous concrete rails consistently in plan and side views", () => {
  for (const building of [hall, shell6, shell6d, shell8]) {
    const html = renderAFrameSheet(building);
    assert.equal((html.match(/class="concrete-rail concrete-rail-plan"/g) ?? []).length, 2);
    assert.equal((html.match(/class="concrete-rail concrete-rail-side"/g) ?? []).length, 1);
  }
});

test("keeps views, axes, dimensions, and anchor labels on every building sheet", () => {
  for (const building of [hall, shell6, shell6d, shell8]) {
    const html = renderAFrameSheet(building);
    for (const view of ["top-down-view", "gable-view", "axonometric-view", "side-view"]) {
      assert.match(html, new RegExp(`id="${view}"`));
    }
    for (const axis of ["X", "Y", "Z"]) {
      assert.match(html, new RegExp(`${axis}(?: ·)? (?:LENGTH|WIDTH|HEIGHT)`));
    }
    for (const value of [
      building.dimensions.widthMm,
      building.dimensions.closedLengthMm,
      building.dimensions.heightMm
    ]) {
      assert.match(html, new RegExp(mmLabel(value)));
    }
    for (const label of [...building.anchors.closedLabelsLeft, ...building.anchors.closedLabelsRight]) {
      assert.match(html, new RegExp(label));
    }
  }
});

test("centres plan anchor pads and standardizes two-leaf outward emergency doors", () => {
  const html = renderAFrameSheet(hall);
  assert.equal((html.match(/class="concrete plan-anchor-pad"/g) ?? []).length, 8);
  assert.match(html, /class="concrete plan-anchor-pad"[^>]*x="111"/);
  assert.match(html, /class="concrete plan-anchor-pad"[^>]*x="346"/);
  assert.equal((html.match(/class="concrete extension-anchor-pad"/g) ?? []).length, 4);
  assert.equal((html.match(/class="concrete extension-anchor-pad extension-anchor-pad-side"/g) ?? []).length, 2);
  assert.equal((html.match(/class="concrete-rail extension-connector-plan"/g) ?? []).length, 2);
  assert.equal((html.match(/class="concrete-rail extension-connector-side"/g) ?? []).length, 1);
  assert.match(html, /data-anchor="L1-INNER"/);
  assert.match(html, /data-anchor="L2-INNER"/);
  assert.match(html, /data-anchor="L1-OUTER"/);
  assert.match(html, /data-anchor="L2-OUTER"/);
  assert.doesNotMatch(html, /data-foot="inward"/);
  assert.match(html, /class="station-line clear-interface passage-boundary"[^>]*y2="1205"/);
  assert.match(html, /class="structure-heavy passage-ground-extension"[^>]*y1="1205"[^>]*y2="1205"/);
  assert.match(html, /class="structure-heavy passage-ground-shell"[^>]*y1="1205"[^>]*y2="1205"/);
  assert.doesNotMatch(html, /class="structure-heavy" x1="80" y1="1205" x2="930" y2="1205"/);
  assert.match(html, /class="concrete" data-anchor="B1"[^>]*y="1205" width="36" height="34"/);
  assert.match(html, /class="concrete extension-anchor-pad extension-anchor-pad-side"[^>]*y="1205" width="36" height="34"/);
  assert.equal((html.match(/class="side-door double-leaf-door"/g) ?? []).length, 2);
  assert.ok((html.match(/class="door double-leaf-door"/g) ?? []).length >= 4);
  assert.ok((html.match(/class="door-swing-direction"/g) ?? []).length >= 7);
  for (const paired of [hall, shell6, shell8]) {
    assert.deepEqual(paired.doors.endGableCenters, [0.2, 0.8]);
  }
  assert.deepEqual(shell6d.doors.endGableCenters, [0.5]);
  assert.equal(shell6d.doors.internalDoorPair.leafCount, 2);
  for (const [building, arrowCount] of [[hall, 6], [shell6, 2], [shell6d, 3], [shell8, 2]]) {
    const buildingHtml = renderAFrameSheet(building);
    assert.equal((buildingHtml.match(/class="graph-door-direction/g) ?? []).length, arrowCount);
  }
  assert.equal((html.match(/class="graph-end-door(?: |")/g) ?? []).length, 4);
  assert.equal((html.match(/class="graph-side-door(?: |")/g) ?? []).length, 2);
  assert.equal((html.match(/data-(?:end|side)-door-set=/g) ?? []).length, 6);
  assert.equal((html.match(/class="graph-door-divider/g) ?? []).length, 6);
  assert.equal((html.match(/class="graph-door-direction/g) ?? []).length, 6);
  assert.equal((html.match(/class="graph-door-swing(?: |")/g) ?? []).length, 0);
});

test("stores anchor coordinates and shows one foundation dimension example", () => {
  const hallHtml = renderAFrameSheet(hall);
  assert.match(hallHtml, /data-anchor="B1" data-center-x-mm="0" data-center-y-mm="0" data-size-x-mm="1450" data-size-y-mm="1450" data-depth-mm="1000"/);
  assert.match(hallHtml, /data-anchor="B5" data-center-x-mm="0" data-center-y-mm="12000" data-size-x-mm="1450" data-size-y-mm="1450" data-depth-mm="1000"/);
  assert.match(hallHtml, /data-anchor="L1-INNER" data-center-x-mm="31000"/);
  assert.match(hallHtml, /data-anchor="L1-OUTER" data-center-x-mm="37000"/);
  assert.match(hallHtml, /data-anchor-sample="B1-i-j" data-size-width-mm="1450" data-size-length-mm="1450" data-depth-mm="1000"/);
  assert.match(hallHtml, /4 000 mm PASSAGE/);
  assert.match(hallHtml, /6 000 mm/);
  for (const building of [shell6, shell6d, shell8]) {
    const html = renderAFrameSheet(building);
    assert.match(html, /data-anchor-sample="B1-i-j" data-size-width-mm="1250" data-size-length-mm="1250" data-depth-mm="1000"/);
  }
});

test("exports a consistent coordinate schedule for every concrete anchor", () => {
  const hallSchedule = foundationSchedule(hall);
  assert.equal(hallSchedule.anchors.length, 12);
  assert.deepEqual(hallSchedule.anchors.find(({ id }) => id === "B1"), {
    id: "B1",
    centerMm: { x: 0, y: 0, z: 0 },
    sizeMm: { x: 1450, y: 1450, z: 1000 }
  });
  assert.deepEqual(hallSchedule.anchors.find(({ id }) => id === "L2-OUTER"), {
    id: "L2-OUTER",
    centerMm: { x: 37000, y: 12000, z: 0 },
    sizeMm: { x: 1450, y: 1450, z: 1000 }
  });
  for (const [building, expectedCount] of [[shell6, 4], [shell6d, 4], [shell8, 6]]) {
    const schedule = foundationSchedule(building);
    assert.equal(schedule.anchors.length, expectedCount);
    assert.ok(schedule.anchors.every((anchor) => (
      anchor.sizeMm.x === 1250 && anchor.sizeMm.y === 1250 && anchor.sizeMm.z === 1000
    )));
  }
});

test("renders a checkpoint page from the same building specification", () => {
  for (const building of [hall, shell6, shell6d, shell8]) {
    const html = renderCheckpointSheet(building);
    const schedule = foundationSchedule(building);
    assert.match(html, /PAGE 2 - SPECIFICATION CROSS-CHECK/);
    assert.match(html, /AUTHORITATIVE DIMENSIONS/);
    assert.match(html, /FOUNDATION COORDINATE SCHEDULE/);
    assert.match(html, /id="top-down-layer-states"/);
    assert.equal((html.match(/data-layer-state=/g) ?? []).length, 3);
    assert.match(html, /data-layer-state="structure-mesh" data-layer-kind="mesh"/);
    assert.match(html, /data-layer-state="blocking-insulation" data-layer-kind="insulation"/);
    assert.match(html, /data-layer-state="floor-layer" data-layer-kind="deck"/);
    assert.match(html, /BJELKELAG \+ HØNSENETTING/);
    assert.match(html, /KUBBING \+ ISOLASJON/);
    assert.match(html, /TOPPDEKKE \/ FLOOR LAYER/);
    assert.match(html, new RegExp(mmLabel(building.dimensions.closedLengthMm)));
    assert.match(html, new RegExp(mmLabel(building.dimensions.widthMm)));
    assert.match(html, new RegExp(mmLabel(building.dimensions.heightMm)));
    assert.match(html, new RegExp(`Concrete anchor count \/ Antall betongankre: ${schedule.anchors.length}`));
    for (const anchor of schedule.anchors) {
      assert.match(html, new RegExp(`>${anchor.id}<`));
      assert.match(html, new RegExp(mmLabel(anchor.centerMm.x)));
      assert.match(html, new RegExp(mmLabel(anchor.centerMm.y)));
      assert.match(html, new RegExp(`${anchor.sizeMm.x}\/${anchor.sizeMm.y}\/${anchor.sizeMm.z}`));
    }
  }
});

test("includes Hall extension cross-check dimensions on page two", () => {
  const html = renderCheckpointSheet(hall);
  for (const value of [11000, 38000, 4000, 6000]) {
    assert.match(html, new RegExp(mmLabel(value)));
  }
  for (const id of ["L1-INNER", "L1-OUTER", "L2-INNER", "L2-OUTER"]) {
    assert.match(html, new RegExp(`>${id}<`));
  }
  assert.equal((html.match(/data-extension-divider="true"/g) ?? []).length, 3);
});

test("shares configurable top-down construction layers across all building specs", () => {
  for (const building of [hall, shell6, shell6d, shell8]) {
    const spec = normalizeSpec(building);
    const html = renderCheckpointSheet(building);
    assert.match(html, new RegExp(`\\.layer-door \\{ fill: none; stroke: ${spec.doors.emergencyColor}`));
    assert.deepEqual(spec.checkpoint.topDownLayers.map(({ id }) => id), [
      "structure-mesh",
      "blocking-insulation",
      "floor-layer"
    ]);
    assert.equal(
      (html.match(/data-layer-anchor=/g) ?? []).length,
      foundationSchedule(building).anchors.length * 2,
      `${building.name} must show every concrete anchor in states 1 and 2 only`
    );
    assert.deepEqual(spec.checkpoint.topDownLayers.map(({ showAnchors }) => showAnchors === true), [true, true, false]);
    assert.deepEqual(spec.checkpoint.topDownLayers.map(({ showDoors }) => showDoors === true), [false, false, true]);
    const startDoorCount = (spec.doors.endGableStartCenters ?? spec.doors.endGableCenters ?? []).length;
    const endDoorCount = (spec.doors.endGableEndCenters ?? spec.doors.endGableCenters ?? []).length;
    const sideDoorCount = spec.doors.sideDoor?.enabled !== false ? 2 : 0;
    const internalDoorCount = spec.doors.internalDoorPair?.enabled
      ? (spec.doors.internalDoorPair.centerRatios ?? [0.2, 0.8]).length
      : 0;
    assert.equal(
      (html.match(/data-layer-door-set=/g) ?? []).length,
      startDoorCount + endDoorCount + sideDoorCount + internalDoorCount,
      `${building.name} must show all emergency-door sets in state 3 only`
    );
  }
});

test("owns 3D structure through named nodes and edges", () => {
  const spec = normalizeSpec(hall);
  const nodes = spec.shellGraph.nodes;
  for (const [from, to] of spec.shellGraph.edges) {
    assert.ok(nodes[from], `missing graph node ${from}`);
    assert.ok(nodes[to], `missing graph node ${to}`);
  }
  assert.deepEqual(spec.shellGraph.clearPassage.between, ["E1B", "F1B"]);
  assert.equal(spec.shellGraph.clearPassage.openAtBase, true);

  const html = renderAFrameSheet(hall);
  assert.equal(Object.keys(spec.shellGraph.nodes).length, 51);
  assert.match(html, /data-node="E4A"/);
  assert.match(html, /data-node="F13C"/);
  assert.match(html, /data-from="E1A" data-to="F1A"/);
  assert.match(html, /data-from="E1C" data-to="F1C"/);
  assert.doesNotMatch(html, /data-from="E1B" data-to="F1B"/);
});

test("keeps 3D axes tied to explicit outer extents", () => {
  const spec = normalizeSpec(hall);
  assert.deepEqual(spec.shellGraph.axisExtents.x, spec.shellGraph.nodes.E4A);
  assert.equal(spec.shellGraph.axisExtents.z[1], spec.shellGraph.nodes.F13C[1]);

  const html = renderAFrameSheet(hall);
  assert.match(html, /x1="458" y1="735" x2="560" y2="690"/);
  assert.match(html, /x1="458" y1="735" x2="915" y2="735"/);
  assert.match(html, /x1="458" y1="735" x2="458" y2="470"/);
});

test("describes all six Hall emergency-door sets on the checkpoint page", () => {
  const html = renderCheckpointSheet(hall);
  assert.match(html, /4 end-gable door sets/);
  assert.match(html, /2 long-side sets at X=54%/);
});

test("renders Shell 6 as a six-frame four-corner shell without extension geometry", () => {
  const spec = normalizeSpec(shell6);
  assert.equal(spec.structure.stations, 6);
  assert.equal(spec.structure.bays, 5);
  assert.equal(spec.structure.extension.enabled, false);
  assert.equal(spec.stationRatios.length, 6);
  assert.deepEqual(spec.anchors.closedStationRatios, [0, 1]);
  assert.equal(spec.anchors.closedLabelsLeft.length + spec.anchors.closedLabelsRight.length, 4);
  assert.equal(spec.doors.sideDoor.enabled, false);
  assert.deepEqual(spec.doors.endGableCenters, [0.2, 0.8]);
  assert.equal(spec.bracing.elements.length, 4);
  assert.ok(spec.bracing.elements.every((element) => element.from[0] === 0 && element.to[0] === 1));
  assert.equal(spec.dimensions.closedLengthMm, 13500);

  const html = renderAFrameSheet(shell6);
  assert.match(html, /PLAN SHELL 6/);
  assert.match(html, /SHELL 6 - PLAN AND ELEVATIONS \/ PLAN OG FASADER/);
  assert.match(html, /13 500 mm · 5 BAYS/);
  assert.doesNotMatch(html, /OPEN EXTENSION/);
  assert.doesNotMatch(html, /CLEAR PASSAGE/);
  assert.doesNotMatch(html, /TOTAL ≈/);
  assert.doesNotMatch(html, /class="side-door"/);
  assert.doesNotMatch(html, /class="door axon-door"/);
  assert.doesNotMatch(html, /class="door side-elevation-door"/);
  assert.equal((html.match(/data-wire="near-/g) ?? []).length, 2);
  assert.equal((html.match(/data-wire="far-/g) ?? []).length, 2);
  assert.match(html, /data-wire="near-down" x1="130" y1="835" x2="870" y2="1205"/);
  assert.match(html, /data-wire="near-up" x1="130" y1="1205" x2="870" y2="835"/);
  assert.equal(Object.keys(spec.shellGraph.nodes).length, 18);
  assert.equal(spec.shellGraph.edges.filter((edge) => edge[2] === "frame").length, 18);
  assert.equal(spec.shellGraph.edges.filter((edge) => edge[2] === "rail").length, 15);
  assert.deepEqual(spec.shellGraph.nodeLabels, { F1A: "A", F1B: "B", F1C: "C" });
  assert.equal(spec.shellGraph.anchorNodes.length, 4);
  assert.notDeepEqual(spec.shellGraph.axisExtents.origin, spec.shellGraph.nodes.F1A);
  assert.equal((html.match(/concrete-anchor-node/g) ?? []).length, 4);
  assert.equal((html.match(/class="graph-end-door"/g) ?? []).length, 4);
  assert.equal((html.match(/class="axis-guide"/g) ?? []).length, 2);
  assert.match(html, /class="graph-node-label"[^>]*>A<\/text>/);
  assert.match(html, /class="graph-node-label"[^>]*>B<\/text>/);
  assert.match(html, /class="graph-node-label"[^>]*>C<\/text>/);
  assert.match(html, /B1/);
  assert.match(html, /B4/);
  assert.match(html, /id="axonometric-view"[^>]*translate\(0 -390\)/);
  assert.match(html, /id="gable-view"[^>]*translate\(0 350\)/);
  assert.match(html, /x1="458" y1="735" x2="560" y2="690"/);
  assert.match(html, /x1="458" y1="735" x2="855" y2="735"/);
  assert.match(html, /x1="458" y1="735" x2="458" y2="485"/);
});

test("renders custom building identity without changing renderer code", () => {
  const html = renderAFrameSheet({
    ...hall,
    id: "small-shell",
    name: "SMALL SHELL",
    drawingTitle: "SMALL SHELL — PLAN OG FASADER"
  });
  assert.match(html, /PLAN SMALL SHELL/);
  assert.match(html, /SMALL SHELL — PLAN OG FASADER/);
});

test("renders Shell 6D with two opposed internal doors and one gable-end exit", () => {
  const spec = normalizeSpec(shell6d);
  assert.equal(spec.structure.stations, 6);
  assert.equal(spec.anchors.closedLabelsLeft.length + spec.anchors.closedLabelsRight.length, 4);
  assert.equal(spec.doors.sideDoor.enabled, false);
  assert.equal(spec.doors.internalDoorPair.enabled, true);
  assert.equal(spec.doors.internalDoorPair.stationRatio, 0.6);
  assert.equal(spec.doors.internalDoorPair.opensToward, "end");
  assert.equal(spec.dimensions.closedLengthMm, 13500);
  assert.deepEqual(spec.doors.endGableStartCenters, []);
  assert.deepEqual(spec.doors.endGableEndCenters, [0.5]);

  const html = renderAFrameSheet(shell6d);
  assert.match(html, /PLAN SHELL 6D/);
  assert.equal((html.match(/class="side-door"/g) ?? []).length, 0);
  assert.equal((html.match(/class="internal-door-pair"/g) ?? []).length, 1);
  assert.equal((html.match(/class="graph-side-door(?: |")/g) ?? []).length, 0);
  assert.equal((html.match(/class="graph-internal-door"/g) ?? []).length, 2);
  assert.equal((html.match(/class="graph-end-door"/g) ?? []).length, 2);
  assert.equal((html.match(/class="door gable-door"/g) ?? []).length, 1);
  assert.equal((html.match(/class="door internal-gable-door far-door"/g) ?? []).length, 2);
  assert.equal((html.match(/class="door side-elevation-door"/g) ?? []).length, 0);
  assert.equal((html.match(/class="internal-section-door far-door"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /x="308" y="1135" width="32" height="70"/);
  assert.match(html, /x="870" y="1135" width="32" height="70"/);
});

test("renders Shell 8 with eight frames, six anchors, four corner doors, and one full cross per long wall", () => {
  const spec = normalizeSpec(shell8);
  const middle = 3 / 7;
  assert.equal(spec.structure.stations, 8);
  assert.equal(spec.structure.bays, 7);
  assert.equal(spec.stationRatios.length, 8);
  assert.deepEqual(spec.anchors.closedStationRatios, [0, middle, 1]);
  assert.equal(spec.anchors.closedLabelsLeft.length + spec.anchors.closedLabelsRight.length, 6);
  assert.deepEqual(spec.doors.endGableCenters, [0.2, 0.8]);
  assert.equal(spec.doors.sideDoor.enabled, false);
  assert.equal(spec.bracing.elements.length, 4);
  assert.equal(spec.dimensions.closedLengthMm, 18900);

  const html = renderAFrameSheet(shell8);
  assert.match(html, /PLAN SHELL 8/);
  assert.match(html, /18 900 mm · 7 BAYS/);
  assert.equal((html.match(/data-wire="near-/g) ?? []).length, 2);
  assert.equal((html.match(/data-wire="far-/g) ?? []).length, 2);
  assert.equal(Object.keys(spec.shellGraph.nodes).length, 24);
  assert.equal(spec.shellGraph.edges.filter((edge) => edge[2] === "frame").length, 24);
  assert.equal(spec.shellGraph.edges.filter((edge) => edge[2] === "rail").length, 21);
  assert.equal(spec.shellGraph.anchorNodes.length, 6);
  assert.equal((html.match(/concrete-anchor-node/g) ?? []).length, 6);
  assert.equal((html.match(/class="graph-end-door"/g) ?? []).length, 4);
  assert.equal((html.match(/class="door gable-door"/g) ?? []).length, 2);
  assert.equal((html.match(/class="side-door"/g) ?? []).length, 0);
  assert.match(html, /x1="125" y1="650" x2="360" y2="650"/);
  assert.doesNotMatch(html, /x1="125" y1="60" x2="360" y2="60"/);
});
