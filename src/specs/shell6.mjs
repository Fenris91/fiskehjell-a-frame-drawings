import { hall } from "./hall.mjs";

const frameCount = 6;
const frontFrame = {
  A: [560, 690],
  B: [605, 725],
  C: [590, 595]
};
const longitudinalOffset = [250, -110];
const shellNodes = {};
const shellEdges = [];

for (let index = 0; index < frameCount; index += 1) {
  const ratio = index / (frameCount - 1);
  for (const point of ["A", "B", "C"]) {
    shellNodes[`F${index + 1}${point}`] = [
      frontFrame[point][0] + longitudinalOffset[0] * ratio,
      frontFrame[point][1] + longitudinalOffset[1] * ratio
    ];
  }
  shellEdges.push(
    [`F${index + 1}A`, `F${index + 1}B`, "frame"],
    [`F${index + 1}B`, `F${index + 1}C`, "frame"],
    [`F${index + 1}C`, `F${index + 1}A`, "frame"]
  );
  if (index > 0) {
    shellEdges.push(
      [`F${index}A`, `F${index + 1}A`, "rail"],
      [`F${index}B`, `F${index + 1}B`, "rail"],
      [`F${index}C`, `F${index + 1}C`, "rail"]
    );
  }
}

const shell6Graph = {
  viewTransform: "translate(0 0)",
  nodes: shellNodes,
  edges: shellEdges,
  nodeLabels: {
    F1A: "A",
    F1B: "B",
    F1C: "C"
  },
  nodeLabelOffsets: {
    F1A: [-12, -10],
    F1B: [14, 14],
    F1C: [-11, -10]
  },
  anchorNodes: ["F1A", "F1B", "F6A", "F6B"],
  anchorLabels: {
    F1A: "B1",
    F6A: "B2",
    F1B: "B3",
    F6B: "B4"
  },
  axisExtents: {
    origin: [458, 735],
    x: [560, 690],
    y: [855, 735],
    z: [458, 485]
  },
  axisLabelPositions: {
    x: [520, 708],
    y: [868, 739],
    z: [448, 477]
  },
  axisGuides: [
    [[458, 485], [840, 485]],
    [[855, 615], [855, 735]]
  ],
  endDoorPolygons: [
    [[568, 696], [580, 705], [580, 665], [568, 656]],
    [[585, 710], [597, 719], [597, 679], [585, 670]],
    [[818, 586], [830, 595], [830, 555], [818, 546]],
    [[835, 600], [847, 609], [847, 569], [835, 560]]
  ],
  doorArrows: [
    { id: "end-start", from: [583, 687], to: [565, 700] },
    { id: "end-far", from: [833, 579], to: [851, 566], far: true }
  ]
};

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

  shellGraph: shell6Graph,

  notes: [
    "CLOSED-SHELL LENGTH 13 500 mm — PROVISIONAL",
    "VERIFY DIMENSIONS AND ANCHORS ON SITE / KONTROLLER MÅL OG FORANKRINGER",
    "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"
  ]
};
