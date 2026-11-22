// The drawing sheet for any building the geometry core can describe: plan, side
// and end elevations at one shared scale, a 3D sketch, schedules, and an audit
// layer that can be switched on over the same drawing.
import { buildingModel } from "./building.mjs";
import { convexHull, solidFaces } from "./geometry.mjs";

const INK = "#111111";
const WALL = "#eef1f3";
const POCHE = "#b9c0c6";
const CONCRETE = "#e5e7e9";
const ROOF = "#dfe3e6";
const AUDIT = "#a8127d";
const OPENING = "#1f4f8f";

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const n = (value) => Math.round(value * 10) / 10;
const mm = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const metres = (value) => (Math.round(value) / 1000).toFixed(3);
const text = (x, y, value, className = "", extra = "") => `<text x="${n(x)}" y="${n(y)}"${className ? ` class="${className}"` : ""}${extra ? ` ${extra}` : ""}>${esc(value)}</text>`;
const points = (list) => list.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
const line = ([x1, y1], [x2, y2], className) => `<line class="${className}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" />`;

function dimensionH(x1, x2, y, label, className = "dimension") {
  return `<g class="${className}"><line x1="${n(x1)}" y1="${n(y)}" x2="${n(x2)}" y2="${n(y)}" /><line x1="${n(x1)}" y1="${n(y - 6)}" x2="${n(x1)}" y2="${n(y + 6)}" /><line x1="${n(x2)}" y1="${n(y - 6)}" x2="${n(x2)}" y2="${n(y + 6)}" />${text((x1 + x2) / 2, y - 5, label, "dimension-text", 'text-anchor="middle"')}</g>`;
}
function dimensionV(x, y1, y2, label, className = "dimension") {
  const middle = (y1 + y2) / 2;
  return `<g class="${className}"><line x1="${n(x)}" y1="${n(y1)}" x2="${n(x)}" y2="${n(y2)}" /><line x1="${n(x - 6)}" y1="${n(y1)}" x2="${n(x + 6)}" y2="${n(y1)}" /><line x1="${n(x - 6)}" y1="${n(y2)}" x2="${n(x + 6)}" y2="${n(y2)}" />${text(x - 6, middle, label, "dimension-text", `text-anchor="middle" transform="rotate(-90 ${n(x - 6)} ${n(middle)})"`)}</g>`;
}

// A polygon moved inward by a distance: the inside face of a wall.
function inset(polygon, distance) {
  const count = polygon.length;
  const lines = polygon.map((from, index) => {
    const to = polygon[(index + 1) % count];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const inward = [-(to[1] - from[1]) / length, (to[0] - from[0]) / length];
    return { point: [from[0] + inward[0] * distance, from[1] + inward[1] * distance], along: [(to[0] - from[0]) / length, (to[1] - from[1]) / length] };
  });
  return lines.map((current, index) => {
    const previous = lines[(index + count - 1) % count];
    const cross = previous.along[0] * current.along[1] - previous.along[1] * current.along[0];
    if (Math.abs(cross) < 1e-9) return current.point;
    const t = ((current.point[0] - previous.point[0]) * current.along[1] - (current.point[1] - previous.point[1]) * current.along[0]) / cross;
    return [previous.point[0] + previous.along[0] * t, previous.point[1] + previous.along[1] * t];
  });
}

// A door or window as seen in an elevation, drawn in the opening's own
// coordinates so it follows the wall on angled and curved views too: u runs
// across the opening (0 to 1), v up from the sill (0 to 1). Sizes are in mm.
const FRAME_MM = 70; // door and window frame (karm) seen face on
const SASH_MM = 50; // window sash (ramme) inside the frame
function openingElevation(opening, quad) {
  const [a, b, c, d] = quad;
  const at = (u, v) => [a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v + (c[0] - b[0] - d[0] + a[0]) * u * v,
    a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v + (c[1] - b[1] - d[1] + a[1]) * u * v];
  const W = opening.widthMm, H = opening.heightMm;
  const box = (x0, y0, x1, y1, className) => `<polygon class="${className}" points="${points([at(x0 / W, y0 / H), at(x1 / W, y0 / H), at(x1 / W, y1 / H), at(x0 / W, y1 / H)])}" />`;
  const frame = box(0, 0, W, H, "opening");
  if (opening.kind === "door") {
    // A single leaf up to 1 200 mm, a pair of leaves above it. The lever sits at
    // 1 050 mm on the latch side, away from the hinges.
    const leaves = W > 1200 ? 2 : 1, leafW = (W - 2 * FRAME_MM) / leaves;
    const parts = [frame];
    for (let i = 0; i < leaves; i += 1) {
      const x0 = FRAME_MM + i * leafW, x1 = x0 + leafW;
      parts.push(box(x0, 0, x1, H - FRAME_MM, "leaf"));
      parts.push(box(x0 + leafW * 0.18, H * 0.56, x1 - leafW * 0.18, H - FRAME_MM - 180, "leaf-panel"));
      parts.push(box(x0 + leafW * 0.18, 220, x1 - leafW * 0.18, H * 0.46, "leaf-panel"));
      const latch = leaves === 2 ? (i === 0 ? x1 - 70 : x0 + 70) : x1 - 90;
      const lever = leaves === 2 ? (i === 0 ? -130 : 130) : -130;
      parts.push(line(at(latch / W, 1050 / H), at((latch + lever) / W, 1050 / H), "handle-lever"));
    }
    parts.push(line(at(-60 / W, 0), at((W + 60) / W, 0), "threshold"));
    return parts.join("");
  }
  // Windows: one sash up to 1 300 mm wide, two above it; a sill that projects.
  const sashes = W > 1300 ? 2 : 1, inner = W - 2 * FRAME_MM, sashW = inner / sashes;
  const parts = [frame];
  for (let i = 0; i < sashes; i += 1) {
    const x0 = FRAME_MM + i * sashW, x1 = x0 + sashW;
    parts.push(box(x0, FRAME_MM, x1, H - FRAME_MM, "sash"));
    parts.push(box(x0 + SASH_MM, FRAME_MM + SASH_MM, x1 - SASH_MM, H - FRAME_MM - SASH_MM, "glass"));
  }
  parts.push(box(-60, -45, W + 60, 0, "sill-board"));
  return parts.join("");
}

