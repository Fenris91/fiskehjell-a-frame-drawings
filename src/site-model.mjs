const finite = (value) => Number.isFinite(value);

// An invented example site. Nothing here is surveyed or copied from a real place: it is
// laid out to show how the pieces are meant to work together.
//
//   North: the road, with the public entrance and the ticket booth beside it.
//   West:  the Hall (main room) with its backstage block and delivery gate behind it,
//          so crew and goods never cross the public yard.
//   Middle: an open yard with the kitchen and bar on its east side, serving every room.
//   South: the long Shell 8 across the yard from the entrance, with its own back exit.
//   East:  the waterfront, with the boathouse, sauna, changing rooms and a quiet shell.
//
// Coordinates are metres from the centre of the Hall, rounded to half a metre.
// angleDeg 0 puts a structure's length north-south; 90 puts it east-west.
export const siteModel = {
  schemaVersion: 2,
  coordinateSystem: {
    kind: "local-relative",
    originStructureId: "hall",
    horizontalAxes: ["east", "north"],
    verticalAxis: "z",
    unit: "m",
    surveyed: false
  },
  structures: [
    { id: "hall", name: "Hall", role: "Main room and stage", category: "aframe", east: 0, north: 0, width: 12, length: 27, height: 10.5, angleDeg: 0, dimensionStatus: "coordinated" },
    { id: "shell6", name: "Shell 6", role: "Foyer beside the entrance", category: "aframe", east: 22, north: 22, width: 12, length: 13.5, height: 10.5, angleDeg: 90, dimensionStatus: "provisional" },
    { id: "shell8", name: "Shell 8", role: "Second room and dining", category: "aframe", east: 24, north: -27, width: 12, length: 18.9, height: 10.5, angleDeg: 90, dimensionStatus: "provisional" },
    { id: "shell6d", name: "Shell 6D", role: "Quiet room by the water", category: "aframe", east: 58, north: 14, width: 12, length: 13.5, height: 10.5, angleDeg: 0, dimensionStatus: "provisional" },
    { id: "kitchen-bar", name: "Kitchen and bar", role: "Serves the yard and every room", category: "permanent", east: 30, north: -2, width: 20, length: 12, height: 5.5, angleDeg: 0, dimensionStatus: "approximate" },
    { id: "boathouse", name: "Boathouse", role: "Boats and waterfront storage", category: "permanent", east: 58, north: -8, width: 16, length: 7.5, height: 5, angleDeg: 0, dimensionStatus: "approximate" },
    { id: "sauna", name: "Sauna", role: "Next to the water", category: "permanent", east: 62, north: -20, width: 4.5, length: 11.5, height: 3.5, angleDeg: 90, dimensionStatus: "approximate" },
    { id: "changing-rooms", name: "Changing rooms", role: "Between sauna and yard", category: "permanent", east: 46, north: -30, width: 3.5, length: 9, height: 3.5, angleDeg: 90, dimensionStatus: "approximate" },
    { id: "dock-store", name: "Dock store", role: "Waterfront equipment", category: "permanent", east: 50, north: 28, width: 3.5, length: 9, height: 3.5, angleDeg: 0, dimensionStatus: "approximate" },
    { id: "ticket-booth", name: "Tickets · WC", role: "At the public entrance", category: "service", east: 40, north: 28, width: 10, length: 5, height: 3, angleDeg: 0, dimensionStatus: "approximate" },
    { id: "backstage", name: "Backstage · 2 floors", role: "Crew, offices and stores behind the Hall", category: "service", east: -16, north: -4, width: 8, length: 26.5, height: 6, angleDeg: 0, dimensionStatus: "approximate" },
    // The two footprints that are not rectangles: a round lavvo in the yard, and the
    // wedge by the road with its angled wall. Both are drawn as building sheets too.
    { id: "lavvo", name: "Lavvo", role: "Fire and gathering in the yard", category: "permanent", round: true, east: 13, north: -1, width: 8, length: 8, height: 6, angleDeg: 0, dimensionStatus: "provisional" },
    { id: "wedge", name: "Wedge", role: "Workshop by the road", category: "permanent", outline: [[-3, -5.5], [3, -5.5], [3, 5.5], [0, 5.5], [-3, 2.5]], east: -8, north: 24, width: 6, length: 11, height: 3, angleDeg: 90, dimensionStatus: "provisional" },
    { id: "container", name: "Container", role: "Deliveries by the technical gate", category: "mobile", east: -15, north: -27, width: 4, length: 11.5, height: 3, angleDeg: 90, dimensionStatus: "approximate" }
  ],
  perimeter: [
    { east: -22, north: -36 },
    { east: -22, north: 34 },
    { east: 60, north: 34 },
    { east: 68, north: 26 },
    { east: 68, north: -30 },
    { east: 62, north: -36 }
  ],
  zones: [
    {
      id: "yard",
      kind: "outdoor",
      name: "Yard / Uteareal",
      points: [[7, 14], [18, 14], [18, 8], [42, 8], [48, 2], [48, -14], [42, -19], [12, -19], [7, -14]]
    },
    {
      id: "waterfront",
      kind: "dock",
      name: "Waterfront / Kai",
      points: [[48, 34], [60, 34], [68, 26], [68, -30], [62, -36], [48, -36]]
    },
    {
      id: "public-loop",
      kind: "circulation",
      name: "Public loop / Publikumsrunde",
      points: [[30, 32], [32, 12], [44, 6], [48, 0], [48, -13], [40, -18], [12, -17], [10, 10], [14, 30]]
    }
  ],
  exits: [
    { id: "main-north", name: "Public entrance · north", east: 30, north: 34, angleDeg: -90 },
    { id: "waterfront-east", name: "Waterfront gate · east", east: 68, north: 2, angleDeg: 0 },
    { id: "technical-sw", name: "Technical gate · southwest", east: -22, north: -30, angleDeg: 180 },
    { id: "back-south", name: "Back exit · south", east: 38, north: -36, angleDeg: 90 }
  ],
  // Drawn for orientation only; neither is part of the site.
  context: {
    road: { name: "Road / Vei", points: [[-30, 41], [0, 43], [30, 42], [56, 43], [66, 42]] },
    water: { name: "Water / Sjø", points: [[73, 46], [75, 20], [74, -10], [76, -44]] }
  }
};

