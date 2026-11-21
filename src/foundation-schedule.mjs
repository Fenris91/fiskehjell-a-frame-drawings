import { normalizeSpec } from "./render-sheet.mjs";

function closedAnchorRatios(spec) {
  if (Array.isArray(spec.anchors.closedStationRatios)) return spec.anchors.closedStationRatios;
  return (spec.anchors.closedStationIndices ?? []).map((index) => spec.stationRatios[index]);
}

export function foundationSchedule(input) {
  const spec = normalizeSpec(input);
  const block = spec.foundation.concreteAnchor;
  const anchors = [];
  const ratios = closedAnchorRatios(spec);

  for (const [index, ratio] of ratios.entries()) {
    const x = Math.round(ratio * spec.dimensions.closedLengthMm);
    anchors.push(
      {
        id: spec.anchors.closedLabelsLeft[index],
        centerMm: { x, y: 0, z: 0 },
        sizeMm: { x: block.lengthMm, y: block.widthMm, z: block.depthMm }
      },
      {
        id: spec.anchors.closedLabelsRight[index],
        centerMm: { x, y: spec.dimensions.widthMm, z: 0 },
        sizeMm: { x: block.lengthMm, y: block.widthMm, z: block.depthMm }
      }
    );
  }

  if (spec.structure.extension.enabled) {
    const extension = spec.foundation.extension;
    const innerX = spec.dimensions.closedLengthMm + extension.passageLengthMm;
    const outerX = innerX + extension.anchorSpanMm;
    anchors.push(
      { id: `${spec.anchors.extensionLeftLabel}-INNER`, centerMm: { x: innerX, y: 0, z: 0 }, sizeMm: { x: block.lengthMm, y: block.widthMm, z: block.depthMm } },
      { id: `${spec.anchors.extensionRightLabel}-INNER`, centerMm: { x: innerX, y: spec.dimensions.widthMm, z: 0 }, sizeMm: { x: block.lengthMm, y: block.widthMm, z: block.depthMm } },
      { id: `${spec.anchors.extensionLeftLabel}-OUTER`, centerMm: { x: outerX, y: 0, z: 0 }, sizeMm: { x: block.lengthMm, y: block.widthMm, z: block.depthMm } },
      { id: `${spec.anchors.extensionRightLabel}-OUTER`, centerMm: { x: outerX, y: spec.dimensions.widthMm, z: 0 }, sizeMm: { x: block.lengthMm, y: block.widthMm, z: block.depthMm } }
    );
  }

  return {
    building: spec.name,
    coordinateSystem: {
      origin: "closed-shell start gable, left structural rail, foundation level",
      x: "length toward closed-shell end and extension",
      y: "width from left rail to right rail",
      z: "height; anchor depth extends below z=0"
    },
    units: "mm",
    anchors
  };
}
