// A building specification turned into everything a drawing needs: the solid,
// its walls, openings, braces and foundation pads as real positions in
// millimetres, plus the checks the audit mode reports.
//
// X runs along the length, Y across the width, Z up. Walls are the edges of the
// footprint taken anticlockwise seen from above, so "left to right" along a wall
// is how it reads from outside.
import { extrusionSolid, prismSolid, profiles, radiusAt, revolvedSolid, stationRun } from "./geometry.mjs";

const finite = (value) => Number.isFinite(value);
const round1 = (value) => Math.round(value * 10) / 10;

function formSolid(form) {
  if (form.kind === "box") {
    const profile = profiles.box({ widthMm: form.widthMm, wallHeightMm: form.wallHeightMm, roof: form.roof ?? { kind: "flat" } });
    return extrusionSolid(profile, [stationRun("", form.frames ?? 2)], { lengthMm: form.lengthMm });
  }
  if (form.kind === "arch") {
    const profile = profiles.arch({ widthMm: form.widthMm, riseMm: form.riseMm, kind: form.arch ?? "semicircle", segments: form.segments ?? 12 });
    return extrusionSolid(profile, [stationRun("", form.frames ?? 2)], { lengthMm: form.lengthMm });
  }
  if (form.kind === "footprint") return prismSolid({ footprint: form.corners, wallHeightMm: form.wallHeightMm });
  if (form.kind === "round") {
    const steps = form.shape === "dome" ? 6 : 1;
    const top = form.topRadiusMm ?? 0;
    const curve = form.shape === "dome"
      // A dome is part of a sphere through the foot and the crown.
      ? (() => {
          const R = (form.radiusMm ** 2 + form.heightMm ** 2) / (2 * form.heightMm);
          const start = Math.asin(Math.min(1, form.radiusMm / R));
          return Array.from({ length: steps + 1 }, (_, index) => {
            const angle = start * (1 - index / steps);
            // The foot and the crown are exact; rounding must not lift the foot off the ground.
            if (index === 0) return [form.radiusMm, 0];
            return [index === steps ? 0 : R * Math.sin(angle), form.heightMm - R + R * Math.cos(angle)];
          });
        })()
      : [[form.radiusMm, 0], [top, form.heightMm]];
    if (!["dome", "cone"].includes(form.shape)) throw new Error(`Unknown round shape: ${form.shape}`);
    return revolvedSolid({ curve, meridians: form.meridians ?? 12 });
  }
  throw new Error(`Unknown building form: ${form.kind}`);
}

// The top of a wall, as a height, at a ratio along it.
function wallTop(solid, wall, ratio) {
  if (solid.kind === "prism") return solid.wallHeightMm;
  if (solid.kind === "revolved") return solid.dims.heightMm;
  const profile = solid.profile;
  if (wall.id === "near" || wall.id === "far") {
    if (profile.kind !== "box") return 0;
    return profile.vertices[wall.id === "near" ? "E" : "D"][1];
  }
  // A gable end: read the height off the section's upper outline.
  const y = wall.id === "start" ? profile.widthMm * (1 - ratio) : profile.widthMm * ratio;
  const upper = profile.elevation.outline.map((name) => profile.vertices[name]).filter(([, z], index, all) => z > 0 || index === 0 || index === all.length - 1);
  const points = profile.kind === "box"
    ? [profile.vertices.E, ...(profile.ridge ? [profile.vertices.C] : []), profile.vertices.D]
    : upper;
  for (let index = 1; index < points.length; index += 1) {
    const [y0, z0] = points[index - 1], [y1, z1] = points[index];
    if (y >= y0 - 1e-6 && y <= y1 + 1e-6) return y1 === y0 ? Math.max(z0, z1) : z0 + (z1 - z0) * (y - y0) / (y1 - y0);
  }
  return 0;
}