export const localAxes = (angleDeg) => {
  const radians = angleDeg * Math.PI / 180;
  return {
    width: [Math.cos(radians), -Math.sin(radians)],
    length: [Math.sin(radians), Math.cos(radians)]
  };
};

// Footprint corners. A structure is a rectangle unless it gives `outline` (its own
// convex corners as [across, along] metres from its centre) or `round: true` (a
// circle whose diameter is its width).
export const structureCorners = (structure) => {
  const axes = localAxes(structure.angleDeg);
  const local = structure.round
    ? Array.from({ length: 24 }, (_, index) => [Math.cos(index / 24 * 2 * Math.PI) * structure.width / 2, Math.sin(index / 24 * 2 * Math.PI) * structure.width / 2])
    : structure.outline ?? [
        [-structure.width / 2, -structure.length / 2],
        [structure.width / 2, -structure.length / 2],
        [structure.width / 2, structure.length / 2],
        [-structure.width / 2, structure.length / 2]
      ];
  return local.map(([across, along]) => ({
    east: structure.east + axes.width[0] * across + axes.length[0] * along,
    north: structure.north + axes.width[1] * across + axes.length[1] * along
  }));
};

export const pointInsidePerimeter = (point, perimeter = siteModel.perimeter) => {
  let inside = false;
  for (let index = 0; index < perimeter.length; index += 1) {
    const a = perimeter[index];
    const b = perimeter[(index + 1) % perimeter.length];
    const cross = (point.east - a.east) * (b.north - a.north) -
      (point.north - a.north) * (b.east - a.east);
    const onSegment = Math.abs(cross) < 0.03 &&
      point.east >= Math.min(a.east, b.east) - 0.03 &&
      point.east <= Math.max(a.east, b.east) + 0.03 &&
      point.north >= Math.min(a.north, b.north) - 0.03 &&
      point.north <= Math.max(a.north, b.north) + 0.03;
    if (onSegment) return true;
    if (
      (a.north > point.north) !== (b.north > point.north) &&
      point.east < (b.east - a.east) * (point.north - a.north) /
        (b.north - a.north) + a.east
    ) {
      inside = !inside;
    }
  }
  return inside;
};

export const siteMetrics = (model = siteModel) => {
  const east = model.perimeter.map((point) => point.east);
  const north = model.perimeter.map((point) => point.north);
  const borderLength = model.perimeter.reduce((sum, point, index) => {
    const next = model.perimeter[(index + 1) % model.perimeter.length];
    return sum + Math.hypot(next.east - point.east, next.north - point.north);
  }, 0);
  return {
    eastWestSpan: Math.max(...east) - Math.min(...east),
    northSouthSpan: Math.max(...north) - Math.min(...north),
    borderLength,
    structureCount: model.structures.length,
    enclosedStructureCount: model.structures.filter((structure) =>
      structureCorners(structure).every((corner) =>
        pointInsidePerimeter(corner, model.perimeter)
      )
    ).length
  };
};

export const validateSiteModel = (model = siteModel) => {
  const errors = [];
  const ids = new Set();
  if (model.coordinateSystem.unit !== "m") {
    errors.push("Site-coordinate unit must be metres.");
  }
  if (model.perimeter.length < 3) {
    errors.push("Perimeter must contain at least three points.");
  }
  for (const structure of model.structures) {
    if (ids.has(structure.id)) errors.push(`Duplicate structure id: ${structure.id}`);
    ids.add(structure.id);
    for (const key of ["east", "north", "width", "length", "height", "angleDeg"]) {
      if (!finite(structure[key])) errors.push(`${structure.id}.${key} must be finite.`);
    }
    for (const key of ["width", "length", "height"]) {
      if (structure[key] <= 0) errors.push(`${structure.id}.${key} must be positive.`);
    }
  }
  const reference = model.structures.find(
    (structure) => structure.id === model.coordinateSystem.originStructureId
  );
  if (!reference) errors.push("Reference structure is missing.");
  if (reference && (reference.east !== 0 || reference.north !== 0)) {
    errors.push("Reference structure must remain at E=0, N=0.");
  }
  for (const point of model.perimeter) {
    if (!finite(point.east) || !finite(point.north)) {
      errors.push("Every perimeter point must have finite east/north coordinates.");
    }
  }
  for (const zone of model.zones) {
    if (!Array.isArray(zone.points) || zone.points.length < 3) {
      errors.push(`${zone.id} needs at least three points.`);
    }
  }
  for (const exit of model.exits) {
    for (const key of ["east", "north", "angleDeg"]) {
      if (!finite(exit[key])) errors.push(`${exit.id}.${key} must be finite.`);
    }
  }
  if (model.perimeter.length >= 3) {
    for (const structure of model.structures) {
      for (const corner of structureCorners(structure)) {
        if (!pointInsidePerimeter(corner, model.perimeter)) {
          errors.push(`${structure.id} has a footprint corner outside the perimeter.`);
          break;
        }
      }
    }
  }
  return errors;
};

export const serializableSiteModel = (model = siteModel) => ({
  ...model,
  derived: {
    metrics: siteMetrics(model),
    structures: model.structures.map((structure) => ({
      id: structure.id,
      corners: structureCorners(structure)
    }))
  }
});
