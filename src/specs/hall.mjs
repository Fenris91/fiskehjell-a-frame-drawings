const hallFrontFrame = {
  A: [560, 690],
  B: [605, 725],
  C: [590, 595]
};
const hallLongitudinalOffset = [280, -125];
const hallFrames = [
  ["E4", 0],
  ["E3", 0.055],
  ["E2", 0.11],
  ["E1", 0.165],
  ...Array.from({ length: 13 }, (_, index) => [
    `F${index + 1}`,
    0.27 + (index / 12) * 0.73
  ])
];
const hallNodes = {};
const hallEdges = [];

function hallPoint(point, ratio) {
  return [
    hallFrontFrame[point][0] + hallLongitudinalOffset[0] * ratio,
    hallFrontFrame[point][1] + hallLongitudinalOffset[1] * ratio
  ];
}

for (const [frame, ratio] of hallFrames) {
  for (const point of ["A", "B", "C"]) hallNodes[`${frame}${point}`] = hallPoint(point, ratio);
  hallEdges.push(
    [`${frame}A`, `${frame}B`, "frame"],
    [`${frame}B`, `${frame}C`, "frame"],
    [`${frame}C`, `${frame}A`, "frame"]
  );
}

for (const group of [
  ["E4", "E3", "E2", "E1"],
  Array.from({ length: 13 }, (_, index) => `F${index + 1}`)
]) {
  for (let index = 1; index < group.length; index += 1) {
    for (const point of ["A", "B", "C"]) {
      hallEdges.push([`${group[index - 1]}${point}`, `${group[index]}${point}`, "rail"]);
    }
  }
}

// The ridge and far base rail bridge the interface; the near base rail stays open for passage.
hallEdges.push(["E1A", "F1A", "rail"], ["E1C", "F1C", "rail"]);

const shiftPoints = (points, ratio) => points.map(([x, y]) => [
  x + hallLongitudinalOffset[0] * ratio,
  y + hallLongitudinalOffset[1] * ratio
]);
const dividerFor = (points) => [
  [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2],
  [(points[3][0] + points[2][0]) / 2, (points[3][1] + points[2][1]) / 2]
];
const endDoorLeft = [[571.5, 663.5], [563.6, 692.8], [575.8, 702.3], [580, 670.1]];
const endDoorRight = [[589.5, 677.4], [589.3, 712.8], [601.4, 722.2], [598, 684]];
const farDoorLeft = shiftPoints(endDoorLeft, 1);
const farDoorRight = shiftPoints(endDoorRight, 1);

function wallDoor(basePoint, ratio, far = false) {
  const half = 0.035;
  const heightRatio = 0.36;
  const lowerStart = hallPoint(basePoint, ratio - half);
  const lowerEnd = hallPoint(basePoint, ratio + half);
  const apexStart = hallPoint("C", ratio - half);
  const apexEnd = hallPoint("C", ratio + half);
  const upperStart = [
    lowerStart[0] + (apexStart[0] - lowerStart[0]) * heightRatio,
    lowerStart[1] + (apexStart[1] - lowerStart[1]) * heightRatio
  ];
  const upperEnd = [
    lowerEnd[0] + (apexEnd[0] - lowerEnd[0]) * heightRatio,
    lowerEnd[1] + (apexEnd[1] - lowerEnd[1]) * heightRatio
  ];
  const lowerMiddle = hallPoint(basePoint, ratio);
  const apexMiddle = hallPoint("C", ratio);
  const upperMiddle = [
    lowerMiddle[0] + (apexMiddle[0] - lowerMiddle[0]) * heightRatio,
    lowerMiddle[1] + (apexMiddle[1] - lowerMiddle[1]) * heightRatio
  ];
  return {
    points: [lowerStart, lowerEnd, upperEnd, upperStart],
    divider: [lowerMiddle, upperMiddle],
    far
  };
}

const hallMiddleRatio = 0.27 + 0.54 * 0.73;
const hallEndDoors = [
  { points: endDoorLeft, divider: dividerFor(endDoorLeft) },
  { points: endDoorRight, divider: dividerFor(endDoorRight) },
  { points: farDoorLeft, divider: dividerFor(farDoorLeft), far: true },
  { points: farDoorRight, divider: dividerFor(farDoorRight), far: true }
];
const hallSideDoors = [
  wallDoor("B", hallMiddleRatio, false),
  wallDoor("A", hallMiddleRatio, true)
];
const doorCenter = (door) => [
  door.points.reduce((sum, point) => sum + point[0], 0) / door.points.length,
  door.points.reduce((sum, point) => sum + point[1], 0) / door.points.length
];
const hallDoorArrows = [
  ...hallEndDoors.slice(0, 2).map((door, index) => {
    const [x, y] = doorCenter(door);
    return { id: `end-start-${index + 1}`, from: [x, y], to: [x - 13, y + 7] };
  }),
  ...hallEndDoors.slice(2).map((door, index) => {
    const [x, y] = doorCenter(door);
    return { id: `end-far-${index + 1}`, from: [x, y], to: [x + 13, y - 7], far: true };
  }),
  ...hallSideDoors.map((door, index) => {
    const [x, y] = doorCenter(door);
    return index === 0
      ? { id: "middle-near", from: [x, y], to: [x + 12, y + 10] }
      : { id: "middle-far", from: [x, y], to: [x - 12, y - 10], far: true };
  })
];

const hallGraph = {
  viewTransform: "translate(0 0)",
  nodes: hallNodes,
  edges: hallEdges,
  nodeLabels: { E4A: "A", E4B: "B", E4C: "C" },
  nodeLabelOffsets: { E4A: [-12, -9], E4B: [12, 14], E4C: [-12, -8] },
  anchorNodes: [
    "E4A", "E4B", "E1A", "E1B",
    "F1A", "F1B", "F5A", "F5B", "F9A", "F9B", "F13A", "F13B"
  ],
  anchorLabels: {
    E4A: "L1-OUTER", E4B: "L2-OUTER", E1A: "L1-INNER", E1B: "L2-INNER",
    F1A: "B1", F5A: "B2", F9A: "B3", F13A: "B4",
    F1B: "B5", F5B: "B6", F9B: "B7", F13B: "B8"
  },
  endDoorPolygons: hallEndDoors,
  sideDoorPolygons: hallSideDoors,
  doorArrows: hallDoorArrows,
  clearPassage: { between: ["E1B", "F1B"], openAtBase: true },
  axisExtents: {
    origin: [458, 735],
    x: hallNodes.E4A,
    y: [915, 735],
    z: [458, hallNodes.F13C[1]]
  },
  axisLabelPositions: { x: [520, 708], y: [925, 739], z: [448, hallNodes.F13C[1] - 8] },
  axisGuides: [
    [[458, hallNodes.F13C[1]], hallNodes.F13C],
    [hallNodes.F13B, [hallNodes.F13B[0], 735]]
  ]
};

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
    closedLengthMm: 27000,
    widthMm: 12000,
    heightMm: 10500,
    extensionLengthMm: 11000
  },

  foundation: {
    concreteAnchor: {
      widthMm: 1450,
      lengthMm: 1450,
      depthMm: 1000
    },
    extension: {
      passageLengthMm: 4000,
      anchorSpanMm: 6000,
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
    endGableCenters: [0.2, 0.8],
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

  shellGraph: hallGraph,

  notes: [
    "DIMENSIONS PROVISIONAL / MÅL FORELØPIGE",
    "VERIFY ON SITE / KONTROLLERES PÅ STEDET",
    "EXAMPLE BUILDING — DRAFT, NOT FOR CONSTRUCTION"
  ]
};
