// Roofs as tilted planes over a footprint that is not a plain box.
const notes = ["DIMENSIONS PROVISIONAL / MÅL FORELØPIGE", "VERIFY ON SITE / KONTROLLERES PÅ STEDET", "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"];

// A hip roof: one plane rising inward from every wall, here with a cut corner.
export const lodge = {
  id: "lodge",
  name: "LODGE",
  drawingTitle: "LODGE - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B4200-T",
  revision: "T1",
  form: { kind: "footprint", wallHeightMm: 2600, corners: [[0, 0], [7000, 0], [10000, 2500], [10000, 7000], [0, 7000]], roof: { kind: "hip", pitchDeg: 28 } },
  wallThicknessMm: 200,
  openings: [
    { id: "D1", kind: "door", wall: 1, center: 0.3, widthMm: 1000, heightMm: 2100 },
    { id: "W1", kind: "window", wall: 2, center: 0.5, widthMm: 1800, heightMm: 1200, sillMm: 900 },
    { id: "W2", kind: "window", wall: 4, center: 0.5, widthMm: 2400, heightMm: 1200, sillMm: 900 },
    { id: "W3", kind: "window", wall: 5, center: 0.5, widthMm: 1500, heightMm: 1200, sillMm: 900 }
  ],
  foundation: { padMm: [600, 600] },
  notes
};

// A gable roof on a tapering plan: the ridge runs along the building and each
// long wall climbs with the roof as the plan widens.
export const taper = {
  id: "taper",
  name: "TAPER",
  drawingTitle: "TAPER - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B4300-T",
  revision: "T1",
  form: { kind: "footprint", wallHeightMm: 2600, corners: [[0, 1000], [12000, 0], [12000, 7000], [0, 6000]], roof: { kind: "gable", pitchDeg: 30, ridge: [1, 0] } },
  wallThicknessMm: 200,
  openings: [
    { id: "D1", kind: "door", wall: 4, center: 0.5, widthMm: 1200, heightMm: 2200 },
    { id: "W1", kind: "window", wall: 2, center: 0.5, widthMm: 2400, heightMm: 2600, sillMm: 600 },
    { id: "W2", kind: "window", wall: 1, center: 0.35, widthMm: 1800, heightMm: 1100, sillMm: 1000 }
  ],
  foundation: { padMm: [600, 600] },
  notes
};
