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
  for (const [from, to] of [...profile.frame, ...profile.elevation.edges]) {
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
        for (const vertex of Object.keys(profile.vertices)) {
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
