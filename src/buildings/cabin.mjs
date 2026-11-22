// A gable-roof cabin: the plain "square building" example.
export const cabin = {
  id: "cabin",
  name: "CABIN",
  drawingTitle: "CABIN - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B2100-T",
  revision: "T2",
  form: { kind: "box", lengthMm: 9000, widthMm: 6000, wallHeightMm: 2400, frames: 4, roof: { kind: "gable", riseMm: 1500, overhangMm: 400 } },
  wallThicknessMm: 200,
  openings: [
    // Near side: window, door, window, each centred in its bay so no frame runs
    // through an opening. Window heads line up with the door head at 2 100.
    // Doors use Norwegian modules: 10M × 21M (1 000 × 2 100) for the entrance,
    // 9M × 21M (900 × 2 100) for the back door.
    { id: "W1", kind: "window", wall: "near", center: 1 / 6, widthMm: 1200, heightMm: 1200, sillMm: 900 },
    { id: "D1", kind: "door", wall: "near", center: 0.5, widthMm: 1000, heightMm: 2100 },
    { id: "W4", kind: "window", wall: "near", center: 5 / 6, widthMm: 1200, heightMm: 1200, sillMm: 900 },
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
