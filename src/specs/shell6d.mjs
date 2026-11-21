import { shell6 } from "./shell6.mjs";

export const shell6d = {
  ...shell6,
  id: "shell6d",
  name: "SHELL 6D",
  drawingTitle: "SHELL 6D — PLAN AND ELEVATIONS / PLAN OG FASADER",
  drawingNumber: "A1300-T",
  revision: "T2",

  dimensions: {
    ...shell6.dimensions,
    closedLengthMm: 13500
  },

  doors: {
    ...shell6.doors,
    endGablePairs: 1,
    endGableCenters: [0.5],
    endGableStartCenters: [],
    endGableEndCenters: [0.5],
    gableViewEnd: "end",
    sideDoor: {
      ...shell6.doors.sideDoor,
      enabled: false,
      stationRatio: 0.6,
      widthMm: 900,
      leafCount: 2,
      oppositeSideDashed: true
    },
    internalDoorPair: {
      enabled: true,
      stationRatio: 0.6,
      leafCount: 2,
      centerRatios: [0.2, 0.8],
      opensToward: "end"
    }
  },

  shellGraph: {
    ...shell6.shellGraph,
    endDoorPolygons: [
      [[818, 586], [830, 595], [830, 555], [818, 546]],
      [[835, 600], [847, 609], [847, 569], [835, 560]]
    ],
    internalDoorPolygons: [
      [[723.3, 596.5], [715.4, 628.2], [728, 638], [731.8, 603.1]],
      [[738, 607.9], [737, 645], [749.6, 654.8], [746.5, 614.6]]
    ],
    doorArrows: [
      { id: "end-far", from: [833, 579], to: [851, 566], far: true },
      { id: "internal-left", from: [724, 614], to: [724, 633] },
      { id: "internal-right", from: [743, 626], to: [743, 646] }
    ]
  },

  notes: [
    "SHELL 6D DOORS: OPPOSING INTERNAL PAIR AT STATION 4 + ONE END-GABLE EXIT",
    "DIMENSIONS AND DOOR SIZES PROVISIONAL / MÅL OG DØRSTØRRELSER FORELØPIGE",
    "VERIFY ON SITE / KONTROLLERES PÅ STEDET"
  ]
};
