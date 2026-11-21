// A gable-roof cabin: the plain "square building" example.
export const cabin = {
  id: "cabin",
  name: "CABIN",
  drawingTitle: "CABIN - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B2100-T",
  revision: "T1",
  form: { kind: "box", lengthMm: 9000, widthMm: 6000, wallHeightMm: 2400, frames: 4, roof: { kind: "gable", riseMm: 1500, overhangMm: 400 } },
  wallThicknessMm: 200,
  openings: [
    { id: "D1", kind: "door", wall: "near", center: 0.3, widthMm: 900, heightMm: 2100 },
    { id: "W1", kind: "window", wall: "near", center: 0.72, widthMm: 1500, heightMm: 1200, sillMm: 900 },
    { id: "W2", kind: "window", wall: "start", center: 0.5, widthMm: 1200, heightMm: 1200, sillMm: 900 },
    { id: "W3", kind: "window", wall: "far", center: 0.5, widthMm: 1800, heightMm: 1200, sillMm: 900 },
    { id: "D2", kind: "door", wall: "end", center: 0.5, widthMm: 900, heightMm: 2100 }
  ],
  braces: [
    { id: "K1", station: 1, from: [0, 1700], to: [0.14, 2820] },
    { id: "K2", station: 1, from: [1, 1700], to: [0.86, 2820] }
  ],
  foundation: { padMm: [600, 600] },
  notes: ["DIMENSIONS PROVISIONAL / MÅL FORELØPIGE", "VERIFY ON SITE / KONTROLLERES PÅ STEDET", "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"]
};
