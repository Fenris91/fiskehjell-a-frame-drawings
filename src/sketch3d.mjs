// The 3D sketch every sheet draws: a solid's faces seen from the near-left
// corner of the plan, above, in true proportions (an axonometric view, no
// perspective). The near side is the side elevation's, the start end is the end
// elevation's, so the sketch can be read against both.
//
// Everything is drawn from 3D points in millimetres, the same numbers the plan
// and elevations are drawn from; nothing is placed on the sheet by hand. Faces
// turned away are left out, nearer faces cover further ones, and lines and
// points are cut where a face is in front of them.

const AZIMUTH = 36 * Math.PI / 180;
const TILT = 20 * Math.PI / 180;
export const view = {
  right: { x: Math.cos(AZIMUTH), y: -Math.sin(AZIMUTH), z: 0 },
  up: { x: Math.sin(AZIMUTH) * Math.sin(TILT), y: Math.cos(AZIMUTH) * Math.sin(TILT), z: Math.cos(TILT) },
  // Away from the viewer: a larger value is further back.
  into: { x: Math.sin(AZIMUTH) * Math.cos(TILT), y: Math.cos(AZIMUTH) * Math.cos(TILT), z: -Math.sin(TILT) }
};
export const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const flat = (p) => [dot3(p, view.right), -dot3(p, view.up)];

// Faces that turn towards the viewer.
export const facing = (faces) => faces.filter((face) => dot3(face.normal, view.into) < -1e-9);
export const depthOf = (face) => face.points.reduce((sum, p) => sum + dot3(p, view.into), 0) / face.points.length;

// A function placing 3D points on the sheet, with everything in `points` fitted
// into `box` ({ x, y, w, h }) at one scale.
export function fit(points, box) {
  const flats = points.map(flat);
  const xs = flats.map(([x]) => x), ys = flats.map(([, y]) => y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX, spanY = Math.max(...ys) - minY;
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const left = box.x + (box.w - spanX * scale) / 2, top = box.y + (box.h - spanY * scale) / 2;
  const place = (p) => { const [x, y] = flat(p); return [left + (x - minX) * scale, top + (y - minY) * scale]; };
  place.scale = scale;
  return place;
}

function inside([x, y], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Whether a point is behind one of the faces (a point on a face is not).
export function hiddenBehind(faces) {
  const shapes = faces.map((face) => ({ face, outline: face.points.map(flat), d: dot3(face.normal, face.points[0]), n: dot3(face.normal, view.into) }));
  return (p) => {
    const at = flat(p), depth = dot3(p, view.into);
    return shapes.some(({ face, outline, d, n }) => {
      if (!inside(at, outline)) return false;
      // Where the line of sight through this point crosses the face's plane.
      const base = { x: at[0] * view.right.x - at[1] * view.up.x, y: at[0] * view.right.y - at[1] * view.up.y, z: at[0] * view.right.z - at[1] * view.up.z };
      const t = (d - dot3(face.normal, base)) / n;
      return depth > t + 1;
    });
  };
}

// The parts of a 3D line that are not behind a face, as [from, to] pairs.
export function visibleParts(hidden, from, to, steps = 64) {
  const at = (t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t });
  const parts = [];
  let start = null;
  for (let i = 0; i < steps; i += 1) {
    const seen = !hidden(at((i + 0.5) / steps));
    if (seen && start === null) start = i / steps;
    if (!seen && start !== null) { parts.push([at(start), at(i / steps)]); start = null; }
  }
  if (start !== null) parts.push([at(start), to]);
  return parts;
}