export function buildingModel(spec) {
  const form = spec.form;
  if (!form) throw new Error(`${spec.id}: a building needs a form`);
  const solid = formSolid(form);
  const thickness = spec.wallThicknessMm ?? 150;

  // Walls: the footprint's edges, anticlockwise. A round building has one.
  const names = solid.kind === "extrusion" ? ["near", "end", "far", "start"] : null;
  const walls = solid.kind === "revolved"
    ? [{ id: "ring", label: "Wall", round: true, lengthMm: 2 * Math.PI * solid.radiusMm }]
    : solid.footprint.map((from, index) => {
        const to = solid.footprint[(index + 1) % solid.footprint.length];
        const lengthMm = Math.hypot(to[0] - from[0], to[1] - from[1]);
        const along = [(to[0] - from[0]) / lengthMm, (to[1] - from[1]) / lengthMm];
        return {
          id: names ? names[index] : `W${index + 1}`,
          label: names ? { near: "Near side", end: "End", far: "Far side", start: "Start" }[names[index]] : `Wall ${index + 1}`,
          from, to, lengthMm, along, normal: [along[1], -along[0]],
          bearingDeg: round1(((Math.atan2(along[0], along[1]) * 180 / Math.PI) + 360) % 360)
        };
      });
  const wallById = new Map(walls.map((wall) => [String(wall.id), wall]));
  const findWall = (id) => {
    const wall = wallById.get(String(id)) ?? wallById.get(`W${id}`);
    if (!wall) throw new Error(`${spec.id}: unknown wall ${id}`);
    return wall;
  };

  const checks = [];
  const check = (ok, text) => checks.push({ ok: Boolean(ok), text });

  const openings = (spec.openings ?? []).map((opening) => {
    const sill = opening.sillMm ?? 0;
    for (const key of ["widthMm", "heightMm"]) if (!finite(opening[key]) || opening[key] <= 0) throw new Error(`${spec.id}: opening ${opening.id} needs a positive ${key}`);
    if (solid.kind === "revolved") {
      const bearing = (opening.bearingDeg ?? 0) * Math.PI / 180;
      const half = opening.widthMm / 2 / solid.radiusMm;
      const at = (angle, z) => { const r = radiusAt(solid, z); return { x: solid.radiusMm + r * Math.cos(angle), y: solid.radiusMm + r * Math.sin(angle), z }; };
      const top = sill + opening.heightMm;
      check(top <= solid.dims.heightMm && radiusAt(solid, top) * 2 * Math.sin(half) > opening.widthMm * 0.5,
        `${opening.id}: ${opening.widthMm} × ${opening.heightMm} fits the wall at bearing ${opening.bearingDeg ?? 0}°`);
      return { ...opening, sillMm: sill, wall: walls[0], offsetMm: null, normal: [Math.cos(bearing), Math.sin(bearing)],
        quad: [at(bearing - half, sill), at(bearing + half, sill), at(bearing + half, top), at(bearing - half, top)] };
    }
    const wall = findWall(opening.wall);
    const centre = (opening.center ?? 0.5) * wall.lengthMm;
    const offsetMm = centre - opening.widthMm / 2;
    const at = (distance, z) => ({ x: wall.from[0] + wall.along[0] * distance, y: wall.from[1] + wall.along[1] * distance, z });
    const top = sill + opening.heightMm;
    const headroom = Math.min(wallTop(solid, wall, offsetMm / wall.lengthMm), wallTop(solid, wall, (offsetMm + opening.widthMm) / wall.lengthMm));
    check(offsetMm >= thickness && offsetMm + opening.widthMm <= wall.lengthMm - thickness,
      `${opening.id}: inside ${wall.label.toLowerCase()} along its length (${Math.round(offsetMm)} to ${Math.round(offsetMm + opening.widthMm)} of ${Math.round(wall.lengthMm)} mm)`);
    check(top <= headroom + 1e-6, `${opening.id}: head at ${Math.round(top)} mm is under the wall top (${Math.round(headroom)} mm)`);
    return { ...opening, sillMm: sill, wall, offsetMm, normal: wall.normal,
      quad: [at(offsetMm, sill), at(offsetMm + opening.widthMm, sill), at(offsetMm + opening.widthMm, top), at(offsetMm, top)] };
  });
  for (const wall of walls) {
    const here = openings.filter((opening) => opening.wall === wall && opening.offsetMm !== null).sort((a, b) => a.offsetMm - b.offsetMm);
    // Two openings clash only if they share both a stretch of wall and a band of height.
    for (let first = 0; first < here.length; first += 1) {
      for (let second = first + 1; second < here.length; second += 1) {
        const a = here[first], b = here[second];
        const apartAlong = a.offsetMm + a.widthMm <= b.offsetMm;
        const apartUp = a.sillMm + a.heightMm <= b.sillMm || b.sillMm + b.heightMm <= a.sillMm;
        check(apartAlong || apartUp, `${a.id} and ${b.id} do not overlap on ${wall.label.toLowerCase()}`);
      }
    }
  }

  // Braces: straight members from one point to another, on a wall or in a frame.
  const braces = (spec.braces ?? []).map((brace) => {
    let from, to, where;
    if (brace.station !== undefined) {
      if (solid.kind !== "extrusion") throw new Error(`${spec.id}: brace ${brace.id} names a station, but this form has none`);
      const station = solid.stations[brace.station - 1];
      if (!station) throw new Error(`${spec.id}: brace ${brace.id} names station ${brace.station}`);
      const at = ([across, z]) => ({ x: station.x, y: across * solid.dims.widthMm, z });
      from = at(brace.from); to = at(brace.to); where = `frame ${brace.station}`;
    } else {
      const wall = findWall(brace.wall);
      const at = ([along, z]) => ({ x: wall.from[0] + wall.along[0] * along * wall.lengthMm, y: wall.from[1] + wall.along[1] * along * wall.lengthMm, z });
      from = at(brace.from); to = at(brace.to); where = wall.label.toLowerCase();
      check([brace.from, brace.to].every(([along, z]) => along >= 0 && along <= 1 && z >= 0 && z <= wallTop(solid, wall, along) + 1e-6),
        `${brace.id}: both ends are on ${where}`);
    }
    const run = Math.hypot(to.x - from.x, to.y - from.y), riseMm = to.z - from.z;
    return { ...brace, from, to, where, lengthMm: Math.hypot(run, riseMm), angleDeg: round1(Math.abs(Math.atan2(riseMm, run)) * 180 / Math.PI) };
  });

  // Foundation pads: under every post of an extrusion, every corner of a
  // footprint, every rib of a round building.
  const [padX, padY] = spec.foundation?.padMm ?? [600, 600];
  let pads;
  if (solid.kind === "extrusion") {
    pads = solid.stations.flatMap((station, index) => [
      { id: `${index + 1}A`, x: station.x, y: 0 }, { id: `${index + 1}B`, x: station.x, y: solid.dims.widthMm }]);
    const bays = solid.stations.slice(1).map((station, index) => station.x - solid.stations[index].x);
    check(Math.abs(bays.reduce((sum, bay) => sum + bay, 0) - solid.dims.lengthMm) < 1e-6,
      `${bays.length} bays of ${Math.round(bays[0])} mm add up to the length, ${Math.round(solid.dims.lengthMm)} mm`);
    check(solid.stations.length === bays.length + 1, `${solid.stations.length} frames for ${bays.length} bays`);
  } else if (solid.kind === "prism") {
    pads = solid.footprint.map(([x, y], index) => ({ id: `C${index + 1}`, x, y }));
    check(true, `Footprint closes with ${solid.footprint.length} corners, listed anticlockwise`);
  } else {
    pads = Array.from({ length: solid.meridians }, (_, index) => {
      const angle = (index / solid.meridians) * 2 * Math.PI;
      return { id: `M${index + 1}`, x: solid.radiusMm + solid.radiusMm * Math.cos(angle), y: solid.radiusMm + solid.radiusMm * Math.sin(angle) };
    });
    check(true, `${solid.meridians} ribs at ${round1(360 / solid.meridians)}° spacing`);
  }
  pads = pads.map((pad) => ({ ...pad, sizeX: padX, sizeY: padY }));
  check(new Set(pads.map((pad) => pad.id)).size === pads.length, `${pads.length} foundation pads, each with its own label`);

  // Key figures.
  const doubleArea = solid.footprint.reduce((sum, [x, y], index) => {
    const [nx, ny] = solid.footprint[(index + 1) % solid.footprint.length];
    return sum + x * ny - nx * y;
  }, 0);
  const facts = {
    lengthMm: solid.dims.lengthMm, widthMm: solid.dims.widthMm, heightMm: solid.dims.heightMm,
    areaM2: solid.kind === "revolved" ? Math.PI * solid.radiusMm ** 2 / 1e6 : Math.abs(doubleArea) / 2e6,
    perimeterM: solid.kind === "revolved" ? 2 * Math.PI * solid.radiusMm / 1000 : walls.reduce((sum, wall) => sum + wall.lengthMm, 0) / 1000
  };
  if (form.kind === "box") {
    facts.wallHeightMm = form.wallHeightMm;
    const roof = solid.profile.roof;
    if (roof.kind !== "flat") {
      const run = roof.kind === "gable" ? form.widthMm / 2 : form.widthMm;
      facts.roofPitchDeg = round1(Math.atan2(roof.riseMm, run) * 180 / Math.PI);
      facts.rafterMm = Math.hypot(run, roof.riseMm);
      check(facts.roofPitchDeg > 0 && facts.roofPitchDeg < 75, `Roof pitch ${facts.roofPitchDeg}° from a rise of ${roof.riseMm} mm over ${Math.round(run)} mm`);
    }
  }
  if (form.kind === "arch") {
    facts.radiusMm = solid.profile.radiusMm; facts.riseMm = solid.profile.riseMm;
    const crown = solid.profile.vertices[solid.profile.ridge];
    check(Math.abs(crown[1] - solid.profile.riseMm) < 1e-6 && Math.abs(crown[0] - form.widthMm / 2) < 1e-6,
      `Arch crown is over the middle at ${Math.round(solid.profile.riseMm)} mm; radius ${Math.round(solid.profile.radiusMm)} mm`);
  }
  if (form.kind === "round") { facts.radiusMm = solid.radiusMm; facts.diameterMm = solid.radiusMm * 2; }
  if (form.kind === "footprint") {
    facts.wallHeightMm = form.wallHeightMm;
    const angled = walls.filter((wall) => wall.bearingDeg % 90 !== 0);
    check(true, `${walls.length} walls, ${angled.length} of them at an angle to the others`);
  }

  return { spec, solid, walls, openings, braces, pads, checks, facts, thicknessMm: thickness, overhangMm: form.kind === "box" ? form.roof?.overhangMm ?? 0 : 0 };
}
