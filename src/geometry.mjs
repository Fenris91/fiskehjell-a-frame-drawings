// Geometry core: a building is a cross-section profile extruded along its length
// through numbered stations. Every view is a way of looking at that one solid:
// the end elevation is the profile itself, the 3D sketch is the solid through an
// oblique view, and plan and side use its length, width, height and stations.
//
// Axes match the drawing sheets: X along the length, Y across the width, Z up.
// Lengths are millimetres. A station's place along the building is a ratio from
// 0 to 1, so the same solid can be drawn at any scale.

const finite = (value) => Number.isFinite(value);

function assertProfile(profile) {
  if (!profile || !finite(profile.widthMm) || !finite(profile.heightMm) || profile.widthMm <= 0 || profile.heightMm <= 0) {
    throw new Error("A profile needs a positive widthMm and heightMm");
  }
  for (const [name, point] of Object.entries(profile.vertices)) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(finite)) {
      throw new Error(`Profile vertex ${name} must be a finite [y, z] point`);
    }
  }
  for (const [from, to] of [...profile.frame, ...(profile.elevation.edges ?? [])]) {
    if (!profile.vertices[from] || !profile.vertices[to]) {
      throw new Error(`Profile edge ${from} -> ${to} references an unknown vertex`);
    }
  }
  return profile;
}

// A cross-section: named vertices as [y, z], the members of one frame, and the
// order in which the end elevation draws its outline.
export const profiles = {
  // The A-frame: two base points and an apex over the middle.
  aframe: ({ widthMm, heightMm }) => assertProfile({
    kind: "aframe",
    widthMm,
    heightMm,
    vertices: { A: [0, 0], B: [widthMm, 0], C: [widthMm / 2, heightMm] },
    frame: [["A", "B"], ["B", "C"], ["C", "A"]],
    elevation: { outline: ["C", "A", "B"], edges: [["C", "A"], ["C", "B"], ["A", "B"]] }
  })
};

