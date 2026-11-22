import { hall } from "./hall.mjs";

export const shell6 = {
  ...hall,
  id: "shell6",
  name: "SHELL 6",
  drawingTitle: "SHELL 6 - PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "A1200-T",
  revision: "T2",

  dimensions: {
    closedLengthMm: 13500,
    widthMm: hall.dimensions.widthMm,
    heightMm: hall.dimensions.heightMm,
    extensionLengthMm: 0
  },

  foundation: {
    concreteAnchor: {
      widthMm: 1250,
      lengthMm: 1250,
      depthMm: 1000
    }
  },

  structure: {
    ...hall.structure,
    stations: 6,
    bays: 5,
    stationRatios: null,
    extension: {
      ...hall.structure.extension,
      enabled: false,
      frames: 0,
      open: false,
      enlargedFirstBay: false,
      clearInterfacePassage: false
    }
  },

  anchors: {
    ...hall.anchors,
    closedStationIndices: null,
    closedStationRatios: [0, 1],
    closedLabelsLeft: ["B1", "B2"],
    closedLabelsRight: ["B3", "B4"],
    extensionLeftLabel: "",
    extensionRightLabel: ""
  },

  doors: {
    ...hall.doors,
    sideDoor: {
      ...hall.doors.sideDoor,
      enabled: false,
      stationRatio: 0.5
    }
  },

  bracing: {
    ...hall.bracing,
    zones: [[0.0, 1.0]],
    elements: [
      { id: "near-down", wall: "near", from: [0, 0], to: [1, 1] },
      { id: "near-up", wall: "near", from: [0, 1], to: [1, 0] },
      { id: "far-down", wall: "far", from: [0, 0], to: [1, 1], curveOffset: -18 },
      { id: "far-up", wall: "far", from: [0, 1], to: [1, 0], curveOffset: 18 }
    ]
  },


  notes: [
    "CLOSED-SHELL LENGTH 13 500 mm — PROVISIONAL",
    "VERIFY DIMENSIONS AND ANCHORS ON SITE / KONTROLLER MÅL OG FORANKRINGER",
    "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"
  ]
};
