// The Hall: thirteen frames over the closed length, then an open passage and
// four extension frames over the outer anchor span, past the end gable.
const HALL = { widthMm: 12000, heightMm: 10500, closedMm: 27000, passageMm: 4000, extensionSpanMm: 6000 };

export const hall = {
  id: "hall",
  name: "HALL",
  drawingTitle: "HALL - PLAN OG FASADER",
  drawingNumber: "A1100-T",
  revision: "T2",
  status: "DRAFT / UTKAST",
  language: "en-nb",

  presentation: {
    showEmergencyDoors: false
  },

  dimensions: {
    closedLengthMm: HALL.closedMm,
    widthMm: HALL.widthMm,
    heightMm: HALL.heightMm,
    extensionLengthMm: 11000
  },

  foundation: {
    concreteAnchor: {
      widthMm: 1450,
      lengthMm: 1450,
      depthMm: 1000
    },
    extension: {
      passageLengthMm: HALL.passageMm,
      anchorSpanMm: HALL.extensionSpanMm,
      overallLengthMm: 11000
    }
  },

  structure: {
    stations: 13,
    bays: 12,
    stationRatios: null,
    ridgeBeam: true,
    lowerCrossBeamRatio: 0.68,
    extension: {
      enabled: true,
      frames: 4,
      open: true,
      enlargedFirstBay: true,
      clearInterfacePassage: true,
      passageHeadRatio: 0.69
    }
  },

  anchors: {
    closedStationIndices: [0, 4, 8, 12],
    closedLabelsLeft: ["B1", "B2", "B3", "B4"],
    closedLabelsRight: ["B5", "B6", "B7", "B8"],
    extensionLeftLabel: "L1",
    extensionRightLabel: "L2",
    showApexJoint: true
  },

  doors: {
    emergencyColor: "#00a84f",
    endGablePairs: 2,
    endGableCenters: [0.28, 0.72],
    endDoorWidthRatio: 0.19,
    sideDoor: {
      enabled: true,
      setCount: 2,
      stationRatio: 0.54,
      widthMm: 1600,
      heightMm: 2450,
      leafSplit: [1, 2],
      canopyProjectionMm: 500,
      opensOutward: true,
      oppositeSideDashed: true
    }
  },

  bracing: {
    steelWire: true,
    nearWallSolid: true,
    farWallDashed: true,
    zones: [
      [0.0, 0.36],
      [0.62, 1.0]
    ]
  },

  checkpoint: {
    topDownLayers: [
      {
        id: "structure-mesh",
        number: 1,
        kind: "mesh",
        showAnchors: true,
        title: "BJELKELAG + HØNSENETTING",
        subtitle: "JOISTS + CHICKEN WIRE"
      },
      {
        id: "blocking-insulation",
        number: 2,
        kind: "insulation",
        showAnchors: true,
        title: "KUBBING + ISOLASJON",
        subtitle: "BLOCKING + INSULATION"
      },
      {
        id: "floor-layer",
        number: 3,
        kind: "deck",
        showDoors: true,
        title: "TOPPDEKKE / FLOOR LAYER",
        subtitle: "FERDIG GULVLAG / FINISHED DECK"
      }
    ]
  },


  notes: [
    "DIMENSIONS PROVISIONAL / MÅL FORELØPIGE",
    "VERIFY ON SITE / KONTROLLERES PÅ STEDET",
    "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"
  ]
};
