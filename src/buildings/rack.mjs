// A small fiskehjell-style rack: the A-frame section drawn by the same sheet as
// every other form, straight from the geometry core.
export const rack = {
  id: "rack",
  name: "RACK",
  drawingTitle: "RACK - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B1100-T",
  revision: "T1",
  form: { kind: "aframe", lengthMm: 12000, widthMm: 8000, heightMm: 7000, frames: 6 },
  wallThicknessMm: 150,
  openings: [
    { id: "D1", kind: "door", wall: "start", center: 0.5, widthMm: 1800, heightMm: 2200 },
    { id: "D2", kind: "door", wall: "end", center: 0.5, widthMm: 900, heightMm: 2100 }
  ],
  foundation: { padMm: [800, 800] },
  notes: ["DIMENSIONS PROVISIONAL / MÅL FORELØPIGE", "VERIFY ON SITE / KONTROLLERES PÅ STEDET", "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"]
};
