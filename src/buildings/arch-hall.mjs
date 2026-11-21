// An arch hall: a semicircular rib extruded along the building.
export const archHall = {
  id: "arch-hall",
  name: "ARCH HALL",
  drawingTitle: "ARCH HALL - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B3100-T",
  revision: "T1",
  form: { kind: "arch", arch: "semicircle", lengthMm: 18000, widthMm: 10000, frames: 7, segments: 12 },
  wallThicknessMm: 150,
  openings: [
    { id: "D1", kind: "door", wall: "start", center: 0.5, widthMm: 3000, heightMm: 3200 },
    { id: "D2", kind: "door", wall: "end", center: 0.5, widthMm: 1000, heightMm: 2100 },
    { id: "W1", kind: "window", wall: "start", center: 0.5, widthMm: 1800, heightMm: 800, sillMm: 3600 }
  ],
  foundation: { padMm: [700, 700] },
  notes: ["DIMENSIONS PROVISIONAL / MÅL FORELØPIGE", "VERIFY ON SITE / KONTROLLERES PÅ STEDET", "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"]
};

// The same hall with a pointed rib, to show the other arch kinds share the form.
export const pointedHall = {
  ...archHall,
  id: "pointed-hall",
  name: "POINTED HALL",
  drawingTitle: "POINTED HALL - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B3200-T",
  form: { kind: "arch", arch: "pointed", lengthMm: 12000, widthMm: 8000, riseMm: 7000, frames: 5, segments: 12 },
  openings: [
    { id: "D1", kind: "door", wall: "start", center: 0.5, widthMm: 2000, heightMm: 2600 },
    { id: "W1", kind: "window", wall: "end", center: 0.5, widthMm: 1200, heightMm: 2400, sillMm: 900 }
  ]
};
