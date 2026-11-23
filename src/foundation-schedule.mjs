import { aframeShape, normalizeSpec } from "./render-sheet.mjs";

// The anchors are the drawings' own: the same shape the plan, side view and 3D
// sketch are drawn from, so the schedule cannot disagree with them.
export function foundationSchedule(input) {
  const spec = normalizeSpec(input);
  const block = spec.foundation.concreteAnchor;
  const anchors = aframeShape(spec).anchors.map(({ id, x, y }) => ({
    id,
    centerMm: { x: Math.round(x), y, z: 0 },
    sizeMm: { x: block.lengthMm, y: block.widthMm, z: block.depthMm }
  }));

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
