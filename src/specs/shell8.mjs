import { shell6 } from "./shell6.mjs";

const frameCount = 8;
const middleAnchorRatio = 3 / 7;
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

const shell8Graph = {
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
  anchorNodes: ["F1A", "F1B", "F4A", "F4B", "F8A", "F8B"],
  anchorLabels: {
    F1A: "B1",
    F4A: "B2",
    F8A: "B3",
    F1B: "B4",
    F4B: "B5",
    F8B: "B6"
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
    [[571.5, 663.5], [563.6, 692.8], [575.8, 702.3], [580, 670.1]],
    [[589.5, 677.4], [589.3, 712.8], [601.4, 722.2], [598, 684]],
    [[821.5, 553.5], [813.6, 582.8], [825.8, 592.3], [830, 560.1]],
    [[839.5, 567.4], [839.3, 602.8], [851.4, 612.2], [848, 574]]
  ],
  doorArrows: [
    { id: "end-start", from: [583, 692], to: [565, 705] },
    { id: "end-far", from: [833, 582], to: [851, 569], far: true }
  ]
};

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

  shellGraph: shell8Graph,

  notes: [
    "8 A-FRAMES · 6 ANCHORS · 4 END-GABLE DOOR SETS",
    "ONE FULL-HEIGHT WIRE CROSS ON EACH LONG WALL",
    "CLOSED-SHELL LENGTH 18 900 mm — PROVISIONAL"
  ]
};
