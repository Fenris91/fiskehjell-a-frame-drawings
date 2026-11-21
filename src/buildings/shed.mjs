// A mono-pitch shed: sloped members, a lean-to roof and diagonal bracing.
export const shed = {
  id: "shed",
  name: "SHED",
  drawingTitle: "SHED - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B2200-T",
  revision: "T1",
  form: { kind: "box", lengthMm: 6000, widthMm: 3600, wallHeightMm: 2200, frames: 4, roof: { kind: "monopitch", riseMm: 900, overhangMm: 300 } },
  wallThicknessMm: 150,
  openings: [
    { id: "D1", kind: "door", wall: "near", center: 0.5, widthMm: 1600, heightMm: 2000 },
    { id: "W1", kind: "window", wall: "end", center: 0.5, widthMm: 900, heightMm: 900, sillMm: 1100 }
  ],
  braces: [
    // A wire cross in the last bay of the near wall, and one strut on the far wall.
    { id: "X1", wall: "near", from: [2 / 3, 0], to: [1, 2200] },
    { id: "X2", wall: "near", from: [1, 0], to: [2 / 3, 2200] },
    { id: "S1", wall: "far", from: [0, 0], to: [1 / 3, 3100] },
    // Knee braces under the high side of the first frame.
    { id: "K1", station: 1, from: [1, 2300], to: [0.8, 2900] }
  ],
  foundation: { padMm: [500, 500] },
  notes: ["DIMENSIONS PROVISIONAL / MÅL FORELØPIGE", "VERIFY ON SITE / KONTROLLERES PÅ STEDET", "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"]
};
