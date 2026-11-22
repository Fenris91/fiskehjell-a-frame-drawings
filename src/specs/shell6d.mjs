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

  notes: [
    "SHELL 6D DOORS: OPPOSING INTERNAL PAIR AT STATION 4 + ONE END-GABLE EXIT",
    "DIMENSIONS AND DOOR SIZES PROVISIONAL / MÅL OG DØRSTØRRELSER FORELØPIGE",
    "VERIFY ON SITE / KONTROLLERES PÅ STEDET"
  ]
};
