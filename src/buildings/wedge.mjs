// A building on a diagonal footprint: one wall runs at an angle to the others,
// under a mono-pitch roof that rises toward the far side.
// Corners are listed anticlockwise seen from above.
export const wedge = {
  id: "wedge",
  name: "WEDGE",
  drawingTitle: "WEDGE - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B4100-T",
  revision: "T1",
  form: { kind: "footprint", wallHeightMm: 3000, corners: [[0, 0], [8000, 0], [11000, 3000], [11000, 6000], [0, 6000]], roof: { kind: "monopitch", pitchDeg: 8, rise: [0, 1] } },
  wallThicknessMm: 200,
  openings: [
    { id: "D1", kind: "door", wall: 2, center: 0.5, widthMm: 1200, heightMm: 2100 },
    { id: "W1", kind: "window", wall: 1, center: 0.35, widthMm: 2400, heightMm: 1500, sillMm: 800 },
    { id: "W2", kind: "window", wall: 4, center: 0.5, widthMm: 3000, heightMm: 1200, sillMm: 1000 },
    { id: "D2", kind: "door", wall: 5, center: 0.5, widthMm: 900, heightMm: 2100 }
  ],
  braces: [{ id: "S1", wall: 1, from: [0.72, 0], to: [0.98, 3000] }],
  foundation: { padMm: [600, 600] },
  notes: ["DIMENSIONS PROVISIONAL / MÅL FORELØPIGE", "VERIFY ON SITE / KONTROLLERES PÅ STEDET", "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"]
};