// Evenly spaced stations with ids prefix1..prefixN between two ratios.
export function stationRun(prefix, count, from = 0, to = 1) {
  if (!Number.isInteger(count) || count < 2) throw new Error("A station run needs at least two stations");
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index + 1}`,
    ratio: from + (index / (count - 1)) * (to - from)
  }));
}

// The solid: one frame of the profile at every station, and a rail along every
// vertex between neighbouring stations of the same run. Runs are separate so a
// building can have a gap between them (an open passage, an extension).
export function extrude(profile, runs, { lengthMm }) {
  assertProfile(profile);
  if (!finite(lengthMm) || lengthMm <= 0) throw new Error("extrude needs a positive lengthMm");
  const nodes = {};
  const edges = [];
  for (const run of runs) {
    run.forEach((station, index) => {
      if (!finite(station.ratio)) throw new Error(`Station ${station.id} needs a finite ratio`);
      for (const [vertex, [y, z]] of Object.entries(profile.vertices)) {
        const name = `${station.id}${vertex}`;
        if (nodes[name]) throw new Error(`Duplicate node ${name}`);
        nodes[name] = { station: station.id, vertex, ratio: station.ratio, x: station.ratio * lengthMm, y, z };
      }
      for (const [from, to] of profile.frame) edges.push([`${station.id}${from}`, `${station.id}${to}`, "frame"]);
      if (index > 0) {
        for (const vertex of profile.rails ?? Object.keys(profile.vertices)) {
          edges.push([`${run[index - 1].id}${vertex}`, `${station.id}${vertex}`, "rail"]);
        }
      }
    });
  }
  return { profile, lengthMm, nodes, edges };
}

// An oblique view: where the solid's origin lands on the sheet, and how far one
// whole length, width and height reach from there, in sheet units.
export function obliqueView({ origin, along, across, up }) {
  for (const [name, vector] of Object.entries({ origin, along, across, up })) {
    if (!Array.isArray(vector) || vector.length !== 2 || !vector.every(finite)) {
      throw new Error(`obliqueView.${name} must be a finite [x, y] vector`);
    }
  }
  return {
    origin, along, across, up,
    // `at` takes a ratio along the length and a point [y, z] of the section.
    at(profile, ratio, [y, z]) {
      const acrossRatio = y / profile.widthMm;
      const upRatio = z / profile.heightMm;
      return [
        origin[0] + across[0] * acrossRatio + up[0] * upRatio + along[0] * ratio,
        origin[1] + across[1] * acrossRatio + up[1] * upRatio + along[1] * ratio
      ];
    }
  };
}

// The solid as the sheet's 3D sketch draws it: named points and node-to-node edges.
export function projectSolid(solid, view) {
  return {
    nodes: Object.fromEntries(Object.entries(solid.nodes).map(([name, node]) =>
      [name, view.at(solid.profile, node.ratio, [node.y, node.z])])),
    edges: solid.edges.map((edge) => [...edge])
  };
}

// The profile fitted into an elevation box on the sheet: z = 0 on `base`, the
// full height on `top`, the width between `left` and `right`.
export function elevation(profile, { left, right, top, base }) {
  assertProfile(profile);
  const place = ([y, z]) => [
    left + (y / profile.widthMm) * (right - left),
    base - (z / profile.heightMm) * (base - top)
  ];
  const points = Object.fromEntries(Object.entries(profile.vertices).map(([name, point]) => [name, place(point)]));
  return {
    points,
    outline: profile.elevation.outline.map((name) => points[name]),
    edges: profile.elevation.edges.map(([from, to]) => [points[from], points[to]])
  };
}

// ---------------------------------------------------------------------------
// More sections. Each has named vertices as [y, z], the members of one frame,
// `rails` (the vertices that carry a member along the building), `base` (the
// two feet) and the outline of the end view.
// ---------------------------------------------------------------------------

// Vertical walls with a flat, mono-pitch or gable roof. The mono-pitch roof is
// low on the near side (y = 0) and high on the far side.
profiles.box = ({ widthMm, wallHeightMm, roof = { kind: "flat" } }) => {
  const rise = roof.kind === "flat" ? 0 : roof.riseMm;
  if (!finite(wallHeightMm) || wallHeightMm <= 0) throw new Error("A box section needs a positive wallHeightMm");
  if (!["flat", "monopitch", "gable"].includes(roof.kind)) throw new Error(`Unknown roof kind: ${roof.kind}`);
  if (roof.kind !== "flat" && (!finite(rise) || rise <= 0)) throw new Error(`A ${roof.kind} roof needs a positive riseMm`);
  const vertices = { A: [0, 0], B: [widthMm, 0], D: [widthMm, wallHeightMm + (roof.kind === "monopitch" ? rise : 0)], E: [0, wallHeightMm] };
  const frame = [["A", "B", "sill"], ["A", "E", "wall"], ["B", "D", "wall"]];
  let outline = ["A", "B", "D", "E"];
  if (roof.kind === "gable") {
    vertices.C = [widthMm / 2, wallHeightMm + rise];
    frame.push(["E", "C", "roof"], ["C", "D", "roof"]);
    outline = ["A", "B", "D", "C", "E"];
  } else {
    frame.push(["E", "D", "roof"]);
  }
  return assertProfile({
    kind: "box", roof: { kind: roof.kind, riseMm: rise }, widthMm, wallHeightMm, heightMm: wallHeightMm + rise,
    vertices, frame, base: ["A", "B"], eaves: ["E", "D"], ridge: roof.kind === "gable" ? "C" : null,
    elevation: { outline, edges: frame.map(([from, to]) => [from, to]) }
  });
};

// A curved rib from foot to foot: a semicircle, a flatter segment of a circle,
// or a pointed arch of two arcs. The curve is drawn as short straight members.
profiles.arch = ({ widthMm, riseMm, kind = "semicircle", segments = 12 }) => {
  const half = widthMm / 2;
  const rise = kind === "semicircle" ? half : riseMm;
  if (!finite(rise) || rise <= 0) throw new Error("An arch needs a positive riseMm");
  if (!Number.isInteger(segments) || segments < 4 || segments % 2) throw new Error("An arch needs an even number of segments, four or more");
  let radiusMm, at;
  if (kind === "semicircle" || kind === "segmental") {
    if (rise > half + 1e-9) throw new Error("A segmental arch cannot rise more than half its span");
    radiusMm = (half * half + rise * rise) / (2 * rise);
    // Half the angle the arc sweeps, seen from its centre.
    const halfAngle = rise >= half ? Math.PI / 2 : Math.asin(Math.min(1, half / radiusMm));
    at = (t) => [half - radiusMm * Math.sin(halfAngle * (1 - 2 * t)), rise - radiusMm + radiusMm * Math.cos(halfAngle * (1 - 2 * t))];
  } else if (kind === "pointed") {
    if (rise < half) throw new Error("A pointed arch must rise at least half its span");
    radiusMm = (half * half + rise * rise) / widthMm;
    const top = Math.atan2(rise, radiusMm - half);
    at = (t) => {
      if (t <= 0.5) { const a = top * (t / 0.5); return [radiusMm - radiusMm * Math.cos(a), radiusMm * Math.sin(a)]; }
      const a = top * ((1 - t) / 0.5);
      return [widthMm - radiusMm + radiusMm * Math.cos(a), radiusMm * Math.sin(a)];
    };
  } else {
    throw new Error(`Unknown arch kind: ${kind}`);
  }
  const names = Array.from({ length: segments + 1 }, (_, index) => `P${index}`);
  const clean = (value) => Math.abs(value) < 1e-6 ? 0 : value;
  const vertices = Object.fromEntries(names.map((name, index) => [name, at(index / segments).map(clean)]));
  vertices.P0 = [0, 0];
  vertices[`P${segments}`] = [widthMm, 0];
  const frame = names.slice(1).map((name, index) => [names[index], name, "rib"]);
  frame.push(["P0", `P${segments}`, "sill"]);
  return assertProfile({
    kind: "arch", arch: kind, widthMm, heightMm: rise, riseMm: rise, radiusMm,
    vertices, frame, base: ["P0", `P${segments}`], ridge: `P${segments / 2}`,
    rails: ["P0", `P${segments / 4 | 0}`, `P${segments / 2}`, `P${segments - (segments / 4 | 0)}`, `P${segments}`],
    elevation: { outline: names, edges: frame.map(([from, to]) => [from, to]) }
  });
};

// ---------------------------------------------------------------------------
// Solids. Every solid has the same shape, so every view can draw any of them:
// nodes as { x, y, z } in millimetres, node-to-node edges with a kind, the
// footprint as [x, y] points, and its overall dimensions.
// ---------------------------------------------------------------------------
const extent = (values) => Math.max(...values) - Math.min(...values);

// A section extruded through stations (see extrude), in the common solid shape.
export function extrusionSolid(profile, runs, { lengthMm }) {
  const solid = extrude(profile, runs, { lengthMm });
  return {
    kind: "extrusion", profile, nodes: solid.nodes, edges: solid.edges,
    footprint: [[0, 0], [lengthMm, 0], [lengthMm, profile.widthMm], [0, profile.widthMm]],
    stations: runs.flat().map((station) => ({ id: station.id, x: station.ratio * lengthMm })),
    dims: { lengthMm, widthMm: profile.widthMm, heightMm: profile.heightMm }
  };
}

// A roof as tilted planes over a footprint. The roof's height at any point is
// the lowest plane above it, so the ridges, hips and sloping wall tops all follow
// from the planes; nothing is placed by hand.
//
//   monopitch: one plane, rising in the direction `rise` ([x, y], default +y).
//   gable:     two planes leaning together; `ridge` is the direction the ridge runs.
//   hip:       one plane rising inward from every wall.
//
// Every plane starts at the wall height on the lowest wall and climbs at `pitchDeg`.
// Gable and hip roofs need a footprint without notches; a monopitch takes any.
export function roofOver(footprint, wallHeightMm, roof = { kind: "flat" }) {
  const kind = roof.kind ?? "flat";
  if (kind === "flat") return { kind, planes: [], faces: [], heightAt: () => wallHeightMm, pitchDeg: 0 };
  if (!["monopitch", "gable", "hip"].includes(kind)) throw new Error(`Unknown roof kind: ${kind}`);
  if (!finite(roof.pitchDeg) || roof.pitchDeg <= 0 || roof.pitchDeg >= 80) throw new Error(`A ${kind} roof needs a pitchDeg between 0 and 80`);
  const slope = Math.tan(roof.pitchDeg * Math.PI / 180);
  const unit = ([x, y], name) => {
    const length = Math.hypot(x, y);
    if (!finite(length) || length === 0) throw new Error(`roof.${name} must be a direction [x, y]`);
    return [x / length, y / length];
  };
  const count = footprint.length;
  const convex = footprint.every((point, index) => {
    const a = footprint[(index + 1) % count], b = footprint[(index + 2) % count];
    return (a[0] - point[0]) * (b[1] - a[1]) - (a[1] - point[1]) * (b[0] - a[0]) >= -1e-6;
  });
  if (kind !== "monopitch" && !convex) throw new Error(`A ${kind} roof needs a footprint without notches`);
  // A plane is z = a x + b y + c.
  const rising = (direction, from) => ({ a: slope * direction[0], b: slope * direction[1], c: wallHeightMm - slope * from });
  let planes;
  if (kind === "monopitch") {
    const direction = unit(roof.rise ?? [0, 1], "rise");
    planes = [rising(direction, Math.min(...footprint.map(([x, y]) => x * direction[0] + y * direction[1])))];
  } else if (kind === "gable") {
    const along = unit(roof.ridge ?? [1, 0], "ridge");
    const across = [-along[1], along[0]];
    const reach = footprint.map(([x, y]) => x * across[0] + y * across[1]);
    planes = [rising(across, Math.min(...reach)), rising([-across[0], -across[1]], -Math.max(...reach))];
  } else {
    planes = footprint.map((from, index) => {
      const to = footprint[(index + 1) % count];
      const inward = unit([-(to[1] - from[1]), to[0] - from[0]], "wall");
      return rising(inward, from[0] * inward[0] + from[1] * inward[1]);
    });
  }
  const heightOn = (plane, [x, y]) => plane.a * x + plane.b * y + plane.c;
  const heightAt = (x, y) => Math.min(...planes.map((plane) => heightOn(plane, [x, y])));
  // The part of the footprint each plane covers: where it is the lowest.
  const faces = planes.map((plane, index) => {
    let region = footprint.map((point) => [...point]);
    planes.forEach((other, otherIndex) => {
      if (otherIndex === index || region.length < 3) return;
      const beyond = (point) => heightOn(plane, point) - heightOn(other, point);
      const kept = [];
      region.forEach((point, at) => {
        const next = region[(at + 1) % region.length];
        const here = beyond(point), there = beyond(next);
        if (here <= 1e-6) kept.push(point);
        if ((here < -1e-6 && there > 1e-6) || (here > 1e-6 && there < -1e-6)) {
          const t = here / (here - there);
          kept.push([point[0] + (next[0] - point[0]) * t, point[1] + (next[1] - point[1]) * t]);
        }
      });
      region = kept;
    });
    return region;
  }).filter((region) => {
    const doubled = region.reduce((sum, [x, y], at) => { const [nx, ny] = region[(at + 1) % region.length]; return sum + x * ny - nx * y; }, 0);
    return region.length >= 3 && Math.abs(doubled) > 1;
  });
  return { kind, planes, faces, heightAt, pitchDeg: roof.pitchDeg };
}

// Vertical walls on any footprint: the solid for a building whose plan is not a
// rectangle. Corners are listed anticlockwise seen from above. The top is flat
// unless `roof` asks for planes (see roofOver).
export function prismSolid({ footprint, wallHeightMm, roof = { kind: "flat" } }) {
  if (!Array.isArray(footprint) || footprint.length < 3) throw new Error("A footprint needs at least three corners");
  if (!finite(wallHeightMm) || wallHeightMm <= 0) throw new Error("A prism needs a positive wallHeightMm");
  let doubleArea = 0;
  footprint.forEach(([x, y], index) => {
    if (!finite(x) || !finite(y)) throw new Error("Footprint corners must be finite [x, y] points");
    const [nx, ny] = footprint[(index + 1) % footprint.length];
    doubleArea += x * ny - nx * y;
  });
  if (doubleArea <= 0) throw new Error("List the footprint corners anticlockwise");
  const cover = roofOver(footprint, wallHeightMm, roof);
  const nodes = {}, edges = [];
  const common = {
    kind: "prism", footprint: footprint.map((point) => [...point]), wallHeightMm, areaM2: doubleArea / 2e6,
    roof: { kind: cover.kind, pitchDeg: cover.pitchDeg }, roofHeightAt: cover.heightAt
  };
  footprint.forEach(([x, y], index) => {
    const next = (index + 1) % footprint.length;
    nodes[`G${index + 1}`] = { x, y, z: 0 };
    edges.push([`G${index + 1}`, `G${next + 1}`, "sill"]);
  });
  if (cover.kind === "flat") {
    footprint.forEach(([x, y], index) => {
      const next = (index + 1) % footprint.length;
      nodes[`T${index + 1}`] = { x, y, z: wallHeightMm };
      edges.push([`T${index + 1}`, `T${next + 1}`, "roof"], [`G${index + 1}`, `T${index + 1}`, "wall"]);
    });
    return { ...common, nodes, edges, dims: { lengthMm: extent(footprint.map(([x]) => x)), widthMm: extent(footprint.map(([, y]) => y)), heightMm: wallHeightMm } };
  }
  // Roof corners, named once each however many faces meet there.
  const names = new Map();
  const nameOf = ([x, y]) => {
    const key = `${Math.round(x * 100)}:${Math.round(y * 100)}`;
    if (!names.has(key)) {
      names.set(key, `R${names.size + 1}`);
      nodes[names.get(key)] = { x, y, z: cover.heightAt(x, y) };
    }
    return names.get(key);
  };
  // A roof edge on the outline of the building is an eave; any other is a ridge or hip.
  const onOutline = (a, b) => footprint.some((from, index) => {
    const to = footprint[(index + 1) % footprint.length];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const off = (p) => Math.abs((to[0] - from[0]) * (p[1] - from[1]) - (to[1] - from[1]) * (p[0] - from[0])) / length;
    return off(a) < 0.01 && off(b) < 0.01;
  });
  const drawn = new Set();
  const roofFaces = cover.faces.map((face) => face.map(nameOf));
  for (const face of cover.faces) {
    face.forEach((point, index) => {
      const next = face[(index + 1) % face.length];
      const from = nameOf(point), to = nameOf(next);
      const key = [from, to].sort().join(">");
      if (from === to || drawn.has(key)) return;
      drawn.add(key);
      edges.push([from, to, onOutline(point, next) ? "roof" : "ridge"]);
    });
  }
  footprint.forEach((point, index) => edges.push([`G${index + 1}`, nameOf(point), "wall"]));
  const top = Math.max(...Object.values(nodes).map((node) => node.z));
  return { ...common, nodes, edges, roofFaces, dims: { lengthMm: extent(footprint.map(([x]) => x)), widthMm: extent(footprint.map(([, y]) => y)), heightMm: top } };
}

// A curve turned about a vertical axis: a dome, a cone, a lavvo. The curve is
// [radius, height] points from the foot to the top.
export function revolvedSolid({ curve, meridians = 12, around = 36 }) {
  if (!Array.isArray(curve) || curve.length < 2) throw new Error("A revolved solid needs a curve of at least two points");
  for (const [r, z] of curve) if (!finite(r) || !finite(z) || r < 0 || z < 0) throw new Error("Curve points must be [radius, height], neither negative");
  const radius = curve[0][0];
  if (radius <= 0) throw new Error("The curve must start at the foot, with a radius above zero");
  if (around % meridians) throw new Error("`around` must be a multiple of `meridians`");
  const nodes = {}, edges = [];
  const place = (ring, step) => {
    const angle = (step / around) * 2 * Math.PI, [r, z] = curve[ring];
    return { x: radius + r * Math.cos(angle), y: radius + r * Math.sin(angle), z, bearing: angle };
  };
  curve.forEach(([r], ring) => {
    for (let step = 0; step < around; step += 1) {
      if (r === 0 && step > 0) continue;
      nodes[`R${ring}S${step}`] = place(ring, step);
    }
    if (r > 0) for (let step = 0; step < around; step += 1) edges.push([`R${ring}S${step}`, `R${ring}S${(step + 1) % around}`, ring === 0 ? "sill" : "ring"]);
  });
  for (let ring = 1; ring < curve.length; ring += 1) {
    for (let step = 0; step < around; step += around / meridians) {
      const upper = curve[ring][0] === 0 ? `R${ring}S0` : `R${ring}S${step}`;
      edges.push([`R${ring - 1}S${step}`, upper, "rib"]);
    }
  }
  const height = Math.max(...curve.map(([, z]) => z));
  return {
    kind: "revolved", nodes, edges, curve: curve.map((point) => [...point]), radiusMm: radius, meridians,
    footprint: Array.from({ length: around }, (_, step) => { const p = place(0, step); return [p.x, p.y]; }),
    dims: { lengthMm: radius * 2, widthMm: radius * 2, heightMm: height }
  };
}

// The radius of a revolved solid at a height, read off its curve.
export function radiusAt(solid, z) {
  const curve = solid.curve;
  if (z <= curve[0][1]) return curve[0][0];
  for (let index = 1; index < curve.length; index += 1) {
    const [r0, z0] = curve[index - 1], [r1, z1] = curve[index];
    if (z >= Math.min(z0, z1) && z <= Math.max(z0, z1) && z1 !== z0) return r0 + (r1 - r0) * (z - z0) / (z1 - z0);
  }
  return curve.at(-1)[0];
}

// The outline of a set of points as seen flat: their convex hull, anticlockwise.
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const hull = [];
    for (const point of list) {
      while (hull.length >= 2 && cross(hull.at(-2), hull.at(-1), point) <= 1e-9) hull.pop();
      hull.push(point);
    }
    hull.pop();
    return hull;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

// ---------------------------------------------------------------------------
// Faces: the outside of a solid as flat polygons, for views that hide what is
// behind (the 3D sketch). Each face has its points as { x, y, z }, the outward
// normal, a kind (wall, end, roof) and, where it has them, the node names at its
// corners. Floors are left out: no view looks at a building from below.
//
// `overhangMm` lets the roof of a box section run past the walls: past both
// gable ends, and down its slope past the eaves, as the elevations draw it.
// ---------------------------------------------------------------------------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
function newell(points) {
  const normal = { x: 0, y: 0, z: 0 };
  points.forEach((p, index) => {
    const q = points[(index + 1) % points.length];
    normal.x += (p.y - q.y) * (p.z + q.z);
    normal.y += (p.z - q.z) * (p.x + q.x);
    normal.z += (p.x - q.x) * (p.y + q.y);
  });
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
  return { x: normal.x / length, y: normal.y / length, z: normal.z / length };
}
// A face whose normal points the way `outward` says, whatever order its corners came in.
function face(kind, points, outward, nodes = null) {
  let normal = newell(points);
  if (dot(normal, outward) < 0) {
    points = [...points].reverse();
    nodes = nodes ? [...nodes].reverse() : null;
    normal = { x: -normal.x, y: -normal.y, z: -normal.z };
  }
  return { kind, points, normal, nodes };
}

export function solidFaces(solid, { overhangMm = 0 } = {}) {
  if (solid.kind === "extrusion") {
    const profile = solid.profile, L = solid.dims.lengthMm;
    const outline = profile.elevation.outline.map((name) => ({ name, at: profile.vertices[name] }));
    const middle = outline.reduce(([sy, sz], { at: [y, z] }) => [sy + y / outline.length, sz + z / outline.length], [0, 0]);
    const eaves = new Set(profile.eaves ?? []);
    const over = profile.kind === "box" ? overhangMm : 0;
    const faces = [];
    outline.forEach((from, index) => {
      const to = outline[(index + 1) % outline.length];
      let [y0, z0] = from.at, [y1, z1] = to.at;
      if (z0 === 0 && z1 === 0) return; // the floor
      const vertical = Math.abs(y1 - y0) < 1e-6;
      const kind = vertical ? "wall" : "roof";
      const outward = { x: 0, y: (y0 + y1) / 2 - middle[0], z: (z0 + z1) / 2 - middle[1] };
      let x0 = 0, x1 = L;
      if (kind === "roof" && over > 0) {
        // Run the roof down its slope past each eave, by the overhang measured flat.
        const run = Math.abs(y1 - y0), dy = (y1 - y0) / run * over, dz = (z1 - z0) / run * over;
        if (eaves.has(from.name)) { y0 -= dy; z0 -= dz; }
        if (eaves.has(to.name)) { y1 += dy; z1 += dz; }
        x0 = -over; x1 = L + over;
      }
      faces.push(face(kind, [{ x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y0, z: z0 }], outward));
    });
    for (const [x, sign] of [[0, -1], [L, 1]]) {
      faces.push(face("end", outline.map(({ at: [y, z] }) => ({ x, y, z })), { x: sign, y: 0, z: 0 }));
    }
    return faces;
  }
  if (solid.kind === "prism") {
    const faces = [];
    const tops = Object.entries(solid.nodes).filter(([, node]) => node.z > 0);
    solid.footprint.forEach((from, index) => {
      const next = (index + 1) % solid.footprint.length, to = solid.footprint[next];
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const along = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
      // Every roof corner on this wall's line, from its far end back to its start.
      const onWall = tops.filter(([, node]) => Math.abs((node.x - from[0]) * along[1] - (node.y - from[1]) * along[0]) < 0.01)
        .map(([name, node]) => ({ name, node, t: (node.x - from[0]) * along[0] + (node.y - from[1]) * along[1] }))
        .filter(({ t }) => t > -0.01 && t < length + 0.01)
        .sort((a, b) => b.t - a.t);
      const names = [`G${index + 1}`, `G${next + 1}`, ...onWall.map(({ name }) => name)];
      faces.push(face("wall", names.map((name) => solid.nodes[name]), { x: along[1], y: -along[0], z: 0 }, names));
    });
    const roofs = solid.roofFaces ?? [solid.footprint.map((_, index) => `T${index + 1}`)];
    for (const names of roofs) faces.push(face("roof", names.map((name) => solid.nodes[name]), { x: 0, y: 0, z: 1 }, names));
    return faces;
  }
  if (solid.kind === "revolved") {
    const centre = { x: solid.radiusMm, y: solid.radiusMm };
    const around = Object.keys(solid.nodes).filter((name) => name.startsWith("R0S")).length;
    const faces = [];
    for (let ring = 1; ring < solid.curve.length; ring += 1) {
      for (let step = 0; step < around; step += 1) {
        const next = (step + 1) % around;
        const top = solid.curve[ring][0] === 0;
        const names = top
          ? [`R${ring - 1}S${step}`, `R${ring - 1}S${next}`, `R${ring}S0`]
          : [`R${ring - 1}S${step}`, `R${ring - 1}S${next}`, `R${ring}S${next}`, `R${ring}S${step}`];
        const points = names.map((name) => solid.nodes[name]);
        const mid = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 });
        faces.push(face("wall", points, { x: mid.x - centre.x, y: mid.y - centre.y, z: 0.2 * solid.radiusMm }, names));
      }
    }
    return faces;
  }
  throw new Error(`No faces for a ${solid.kind} solid`);
}
