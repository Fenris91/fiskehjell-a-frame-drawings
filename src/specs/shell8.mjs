import { shell6 } from "./shell6.mjs";

// The middle anchor pair stands at frame 4 of 8: three bays of seven along.
const middleAnchorRatio = 3 / 7;

export const shell8 = {
  ...shell6,
  id: "shell8",
  name: "SHELL 8",
  drawingTitle: "SHELL 8 — PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "A1400-T",
  revision: "T2",

  dimensions: {
    ...shell6.dimensions,
    closedLengthMm: 18900
  },

  structure: {
    ...shell6.structure,
    stations: 8,
    bays: 7,
    stationRatios: null
  },

  anchors: {
    ...shell6.anchors,
    closedStationRatios: [0, middleAnchorRatio, 1],
    closedLabelsLeft: ["B1", "B2", "B3"],
    closedLabelsRight: ["B4", "B5", "B6"]
  },

  doors: {
    ...shell6.doors,
    endGablePairs: 2,
    endGableCenters: [0.2, 0.8],
    sideDoor: {
      ...shell6.doors.sideDoor,
      enabled: false
    }
  },

  bracing: {
    ...shell6.bracing,
    zones: [[0, 1]],
    elements: [
      { id: "near-down", wall: "near", from: [0, 0], to: [1, 1] },
      { id: "near-up", wall: "near", from: [0, 1], to: [1, 0] },
      { id: "far-down", wall: "far", from: [0, 0], to: [1, 1], curveOffset: -12 },
      { id: "far-up", wall: "far", from: [0, 1], to: [1, 0], curveOffset: 12 }
    ]
  },


  notes: [
    "8 A-FRAMES · 6 ANCHORS · 4 END-GABLE DOOR SETS",
    "ONE FULL-HEIGHT WIRE CROSS ON EACH LONG WALL",
    "CLOSED-SHELL LENGTH 18 900 mm — PROVISIONAL"
  ]
};
