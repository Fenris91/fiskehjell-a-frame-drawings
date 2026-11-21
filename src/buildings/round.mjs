// Round footprints: a cone with an open top (a lavvo) and a dome.
export const lavvo = {
  id: "lavvo",
  name: "LAVVO",
  drawingTitle: "LAVVO - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B5100-T",
  revision: "T1",
  form: { kind: "round", shape: "cone", radiusMm: 4000, heightMm: 6000, topRadiusMm: 400, meridians: 12 },
  wallThicknessMm: 100,
  openings: [{ id: "D1", kind: "door", bearingDeg: 270, widthMm: 1200, heightMm: 2000 }],
  foundation: { padMm: [400, 400] },
  notes: ["DIMENSIONS PROVISIONAL / MÅL FORELØPIGE", "VERIFY ON SITE / KONTROLLERES PÅ STEDET", "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"]
};

export const dome = {
  id: "dome",
  name: "DOME",
  drawingTitle: "DOME - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "B5200-T",
  revision: "T1",
  form: { kind: "round", shape: "dome", radiusMm: 5000, heightMm: 4000, meridians: 12 },
  wallThicknessMm: 150,
  openings: [
    { id: "D1", kind: "door", bearingDeg: 270, widthMm: 1400, heightMm: 2000 },
    { id: "W1", kind: "window", bearingDeg: 180, widthMm: 1200, heightMm: 800, sillMm: 1000 }
  ],
  foundation: { padMm: [500, 500] },
  notes: ["DIMENSIONS PROVISIONAL / MÅL FORELØPIGE", "VERIFY ON SITE / KONTROLLERES PÅ STEDET", "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"]
};