export function renderBuildingSheet(spec, { audit = false } = {}) {
  const model = buildingModel(spec);
  const { solid, walls, openings, braces, pads, checks, facts, thicknessMm } = model;
  const over = model.overhangMm;
  const { lengthMm: L, widthMm: W, heightMm: H } = solid.dims;
  const box = solid.kind === "extrusion" && solid.profile.kind === "box" ? solid.profile : null;
  const arch = solid.kind === "extrusion" && solid.profile.kind === "arch" ? solid.profile : null;

  // One scale for the plan and both elevations, so they line up as on a drawing board.
  const planBox = { x: 120, y: 150, w: 500, h: 290 };
  const sideBox = { y: 525, h: 235 };
  const frontBox = { x: 640, w: 300 };
  const scale = Math.min(planBox.w / (L + 2 * over), planBox.h / (W + 2 * over), sideBox.h / H, frontBox.w / (W + 2 * over));
  const planLeft = planBox.x + (planBox.w - L * scale) / 2;
  const planTop = planBox.y + (planBox.h - W * scale) / 2;
  const ground = sideBox.y + sideBox.h;
  const frontLeft = frontBox.x + (frontBox.w - W * scale) / 2;
  // Plan: X to the right, Y up the sheet, so the near side is at the bottom.
  const P = (x, y) => [planLeft + x * scale, planTop + (W - y) * scale];
  // Side elevation: the near side seen from outside, directly under the plan.
  const S = (x, z) => [planLeft + x * scale, ground - z * scale];
  // End elevation: the start end seen from outside.
  const F = (y, z) => [frontLeft + (W - y) * scale, ground - z * scale];

  const nodes = Object.values(solid.nodes);
  const centre = { x: (Math.min(...nodes.map((p) => p.x)) + Math.max(...nodes.map((p) => p.x))) / 2, y: (Math.min(...nodes.map((p) => p.y)) + Math.max(...nodes.map((p) => p.y))) / 2 };
  const edgeClass = (kind) => `edge edge-${kind}`;

  // ---- Plan -----------------------------------------------------------------
  const outer = solid.footprint;
  const inner = inset(outer, thicknessMm);
  const ring = (polygon) => `M ${polygon.map(([x, y]) => P(x, y).map(n).join(" ")).join(" L ")} Z`;
  const planOpenings = openings.map((opening) => {
    const [a, b] = opening.quad;
    const [nx, ny] = opening.normal;
    const inside = (p, depth) => P(p.x - nx * depth, p.y - ny * depth);
    const gap = [P(a.x, a.y), P(b.x, b.y), inside(b, thicknessMm), inside(a, thicknessMm)];
    let detail;
    if (opening.kind === "door") {
      // The leaf stands open into the room, hinged at the left jamb, with its swing.
      const hinge = { x: a.x - nx * thicknessMm, y: a.y - ny * thicknessMm };
      const along = [b.x - a.x, b.y - a.y];
      const arc = Array.from({ length: 9 }, (_, index) => {
        const angle = (index / 8) * Math.PI / 2;
        return P(hinge.x + along[0] * Math.cos(angle) - nx * opening.widthMm * Math.sin(angle), hinge.y + along[1] * Math.cos(angle) - ny * opening.widthMm * Math.sin(angle));
      });
      detail = `<polyline class="door-swing" points="${points(arc)}" />${line(P(hinge.x, hinge.y), arc.at(-1), "door-leaf")}`;
    } else {
      detail = [0.35, 0.65].map((depth) => line(inside(a, thicknessMm * depth), inside(b, thicknessMm * depth), "glazing")).join("");
    }
    const middle = inside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, thicknessMm + (opening.kind === "door" ? opening.widthMm + 220 : 320));
    return `<g data-opening="${esc(opening.id)}"><polygon class="opening-gap" points="${points(gap)}" />${line(gap[0], gap[3], "jamb")}${line(gap[1], gap[2], "jamb")}${detail}${text(middle[0], middle[1] + 3, opening.id, "tag", 'text-anchor="middle"')}</g>`;
  });
  const planPads = pads.map((pad) => {
    const [cx, cy] = P(pad.x, pad.y);
    return `<rect class="pad" data-pad="${esc(pad.id)}" x="${n(cx - pad.sizeX * scale / 2)}" y="${n(cy - pad.sizeY * scale / 2)}" width="${n(pad.sizeX * scale)}" height="${n(pad.sizeY * scale)}" />`;
  });
  const stations = solid.stations ?? [];
  const planGrid = stations.map((station, index) => {
    const [x] = P(station.x, 0);
    return `${line([x, planTop - 34], [x, planTop + W * scale + 14], "grid-line")}<circle class="bubble" cx="${n(x)}" cy="${n(planTop - 44)}" r="9" />${text(x, planTop - 40.5, index + 1, "bubble-text", 'text-anchor="middle"')}`;
  });
  const acrossGrid = solid.kind === "extrusion" ? [["A", 0], ["B", W]].map(([label, y]) => {
    const [, sy] = P(0, y);
    return `${line([planLeft - 34, sy], [planLeft + L * scale + 14, sy], "grid-line")}<circle class="bubble" cx="${n(planLeft - 44)}" cy="${n(sy)}" r="9" />${text(planLeft - 44, sy + 3.5, label, "bubble-text", 'text-anchor="middle"')}`;
  }) : [];
  const roofPlan = box ? [
    over > 0 ? `<polygon class="roof-edge" points="${points([P(-over, -over), P(L + over, -over), P(L + over, W + over), P(-over, W + over)])}" />` : "",
    box.ridge ? `${line(P(-over, W / 2), P(L + over, W / 2), "ridge-line")}${text(P(L, W / 2)[0] - 4, P(L, W / 2)[1] - 4, "RIDGE / MØNE", "small", 'text-anchor="end"')}` : ""
  ].join("") : "";
  // Ridges and hips of a roof on a footprint building, seen from above.
  const prismRoofPlan = solid.kind === "prism" ? solid.edges.filter(([, , kind]) => kind === "ridge").map(([from, to]) =>
    line(P(solid.nodes[from].x, solid.nodes[from].y), P(solid.nodes[to].x, solid.nodes[to].y), "ridge-line")).join("") : "";
  const archPlan = arch ? `${line(P(0, W / 2), P(L, W / 2), "ridge-line")}${text(P(L, W / 2)[0] - 4, P(L, W / 2)[1] - 4, "CROWN / TOPP", "small", 'text-anchor="end"')}` : "";
  const ribsPlan = solid.kind === "revolved" ? solid.edges.filter(([, , kind]) => kind === "rib" || kind === "ring").map(([from, to, kind]) =>
    line(P(solid.nodes[from].x, solid.nodes[from].y), P(solid.nodes[to].x, solid.nodes[to].y), `edge edge-${kind} light`)).join("") : "";
  const bays = stations.slice(1).map((station, index) => [stations[index].x, station.x]);
  const bayChain = bays.length && bays.length <= 12 ? bays.map(([from, to]) => dimensionH(P(from, 0)[0], P(to, 0)[0], planTop - 18, mm(to - from))).join("") : "";
  const planCentre = P(L / 2, W / 2);
  const plan = `
  <g id="plan-view" aria-label="Plan">
    ${text(planBox.x - 60, 84, "PLAN / PLANTEGNING", "view-title")}
    ${roofPlan}
    ${planPads.join("")}
    <path class="wall-poche" fill-rule="evenodd" d="${ring(outer)} ${ring(inner)}" />
    <polygon class="floor" points="${points(inner.map(([x, y]) => P(x, y)))}" />
    ${ribsPlan}${archPlan}${prismRoofPlan}
    ${planGrid.join("")}${acrossGrid.join("")}
    ${planOpenings.join("")}
    ${braces.filter((brace) => brace.wall !== undefined).map((brace) => line(P(brace.from.x, brace.from.y), P(brace.to.x, brace.to.y), "brace-plan")).join("")}
    ${text(planCentre[0], planCentre[1] - 2, spec.name, "room-name", 'text-anchor="middle"')}
    ${text(planCentre[0], planCentre[1] + 12, `${facts.areaM2.toFixed(1)} m²`, "small", 'text-anchor="middle"')}
    ${bayChain}
    ${dimensionH(P(0, 0)[0], P(L, 0)[0], planTop + W * scale + 34, `${mm(L)} mm`)}
    ${dimensionV(planLeft - 68, P(0, W)[1], P(0, 0)[1], `${mm(W)} mm`)}
  </g>`;

  // ---- Elevations -------------------------------------------------------------
  // Each elevation is the solid seen flat: its outline, the members on the
  // viewer's half, then the openings and braces that face the viewer.
  function elevationView({ id, title, place, depth, facing, across, label }) {
    const flat = nodes.map((node) => place(node));
    const outline = convexHull(flat);
    const members = solid.edges.filter(([from, to]) => depth(solid.nodes[from]) <= 1 && depth(solid.nodes[to]) <= 1)
      .map(([from, to, kind]) => line(place(solid.nodes[from]), place(solid.nodes[to]), edgeClass(kind)));
    const seen = openings.filter((opening) => facing(opening.normal) > 0.3).map((opening) => {
      const quad = opening.quad.map((corner) => place(corner));
      const middleX = (quad[0][0] + quad[1][0]) / 2;
      return `<g data-opening="${esc(opening.id)}">${openingElevation(opening, quad)}${text(middleX, quad[3][1] - 4, opening.id, "tag", 'text-anchor="middle"')}</g>`;
    });
    const struts = braces.filter((brace) => depth(brace.from) <= 1 && depth(brace.to) <= 1 && (brace.station !== undefined ? id === "end-view" : facing(walls.find((wall) => wall.id === brace.wall)?.normal ?? [0, 0]) > 0.3))
      .map((brace) => {
        const a = place(brace.from), b = place(brace.to);
        return `<g data-brace="${esc(brace.id)}">${line(a, b, "brace")}${text((a[0] + b[0]) / 2 + 6, (a[1] + b[1]) / 2 - 4, brace.id, "tag")}</g>`;
      });
    const xs = flat.map(([x]) => x), left = Math.min(...xs), right = Math.max(...xs);
    const ticks = Array.from({ length: Math.floor((right - left + 40) / 12) }, (_, index) => {
      const x = left - 20 + index * 12;
      return line([x, ground], [x - 6, ground + 6], "ground-hatch");
    });
    const levels = [[0, "±0.000"], ...(facts.wallHeightMm && facts.wallHeightMm !== H ? [[facts.wallHeightMm, `+${metres(facts.wallHeightMm)}`]] : []), [H, `+${metres(H)}`]]
      .map(([z, name]) => { const y = ground - z * scale; return `<g class="level">${line([left - 34, y], [left - 8, y], "level-line")}<path d="M ${n(left - 20)} ${n(y)} l 4 -6 l 4 6 z" />${text(left - 36, y + 3, name, "small", 'text-anchor="end"')}</g>`; });
    return `
  <g id="${id}" aria-label="${esc(label)}">
    ${text(across.title, Math.max(sideBox.y - 22, ground - H * scale - 30), title, "view-title")}
    <polygon class="silhouette" points="${points(outline)}" />
    ${cladding(id, place)}
    ${roofFor(id, place)}
    ${members.join("")}
    ${seen.join("")}${struts.join("")}
    ${line([left - 22, ground], [right + 22, ground], "ground")}${ticks.join("")}
    ${id === "side-view" ? levels.join("") : ""}
    ${dimensionH(left, right, ground + 30, `${mm(across.widthMm)} mm`)}
  </g>`;
  }
  // The roof of a box building, drawn over its walls with its overhang.
  function roofFor(id, place) {
    if (!box) return "";
    const top = box.heightMm, eaveNear = box.vertices.E[1], eaveFar = box.vertices.D[1];
    if (id === "side-view") {
      const low = Math.min(eaveNear, eaveFar), high = box.roof.kind === "flat" ? top + 120 : top;
      const band = [place({ x: -over, y: 0, z: low }), place({ x: L + over, y: 0, z: low }), place({ x: L + over, y: 0, z: high }), place({ x: -over, y: 0, z: high })];
      const lines = box.roof.kind === "flat" ? "" : Array.from({ length: Math.max(0, Math.floor((high - low) / 300)) }, (_, index) => {
        const z = low + (index + 1) * 300;
        return line(place({ x: -over, y: 0, z }), place({ x: L + over, y: 0, z }), "roof-line");
      }).join("");
      return `<polygon class="roof" points="${points(band)}" />${lines}`;
    }
    // End view: the roof line runs past the walls by the overhang, along its slope.
    const slope = (from, to, extend) => {
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      return [from[0] + (from[0] - to[0]) / length * extend, from[1] + (from[1] - to[1]) / length * extend];
    };
    const E = box.vertices.E, D = box.vertices.D, C = box.ridge ? box.vertices.C : null;
    const path = C ? [slope(E, C, over), C, slope(D, C, over)] : [slope(E, D, over), slope(D, E, over)];
    return `<polyline class="roof-edge-heavy" points="${points(path.map(([y, z]) => place({ x: 0, y, z })))}" />`;
  }
  // Horizontal boards on the vertical walls of a box or footprint building.
  function cladding(id, place) {
    const wallHeight = box ? Math.min(box.vertices.E[1], box.vertices.D[1]) : solid.kind === "prism" ? solid.wallHeightMm : 0;
    if (!wallHeight) return "";
    const span = id === "side-view" ? [{ x: 0, y: 0 }, { x: L, y: 0 }] : [{ x: 0, y: W }, { x: 0, y: 0 }];
    return Array.from({ length: Math.max(0, Math.floor(wallHeight / 400)) }, (_, index) => {
      const z = (index + 1) * 400;
      return z < wallHeight ? line(place({ ...span[0], z }), place({ ...span[1], z }), "cladding") : "";
    }).join("");
  }
  const side = elevationView({
    id: "side-view", title: "SIDE ELEVATION / LANGFASADE", label: "Side elevation",
    place: (p) => S(p.x, p.z), depth: (p) => (p.y <= centre.y + 1e-6 ? 0 : 2), facing: ([, ny]) => -ny,
    across: { title: planBox.x - 60, widthMm: L }
  });
  const end = elevationView({
    id: "end-view", title: "END ELEVATION / GAVLFASADE", label: "End elevation",
    place: (p) => F(p.y, p.z), depth: (p) => (p.x <= centre.x + 1e-6 ? 0 : 2), facing: ([nx]) => -nx,
    across: { title: frontBox.x, widthMm: W }
  });
  const heightDimension = dimensionV(frontLeft + W * scale + 30, ground - H * scale, ground, `${mm(H)} mm`);

  // ---- 3D sketch ----------------------------------------------------------------
  // The solid seen from the near-left corner of the plan, above, in true
  // proportions (an axonometric view, no perspective): the same near side as
  // the side elevation and the same start end as the end elevation. Faces turned
  // away are left out and nearer faces cover further ones, so an opening only
  // shows on the wall it is in, drawn as in the elevations.
  const azimuth = 36 * Math.PI / 180, tilt = 20 * Math.PI / 180;
  const right = { x: Math.cos(azimuth), y: -Math.sin(azimuth), z: 0 };
  const up = { x: Math.sin(azimuth) * Math.sin(tilt), y: Math.cos(azimuth) * Math.sin(tilt), z: Math.cos(tilt) };
  const into = { x: Math.sin(azimuth) * Math.cos(tilt), y: Math.cos(azimuth) * Math.cos(tilt), z: -Math.sin(tilt) };
  const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const faces = solidFaces(solid, { overhangMm: over }).filter((face) => dot3(face.normal, into) < -1e-9);
  const depthOf = (face) => face.points.reduce((sum, p) => sum + dot3(p, into), 0) / face.points.length;
  // A box, arch or A-frame is convex, so its walls never hide each other; only a
  // roof that overhangs reaches over them. A footprint can have notches, so its
  // faces go from the furthest to the nearest.
  faces.sort(solid.kind === "extrusion"
    ? (a, b) => (a.kind === "roof") - (b.kind === "roof")
    : (a, b) => depthOf(b) - depthOf(a));
  const flatSketch = faces.flatMap((face) => face.points).map((p) => [dot3(p, right), -dot3(p, up)]);
  const sx = flatSketch.map(([x]) => x), sy = flatSketch.map(([, y]) => y);
  const sketchBox = { x: 690, y: 110, w: 250, h: 280 };
  const spanX = Math.max(...sx) - Math.min(...sx), spanY = Math.max(...sy) - Math.min(...sy);
  const sketchScale = Math.min(sketchBox.w / spanX, sketchBox.h / spanY);
  const K = (p) => [
    sketchBox.x + (sketchBox.w - spanX * sketchScale) / 2 + (dot3(p, right) - Math.min(...sx)) * sketchScale,
    sketchBox.y + (sketchBox.h - spanY * sketchScale) / 2 + (-dot3(p, up) - Math.min(...sy)) * sketchScale
  ];
  const onFace = (face, p) => Math.abs(dot3(face.normal, { x: p.x - face.points[0].x, y: p.y - face.points[0].y, z: p.z - face.points[0].z })) < 1;
  // Where a plane (one coordinate held at a value) cuts a face: a segment, or nothing.
  const cut = (face, axis, value) => {
    const hits = [];
    face.points.forEach((p, index) => {
      const q = face.points[(index + 1) % face.points.length];
      const a = p[axis] - value, b = q[axis] - value;
      if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
        const t = a / (a - b);
        hits.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });
      }
    });
    return hits.length === 2 ? line(K(hits[0]), K(hits[1]), axis === "z" ? "cladding" : "sketch-frame") : "";
  };
  const claddingTop = box ? Math.min(box.vertices.E[1], box.vertices.D[1]) : solid.kind === "prism" ? solid.wallHeightMm : 0;
  const innerStations = (solid.stations ?? []).slice(1, -1);
  const drawnOpenings = new Set();
  const sketchOpening = (opening) => {
    drawnOpenings.add(opening);
    const quad = opening.quad.map(K);
    return `<g data-opening="${esc(opening.id)}">${openingElevation(opening, quad)}</g>`;
  };
  const sketchFaces = faces.map((face) => {
    const vertical = Math.abs(face.normal.z) < 1e-6;
    const boards = claddingTop && vertical ? Array.from({ length: Math.floor(claddingTop / 400) }, (_, index) => (index + 1) * 400 < claddingTop ? cut(face, "z", (index + 1) * 400) : "").join("") : "";
    const frames = face.kind === "end" ? "" : innerStations.map((station) => cut(face, "x", station.x)).join("");
    // A round building's facets are drawn without seams; its ribs and rings go on top.
    const seams = solid.kind === "revolved" ? solid.edges.filter(([from, to]) => face.nodes.includes(from) && face.nodes.includes(to))
      .map(([from, to, kind]) => line(K(solid.nodes[from]), K(solid.nodes[to]), edgeClass(kind))).join("") : "";
    const here = solid.kind === "revolved" ? [] : openings.filter((opening) => !drawnOpenings.has(opening) && opening.quad.every((corner) => onFace(face, corner)));
    const struts = braces.filter((brace) => onFace(face, brace.from) && onFace(face, brace.to)).map((brace) => line(K(brace.from), K(brace.to), "brace"));
    return `<polygon class="sketch-face sketch-${face.kind}${solid.kind === "revolved" ? " seamless" : ""}" points="${points(face.points.map(K))}" />${boards}${frames}${seams}${here.map(sketchOpening).join("")}${struts.join("")}`;
  });
  // On a round building an opening follows the curve; show the ones facing the viewer.
  const roundOpenings = solid.kind === "revolved"
    ? openings.filter((opening) => opening.normal[0] * into.x + opening.normal[1] * into.y < -0.15).map(sketchOpening) : [];
  const sketch = `
  <g id="sketch-view" aria-label="Three-dimensional sketch">
    ${text(sketchBox.x, 84, "3D SKETCH / 3D-SKISSE", "view-title")}
    ${sketchFaces.join("")}${roundOpenings.join("")}
  </g>`;

  // ---- Schedules ------------------------------------------------------------------
  const tableTop = ground + 92;
  const openingRows = openings.map((opening, index) => {
    const y = tableTop + 40 + index * 15;
    const where = opening.wall.round ? `bearing ${opening.bearingDeg ?? 0}°` : opening.wall.label;
    return `${text(60, y, opening.id, "cell strong")}${text(96, y, opening.kind === "door" ? "Door / Dør" : "Window / Vindu", "cell")}${text(190, y, where, "cell")}${text(280, y, `${mm(opening.widthMm)} × ${mm(opening.heightMm)}`, "cell")}${text(372, y, mm(opening.sillMm), "cell")}${text(420, y, opening.offsetMm === null ? "–" : mm(opening.offsetMm), "cell")}`;
  });
  const figures = [
    ["Length / Lengde", `${mm(L)} mm`], ["Width / Bredde", `${mm(W)} mm`], ["Height / Høyde", `${mm(H)} mm`],
    ...(facts.wallHeightMm ? [["Wall height / Vegghøyde", `${mm(facts.wallHeightMm)} mm`]] : []),
    ...(facts.roofPitchDeg ? [["Roof pitch / Takvinkel", `${facts.roofPitchDeg}°`]] : []),
    ...(facts.rafterMm ? [["Rafter / Sperre", `${mm(facts.rafterMm)} mm`]] : []),
    ...(facts.radiusMm ? [["Radius", `${mm(facts.radiusMm)} mm`]] : []),
    ...(facts.riseMm ? [["Rise / Pilhøyde", `${mm(facts.riseMm)} mm`]] : []),
    ["Floor area / Areal", `${facts.areaM2.toFixed(1)} m²`], ["Perimeter / Omkrets", `${facts.perimeterM.toFixed(1)} m`],
    ...(stations.length ? [["Frames / Rammer", `${stations.length} · ${bays.length} bays of ${mm(bays[0][1] - bays[0][0])} mm`]] : []),
    ["Wall / Vegg", `${mm(thicknessMm)} mm`], ["Foundation pads / Fundamenter", `${pads.length} × ${mm(pads[0].sizeX)} × ${mm(pads[0].sizeY)} mm`]
  ];
  const figureRows = figures.map(([name, value], index) => `${text(520, tableTop + 40 + index * 15, name, "cell")}${text(700, tableTop + 40 + index * 15, value, "cell strong")}`);
  const braceRows = braces.map((brace, index) => {
    const y = tableTop + 40 + (openings.length + 3 + index) * 15;
    return `${text(60, y, brace.id, "cell strong")}${text(96, y, "Brace / Skråstag", "cell")}${text(190, y, brace.where, "cell")}${text(280, y, `${mm(brace.lengthMm)} mm`, "cell")}${text(372, y, `${brace.angleDeg}°`, "cell")}`;
  });
  const schedules = `
  <g id="schedules" aria-label="Schedules">
    ${line([40, tableTop - 18], [960, tableTop - 18], "rule")}
    ${text(60, tableTop, "OPENINGS / ÅPNINGER", "view-title")}
    ${text(60, tableTop + 20, "ID", "head")}${text(96, tableTop + 20, "TYPE", "head")}${text(190, tableTop + 20, "WALL / VEGG", "head")}${text(280, tableTop + 20, "W × H mm", "head")}${text(372, tableTop + 20, "SILL", "head")}${text(420, tableTop + 20, "FROM WALL START", "head")}
    ${openingRows.join("") || text(60, tableTop + 40, "None", "cell")}
    ${braces.length ? `${text(60, tableTop + 40 + (openings.length + 1.4) * 15, "BRACES / SKRÅSTAG", "head")}${text(280, tableTop + 40 + (openings.length + 1.4) * 15, "LENGTH", "head")}${text(372, tableTop + 40 + (openings.length + 1.4) * 15, "ANGLE", "head")}${braceRows.join("")}` : ""}
    ${text(520, tableTop, "KEY FIGURES / NØKKELTALL", "view-title")}
    ${figureRows.join("")}
  </g>`;

  // ---- Audit layer ------------------------------------------------------------------
  // Every position the drawing was made from, and the checks on them. Hidden
  // until audit mode is on; the drawing underneath is the same either way.
  // Pads sit on a regular grid, so their labels go beside them. Everything else is
  // a numbered keynote: a small marker on the plan and its text in a list below,
  // so no amount of detail can pile labels on top of each other.
  const auditPads = pads.map((pad) => { const [x, y] = P(pad.x + (pad.x > centre.x ? -1 : 1) * (thicknessMm + 260), pad.y + (pad.y > centre.y ? -1 : 1) * (thicknessMm + 260)); return text(x, y + 3, pad.id, "audit-text", 'text-anchor="middle"'); });
  const keynotes = [];
  const placed = [];
  // A marker slides along its wall until it is clear of the markers already there.
  const keynote = (at, slide, note) => {
    let [x, y] = at;
    for (let tries = 0; tries < 12 && placed.some(([px, py]) => Math.hypot(px - x, py - y) < 15); tries += 1) { x += slide[0] * 16; y += slide[1] * 16; }
    placed.push([x, y]);
    keynotes.push(note);
    const number = keynotes.length;
    return `<g class="keynote" data-keynote="${number}"><circle cx="${n(x)}" cy="${n(y)}" r="6.5" />${text(x, y + 2.8, number, "keynote-text", 'text-anchor="middle"')}</g>`;
  };
  const screenAlong = (from, to) => { const a = P(from[0], from[1]), b = P(to[0], to[1]); const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / length, (b[1] - a[1]) / length]; };
  const auditOpenings = openings.map((opening) => {
    const [a, b] = opening.quad;
    const out = (p, distance) => P(p.x + opening.normal[0] * distance, p.y + opening.normal[1] * distance);
    const where = opening.wall.round ? `bearing ${opening.bearingDeg ?? 0}°` : opening.wall.label.toLowerCase();
    const note = `${opening.id} ${opening.kind}, ${where}: ${opening.offsetMm === null ? "" : `${mm(opening.offsetMm)} from the wall start, `}${mm(opening.widthMm)} wide, sill ${mm(opening.sillMm)}, head ${mm(opening.sillMm + opening.heightMm)}`;
    const chain = opening.offsetMm === null ? "" : `${line(out({ x: opening.wall.from[0], y: opening.wall.from[1] }, 260), out(a, 260), "audit-line")}${line(out(a, 260), out(b, 260), "audit-line heavy")}`;
    return chain + keynote(out({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 620), screenAlong([a.x, a.y], [b.x, b.y]), note);
  });
  const auditWalls = walls.filter((wall) => !wall.round && solid.kind === "prism").map((wall) => {
    const quarter = [wall.from[0] + (wall.to[0] - wall.from[0]) * 0.22, wall.from[1] + (wall.to[1] - wall.from[1]) * 0.22];
    return keynote(P(quarter[0] + wall.normal[0] * 620, quarter[1] + wall.normal[1] * 620), screenAlong(wall.from, wall.to), `${wall.id}: ${mm(wall.lengthMm)} mm long, bearing ${wall.bearingDeg}°`);
  });
  const auditBraces = braces.map((brace) => keynote(P((brace.from.x + brace.to.x) / 2, (brace.from.y + brace.to.y) / 2), [1, 0],
    `${brace.id} brace, ${brace.where}: ${mm(brace.lengthMm)} mm at ${brace.angleDeg}° from level, ${mm(brace.from.z)} to ${mm(brace.to.z)} above the floor`));
  // Frame positions sit above their bubbles; close frames take turns on two rows.
  const tight = stations.length > 1 && (stations[1].x - stations[0].x) * scale < 34;
  const auditStations = stations.map((station, index) => text(P(station.x, 0)[0], planTop - 58 - (tight && index % 2 ? 9 : 0), `x ${mm(station.x)}`, "audit-text", 'text-anchor="middle"'));
  const failed = checks.filter((item) => !item.ok).length;
  const checkTop = Math.max(tableTop + 40 + (figures.length + 1.5) * 15, tableTop + 40 + (openings.length + braces.length + 5) * 15);
  const checkRows = checks.map((item, index) => {
    const column = index % 2, row = Math.floor(index / 2);
    return text(60 + column * 460, checkTop + 22 + row * 14, `${item.ok ? "✓" : "✗"}  ${item.text}`, item.ok ? "audit-text" : "audit-text failed");
  });
  const noteTop = checkTop + 22 + Math.ceil(checks.length / 2) * 14 + 16;
  const noteRows = keynotes.map((note, index) => {
    const column = index % 2, row = Math.floor(index / 2);
    return `<circle class="keynote-key" cx="${66 + column * 460}" cy="${noteTop + 13.2 + row * 14}" r="5" />${text(66 + column * 460, noteTop + 15.6 + row * 14, index + 1, "keynote-text", 'text-anchor="middle"')}${text(78 + column * 460, noteTop + 16 + row * 14, note, "audit-text")}`;
  });
  // Where every foundation pad sits, in millimetres from the building's origin.
  const padTop = noteTop + (keynotes.length ? 22 + Math.ceil(keynotes.length / 2) * 14 : 0) + 6;
  const perRow = 6;
  const padRows = pads.map((pad, index) => text(60 + (index % perRow) * 150, padTop + 16 + Math.floor(index / perRow) * 13, `${pad.id}  x ${mm(pad.x)} · y ${mm(pad.y)}`, "audit-text"));
  const auditLayer = `
  <g class="audit-layer" aria-label="Technical drawing audit">
    ${auditPads.join("")}${auditOpenings.join("")}${auditWalls.join("")}${auditBraces.join("")}${auditStations.join("")}
    ${line([40, checkTop - 12], [960, checkTop - 12], "audit-line")}
    ${text(60, checkTop + 4, `TECHNICAL DRAWING AUDIT / KONTROLL · ${checks.length - failed} of ${checks.length} checks pass`, failed ? "audit-title failed" : "audit-title")}
    ${checkRows.join("")}
    ${keynotes.length ? text(60, noteTop, "KEYNOTES / NØKKELNOTER · numbered on the plan", "audit-text strong") : ""}
    ${noteRows.join("")}
    ${text(60, padTop, "FOUNDATION PADS / FUNDAMENTER · centre of each pad", "audit-text strong")}
    ${padRows.join("")}
  </g>`;

  const notes = spec.notes ?? [];
  const titleBlock = `
  <g class="title-block">
    <rect x="35" y="1345" width="930" height="42" />
    <line x1="390" y1="1345" x2="390" y2="1387" /><line x1="730" y1="1345" x2="730" y2="1387" /><line x1="855" y1="1345" x2="855" y2="1387" />
    ${text(48, 1364, spec.drawingTitle, "title-main")}${text(48, 1380, `${spec.revision} · TEMPLATE-GENERATED`, "title-small")}
    ${text(405, 1364, notes[0] ?? "", "title-small")}${text(405, 1380, notes[1] ?? "", "title-small")}
    ${text(745, 1364, "SCALE / MÅLESTOKK", "title-small")}${text(745, 1380, `ABOUT 1:${Math.round(1 / (scale * 0.287) / 5) * 5} ON A3 · DRAFT`, "title-small")}
    ${text(870, 1364, "DRAWING / TEGNING", "title-small")}${text(870, 1380, `${spec.drawingNumber} · ${spec.revision}`, "title-small")}
    ${text(500, 1398, notes[2] ?? "", "provenance", 'text-anchor="middle"')}
  </g>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(`Plan ${spec.name}`)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #d9dde0; font-family: Arial, Helvetica, sans-serif; }
    .sheet { display: block; width: min(100%, 1000px); height: auto; margin: 0 auto; background: #ffffff; }
    text { fill: ${INK}; font-size: 10px; font-weight: 400; }
    .sheet-border, .title-block rect, .title-block line { fill: none; stroke: ${INK}; stroke-width: 1; }
    .view-title, .sheet-title { font-size: 15px; font-weight: 500; }
    .small, .title-small, .provenance, .cell, .head, .tag, .bubble-text { font-size: 8px; }
    .title-main { font-size: 11px; font-weight: 500; }
    .room-name { font-size: 11px; font-weight: 700; }
    .head { font-weight: 700; fill: #5d646a; }
    .strong { font-weight: 700; }
    .tag { fill: ${OPENING}; font-weight: 700; }
    .dimension, .dimension line { fill: none; stroke: ${INK}; stroke-width: 0.8; }
    .dimension-text { font-size: 9px; stroke: none; }
    .rule { stroke: ${INK}; stroke-width: 0.6; }
    .wall-poche { fill: ${POCHE}; stroke: ${INK}; stroke-width: 1.4; }
    .floor { fill: #ffffff; stroke: ${INK}; stroke-width: 0.8; }
    .pad { fill: ${CONCRETE}; stroke: ${INK}; stroke-width: 0.7; stroke-dasharray: 3 2; }
    .grid-line { stroke: #7a8088; stroke-width: 0.6; stroke-dasharray: 12 3 2 3; }
    .bubble { fill: #ffffff; stroke: ${INK}; stroke-width: 0.8; }
    .bubble-text { font-weight: 700; }
    .roof-edge { fill: none; stroke: ${INK}; stroke-width: 0.8; stroke-dasharray: 6 4; }
    .ridge-line { stroke: ${INK}; stroke-width: 0.8; stroke-dasharray: 14 4 2 4; }
    .opening-gap { fill: #ffffff; stroke: none; }
    .jamb { stroke: ${INK}; stroke-width: 1.2; }
    .door-leaf { stroke: ${OPENING}; stroke-width: 1.6; }
    .door-swing { fill: none; stroke: ${OPENING}; stroke-width: 0.7; stroke-dasharray: 3 2; }
    .glazing { stroke: ${OPENING}; stroke-width: 0.9; }
    .brace-plan { stroke: #7a8088; stroke-width: 2.4; }
    .silhouette { fill: ${WALL}; stroke: ${INK}; stroke-width: 2.2; stroke-linejoin: round; }
    .roof { fill: ${ROOF}; stroke: ${INK}; stroke-width: 1.4; }
    .roof-line { stroke: #9aa1a8; stroke-width: 0.5; }
    .roof-edge-heavy { fill: none; stroke: ${INK}; stroke-width: 4; stroke-linecap: square; stroke-linejoin: miter; }
    .cladding { stroke: #c3c9ce; stroke-width: 0.5; }
    .edge { fill: none; stroke: ${INK}; stroke-width: 0.9; }
    .edge-sill, .edge-rail, .edge-ridge { stroke-width: 1.6; }
    .edge-ring, .edge.light { stroke: #7a8088; stroke-width: 0.6; }
    .opening { fill: #ffffff; stroke: ${OPENING}; stroke-width: 1.3; }
    .sketch-face { fill: ${WALL}; stroke: ${INK}; stroke-width: 1.1; stroke-linejoin: round; }
    .sketch-roof { fill: ${ROOF}; }
    .sketch-face.seamless { stroke: ${WALL}; stroke-width: 0.6; }
    .sketch-frame { stroke: ${INK}; stroke-width: 0.6; }
    .opening-bar { stroke: ${OPENING}; stroke-width: 0.8; }
    .opening-bar.light { stroke-dasharray: 3 2; }
    .handle { fill: ${OPENING}; }
    .sill { stroke: ${OPENING}; stroke-width: 1.6; }
    .leaf { fill: #f3f5f7; stroke: ${OPENING}; stroke-width: 0.8; }
    .leaf-panel { fill: none; stroke: ${OPENING}; stroke-width: 0.5; }
    .sash { fill: #ffffff; stroke: ${OPENING}; stroke-width: 0.7; }
    .glass { fill: #dbe7f5; stroke: ${OPENING}; stroke-width: 0.5; }
    .sill-board { fill: #ffffff; stroke: ${OPENING}; stroke-width: 0.9; }
    .handle-lever { stroke: ${INK}; stroke-width: 1.6; stroke-linecap: round; }
    .threshold { stroke: ${INK}; stroke-width: 1.4; }
    .brace { stroke: #6b7279; stroke-width: 2.6; stroke-linecap: round; }
    .ground { stroke: ${INK}; stroke-width: 1.8; }
    .ground-hatch { stroke: ${INK}; stroke-width: 0.5; }
    .level path { fill: ${INK}; }
    .level-line { stroke: ${INK}; stroke-width: 0.6; }
    .title-block { fill: none; stroke: ${INK}; }
    /* Audit mode: the same drawing with every position and check shown. */
    .audit-layer { display: none; }
    .sheet.audit .audit-layer { display: inline; }
    .audit-text { fill: ${AUDIT}; font-size: 7.5px; }
    .audit-title { fill: ${AUDIT}; font-size: 11px; font-weight: 700; }
    .audit-text.failed, .audit-title.failed { fill: #c02626; font-weight: 700; }
    .audit-line { stroke: ${AUDIT}; stroke-width: 0.6; }
    .audit-line.heavy { stroke-width: 1.8; }
    .keynote circle, .keynote-key { fill: #ffffff; stroke: ${AUDIT}; stroke-width: 1; }
    .keynote-text { fill: ${AUDIT}; font-size: 7px; font-weight: 700; }
    .mode { max-width: 1000px; margin: 0 auto; padding: 8px 14px; font-size: 14px; background: #ffffff; border-bottom: 1px solid #dfe3e6; }
    @media print {
      @page { size: A3 portrait; margin: 5mm; }
      body { background: #ffffff; }
      .sheet { width: 100%; }
      .mode { display: none; }
    }
  </style>
</head>
<body>
  <svg class="sheet${audit ? " audit" : ""}" viewBox="0 0 1000 1410" role="img" aria-labelledby="sheet-title sheet-desc" data-form="${esc(spec.form.kind)}" data-checks="${checks.length}" data-failed="${failed}">
    <title id="sheet-title">${esc(spec.drawingTitle)}</title>
    <desc id="sheet-desc">Plan, side elevation, end elevation and three-dimensional sketch drawn from one building specification, with schedules and a technical audit layer.</desc>
    <rect class="sheet-border" x="20" y="18" width="960" height="1380" />
    ${text(500, 42, `PLAN ${spec.name}`, "sheet-title", 'text-anchor="middle"')}
    ${plan}
    ${sketch}
    ${side}
    ${end}
    ${heightDimension}
    ${schedules}
    ${auditLayer}
    ${titleBlock}
  </svg>
  <script>
    // Audit mode is a switch on the page, or site.html#audit for the exporter.
    (() => {
      const sheet = document.querySelector("svg.sheet");
      if (location.hash === "#audit") sheet.classList.add("audit");
      if (location.hash === "#static" || location.hash === "#audit") return;
      const bar = document.createElement("label");
      bar.className = "mode";
      bar.style.display = "block";
      bar.innerHTML = '<input type="checkbox"> Technical drawing audit mode';
      const input = bar.querySelector("input");
      input.checked = sheet.classList.contains("audit");
      input.addEventListener("change", () => sheet.classList.toggle("audit", input.checked));
      document.body.insertBefore(bar, sheet);
    })();
  </script>
</body>
</html>`;
}
