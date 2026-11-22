import { elevation, extrusionSolid, profiles, solidFaces } from "./geometry.mjs";
import { facing, fit, hiddenBehind, visibleParts } from "./sketch3d.mjs";

const DEFAULT_STROKE = "#111111";
const CONCRETE = "#e5e7e9";
const WALL = "#eef1f3";
const WIRE_NEAR = "#8f979d";
const WIRE_FAR = "#b2b8bc";

// The cross-section a specification asks for. A-frame is the only one so far.
function sectionProfile(spec) {
  const kind = spec.structure?.profile ?? "aframe";
  if (!profiles[kind]) throw new Error(`Unknown section profile: ${kind}`);
  return profiles[kind]({ widthMm: spec.dimensions.widthMm, heightMm: spec.dimensions.heightMm });
}

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const mm = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const n = (value) => Number(value.toFixed(2));

function assertPositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

function closedAnchorRatios(spec) {
  if (Array.isArray(spec.anchors?.closedStationRatios)) {
    return spec.anchors.closedStationRatios;
  }
  return (spec.anchors?.closedStationIndices ?? []).map((index) => spec.stationRatios[index]);
}

export function normalizeSpec(input) {
  const spec = JSON.parse(JSON.stringify(input));
  if (!spec.id || !spec.name) throw new Error("id and name are required");

  for (const key of ["closedLengthMm", "widthMm", "heightMm"]) {
    assertPositive(spec.dimensions?.[key], `dimensions.${key}`);
  }
  for (const key of ["widthMm", "lengthMm", "depthMm"]) {
    assertPositive(spec.foundation?.concreteAnchor?.[key], `foundation.concreteAnchor.${key}`);
  }
  if (spec.structure?.extension?.enabled) {
    for (const key of ["passageLengthMm", "anchorSpanMm", "overallLengthMm"]) {
      assertPositive(spec.foundation?.extension?.[key], `foundation.extension.${key}`);
    }
  }

  const { stations, bays } = spec.structure ?? {};
  if (!Number.isInteger(stations) || !Number.isInteger(bays)) {
    throw new Error("structure.stations and structure.bays must be integers");
  }
  if (stations !== bays + 1) throw new Error("stations must equal bays + 1");

  if (spec.structure.stationRatios == null) {
    spec.stationRatios = Array.from({ length: stations }, (_, index) => index / bays);
  } else {
    if (spec.structure.stationRatios.length !== stations) {
      throw new Error("stationRatios length must equal stations");
    }
    spec.stationRatios = spec.structure.stationRatios.map(Number);
    if (spec.stationRatios[0] !== 0 || spec.stationRatios.at(-1) !== 1) {
      throw new Error("stationRatios must start at 0 and end at 1");
    }
    if (spec.stationRatios.some((ratio, index, all) => ratio < 0 || ratio > 1 || (index && ratio <= all[index - 1]))) {
      throw new Error("stationRatios must be strictly increasing between 0 and 1");
    }
  }

  for (const index of spec.anchors?.closedStationIndices ?? []) {
    if (!Number.isInteger(index) || index < 0 || index >= stations) {
      throw new Error(`anchor station index ${index} is outside the station system`);
    }
  }

  for (const ratio of spec.anchors?.closedStationRatios ?? []) {
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      throw new Error(`anchor station ratio ${ratio} is outside 0..1`);
    }
  }

  const split = spec.doors?.sideDoor?.leafSplit ?? [1, 1];
  if (split.length !== 2 || split.some((value) => value <= 0)) {
    throw new Error("doors.sideDoor.leafSplit must contain two positive values");
  }

  return spec;
}

function svgText(x, y, value, className = "", extra = "") {
  return `<text x="${n(x)}" y="${n(y)}" class="${className}" ${extra}>${esc(value)}</text>`;
}

function dimensionHorizontal(x1, x2, y, label) {
  return `
    <g class="dimension">
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" />
      <line x1="${x1}" y1="${y - 8}" x2="${x1}" y2="${y + 8}" />
      <line x1="${x2}" y1="${y - 8}" x2="${x2}" y2="${y + 8}" />
      ${svgText((x1 + x2) / 2, y - 6, label, "dimension-text", 'text-anchor="middle"')}
    </g>`;
}

function dimensionVertical(x, y1, y2, label, labelSide = 1) {
  const labelX = x + 15 * labelSide;
  return `
    <g class="dimension">
      <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" />
      <line x1="${x - 8}" y1="${y1}" x2="${x + 8}" y2="${y1}" />
      <line x1="${x - 8}" y1="${y2}" x2="${x + 8}" y2="${y2}" />
      ${svgText(labelX, (y1 + y2) / 2, label, "dimension-text", `transform="rotate(90 ${labelX} ${(y1 + y2) / 2})" text-anchor="middle"`)}
    </g>`;
}

function outwardEndDoors(x, y, width, direction, color, centerRatios = [0.2, 0.8], leafShare = 0.105) {
  const ratios = Array.isArray(centerRatios) ? centerRatios : [0.5];
  return ratios.map((ratio) => {
    const center = x + width * ratio;
    const leaf = width * leafShare;
    const dy = direction * 32;
    return `
      <g class="door double-leaf-door" style="--door:${color}">
        <line class="door-swing-direction" x1="${center}" y1="${y}" x2="${center}" y2="${y + dy}" marker-end="url(#door-arrow)" />
        <path d="M ${center} ${y + dy} Q ${center - leaf} ${y + dy} ${center - leaf} ${y}" />
        <path d="M ${center} ${y + dy} Q ${center + leaf} ${y + dy} ${center + leaf} ${y}" />
        <line class="door-divider" x1="${center}" y1="${y - 5}" x2="${center}" y2="${y + 5}" />
      </g>`;
  }).join("");
}

function outwardSideDoor(x, y, direction, color, leaf = 20) {
  const dx = direction * 32;
  return `
    <g class="side-door double-leaf-door" style="--door:${color}">
      <line class="door-swing-direction" x1="${x}" y1="${y}" x2="${x + dx}" y2="${y}" marker-end="url(#door-arrow)" />
      <path d="M ${x + dx} ${y} Q ${x + dx} ${y - leaf} ${x} ${y - leaf}" />
      <path d="M ${x + dx} ${y} Q ${x + dx} ${y + leaf} ${x} ${y + leaf}" />
      <line class="door-divider" x1="${x - 5}" y1="${y}" x2="${x + 5}" y2="${y}" />
    </g>`;
}

function renderPlan(spec) {
  // One scale for the whole plan: the width across, the length and any
  // extension down the sheet, fitted into the view's box.
  const shape = aframeShape(spec);
  const scale = Math.min(235 / shape.widthMm, 620 / shape.totalLengthMm);
  const width = n(shape.widthMm * scale);
  const length = n(shape.lengthMm * scale);
  const x = n(242.5 - width / 2);
  const y = 95;
  const right = n(x + width);
  const bottom = n(y + length);
  const centerX = x + width / 2;
  const stationY = spec.stationRatios.map((ratio) => y + ratio * length);
  const anchorRatios = closedAnchorRatios(spec);
  const anchorSpacingStartRatio = anchorRatios[0] ?? 0;
  const anchorSpacingEndRatio = anchorRatios[1] ?? 1;
  const anchorSpacingStartY = y + anchorSpacingStartRatio * length;
  const anchorSpacingEndY = y + anchorSpacingEndRatio * length;
  const anchorSpacingMm = Math.round((anchorSpacingEndRatio - anchorSpacingStartRatio) * spec.dimensions.closedLengthMm);
  const extensionFrames = spec.structure.extension.enabled ? spec.structure.extension.frames : 0;
  const extensionHeight = n((shape.totalLengthMm - shape.lengthMm) * scale);
  const extensionFoundation = spec.foundation.extension;
  const extensionMeasuredSpanMm = extensionFrames
    ? extensionFoundation.passageLengthMm + extensionFoundation.anchorSpanMm
    : 0;
  const passageRatio = extensionFrames
    ? extensionFoundation.passageLengthMm / extensionMeasuredSpanMm
    : 0;
  const extensionInnerY = extensionFrames ? bottom + passageRatio * extensionHeight : bottom;
  const extensionYs = extensionFrames
    ? [
        bottom,
        ...Array.from({ length: extensionFrames }, (_, index) => (
          extensionInnerY + index * (bottom + extensionHeight - extensionInnerY) / (extensionFrames - 1)
        ))
      ]
    : [bottom];
  const planFootprintBottom = bottom + extensionHeight;
  const widthDimensionY = planFootprintBottom + (extensionFrames ? 30 : 55);
  const widthAxisLabelY = widthDimensionY + 28;
  const doorY = y + spec.doors.sideDoor.stationRatio * length;
  const green = spec.doors.emergencyColor;
  const startDoorCenters = spec.doors.endGableStartCenters ?? spec.doors.endGableCenters ?? [];
  const endDoorCenters = spec.doors.endGableEndCenters ?? spec.doors.endGableCenters ?? [];
  const internalDoorPair = spec.doors.internalDoorPair;
  const internalDoorY = internalDoorPair?.enabled
    ? y + internalDoorPair.stationRatio * length
    : 0;
  const stationLines = stationY.map((sy, index) => `
    <line class="station-line" x1="${x}" y1="${n(sy)}" x2="${right}" y2="${n(sy)}" />
    ${svgText(x - 18, sy + 4, index + 1, "station-label", 'text-anchor="end"')}`).join("");

  const anchorMarks = anchorRatios.map((ratio, anchorIndex) => {
    const sy = y + ratio * length;
    const leftLabel = spec.anchors.closedLabelsLeft[anchorIndex] ?? `B${anchorIndex + 1}`;
    const rightLabel = spec.anchors.closedLabelsRight[anchorIndex] ?? `B${anchorIndex + 5}`;
    const centerXMm = Math.round(ratio * spec.dimensions.closedLengthMm);
    const block = spec.foundation.concreteAnchor;
    return `
      <rect class="concrete plan-anchor-pad" data-anchor="${leftLabel}" data-center-x-mm="${centerXMm}" data-center-y-mm="0" data-size-x-mm="${block.lengthMm}" data-size-y-mm="${block.widthMm}" data-depth-mm="${block.depthMm}" x="${x - 14}" y="${n(sy - 13)}" width="28" height="26" />
      <rect class="concrete plan-anchor-pad" data-anchor="${rightLabel}" data-center-x-mm="${centerXMm}" data-center-y-mm="${spec.dimensions.widthMm}" data-size-x-mm="${block.lengthMm}" data-size-y-mm="${block.widthMm}" data-depth-mm="${block.depthMm}" x="${right - 14}" y="${n(sy - 13)}" width="28" height="26" />
      <circle class="anchor-point" cx="${x}" cy="${n(sy)}" r="5" />
      <circle class="anchor-point" cx="${right}" cy="${n(sy)}" r="5" />
      ${svgText(x - 30, sy + 4, leftLabel, "anchor-label", 'text-anchor="end"')}
      ${svgText(right + 30, sy + 4, rightLabel, "anchor-label")}`;
  }).join("");

  const extension = extensionFrames ? `
    <g class="extension">
      <rect class="concrete-rail extension-connector-plan" data-side="left" x="${x - 4}" y="${n(extensionInnerY)}" width="8" height="${n(bottom + extensionHeight - extensionInnerY)}" />
      <rect class="concrete-rail extension-connector-plan" data-side="right" x="${right - 4}" y="${n(extensionInnerY)}" width="8" height="${n(bottom + extensionHeight - extensionInnerY)}" />
      <rect class="concrete extension-anchor-pad" data-anchor="${spec.anchors.extensionLeftLabel}-INNER" data-center-x-mm="${spec.dimensions.closedLengthMm + extensionFoundation.passageLengthMm}" data-center-y-mm="0" data-size-x-mm="${spec.foundation.concreteAnchor.lengthMm}" data-size-y-mm="${spec.foundation.concreteAnchor.widthMm}" data-depth-mm="${spec.foundation.concreteAnchor.depthMm}" x="${x - 14}" y="${n(extensionInnerY - 13)}" width="28" height="26" />
      <rect class="concrete extension-anchor-pad" data-anchor="${spec.anchors.extensionRightLabel}-INNER" data-center-x-mm="${spec.dimensions.closedLengthMm + extensionFoundation.passageLengthMm}" data-center-y-mm="${spec.dimensions.widthMm}" data-size-x-mm="${spec.foundation.concreteAnchor.lengthMm}" data-size-y-mm="${spec.foundation.concreteAnchor.widthMm}" data-depth-mm="${spec.foundation.concreteAnchor.depthMm}" x="${right - 14}" y="${n(extensionInnerY - 13)}" width="28" height="26" />
      <rect class="concrete extension-anchor-pad" data-anchor="${spec.anchors.extensionLeftLabel}-OUTER" data-center-x-mm="${spec.dimensions.closedLengthMm + extensionMeasuredSpanMm}" data-center-y-mm="0" data-size-x-mm="${spec.foundation.concreteAnchor.lengthMm}" data-size-y-mm="${spec.foundation.concreteAnchor.widthMm}" data-depth-mm="${spec.foundation.concreteAnchor.depthMm}" x="${x - 14}" y="${bottom + extensionHeight - 13}" width="28" height="26" />
      <rect class="concrete extension-anchor-pad" data-anchor="${spec.anchors.extensionRightLabel}-OUTER" data-center-x-mm="${spec.dimensions.closedLengthMm + extensionMeasuredSpanMm}" data-center-y-mm="${spec.dimensions.widthMm}" data-size-x-mm="${spec.foundation.concreteAnchor.lengthMm}" data-size-y-mm="${spec.foundation.concreteAnchor.widthMm}" data-depth-mm="${spec.foundation.concreteAnchor.depthMm}" x="${right - 14}" y="${bottom + extensionHeight - 13}" width="28" height="26" />
      <line class="structure-heavy" x1="${x}" y1="${bottom}" x2="${x}" y2="${bottom + extensionHeight}" />
      <line class="structure-heavy ${spec.structure.extension.clearInterfacePassage ? "clear-interface" : ""}" x1="${right}" y1="${spec.structure.extension.clearInterfacePassage ? (extensionYs[1] ?? bottom) : bottom}" x2="${right}" y2="${bottom + extensionHeight}" />
      <line class="structure-heavy" x1="${centerX}" y1="${bottom}" x2="${centerX}" y2="${bottom + extensionHeight}" />
      ${extensionYs.map((ey, index) => `
        <line class="station-line" x1="${x}" y1="${n(ey)}" x2="${right}" y2="${n(ey)}" />
        ${index ? svgText(x - 18, ey + 4, `E${index}`, "station-label", 'text-anchor="end"') : ""}`).join("")}
      <circle class="anchor-point" cx="${x}" cy="${bottom + extensionHeight}" r="5" />
      <circle class="anchor-point" cx="${right}" cy="${bottom + extensionHeight}" r="5" />
      <circle class="anchor-point" cx="${x}" cy="${n(extensionInnerY)}" r="5" />
      <circle class="anchor-point" cx="${right}" cy="${n(extensionInnerY)}" r="5" />
      ${svgText(x - 12, bottom + extensionHeight + 4, spec.anchors.extensionLeftLabel, "anchor-label", 'text-anchor="end"')}
      ${svgText(right + 12, bottom + extensionHeight + 4, spec.anchors.extensionRightLabel, "anchor-label")}
    </g>` : "";

  return `
  <g id="top-down-view" aria-label="Top-down plan">
    ${svgText(242, 58, "TOP DOWN / OVERSIKTSBILDE", "view-title", 'text-anchor="middle"')}
    <rect class="wall-fill" x="${x}" y="${y}" width="${width}" height="${length}" />
    <rect class="concrete-rail concrete-rail-plan" x="${x - 4}" y="${y}" width="8" height="${length}" />
    <rect class="concrete-rail concrete-rail-plan" x="${right - 4}" y="${y}" width="8" height="${length}" />
    <line class="structure-heavy" x1="${x}" y1="${y}" x2="${x}" y2="${bottom}" />
    <line class="structure-heavy" x1="${right}" y1="${y}" x2="${right}" y2="${bottom}" />
    <line class="structure-heavy" x1="${centerX}" y1="${y}" x2="${centerX}" y2="${bottom + extensionHeight}" />
    <line class="structure-heavy" x1="${x}" y1="${y}" x2="${right}" y2="${y}" />
    <line class="structure-heavy" x1="${x}" y1="${bottom}" x2="${right}" y2="${bottom}" />
    ${stationLines}
    ${anchorMarks}
    ${outwardEndDoors(x, y, width, -1, green, startDoorCenters, spec.doors.endDoorWidthRatio / 2)}
    ${outwardEndDoors(x, bottom, width, 1, green, endDoorCenters, spec.doors.endDoorWidthRatio / 2)}
    ${spec.doors.sideDoor.enabled !== false ? `${outwardSideDoor(x, doorY, -1, green)}${outwardSideDoor(right, doorY, 1, green)}` : ""}
    ${internalDoorPair?.enabled ? `<g class="internal-door-pair">${outwardEndDoors(
      x,
      internalDoorY,
      width,
      internalDoorPair.opensToward === "start" ? -1 : 1,
      green,
      internalDoorPair.centerRatios ?? [0.2, 0.8],
      spec.doors.endDoorWidthRatio / 2
    )}</g>` : ""}
    ${extension}
    ${dimensionHorizontal(x, right, widthDimensionY, `${mm(spec.dimensions.widthMm)} mm Y - ANCHOR C/L`)}
    ${anchorRatios.length > 1 ? dimensionVertical(x - 42, anchorSpacingStartY, anchorSpacingEndY, `${mm(anchorSpacingMm)} mm X - ANCHOR C/L`, -1) : ""}
    ${dimensionVertical(right + 54, y, bottom, `${mm(spec.dimensions.closedLengthMm)} mm`)}
    ${extensionFrames ? dimensionVertical(right + 54, bottom, bottom + extensionHeight, `≈${mm(extensionFoundation.overallLengthMm)} mm`) : ""}
    ${extensionFrames ? dimensionVertical(right + 88, bottom, extensionInnerY, `${mm(extensionFoundation.passageLengthMm)} mm`) : ""}
    ${extensionFrames ? dimensionVertical(right + 88, extensionInnerY, bottom + extensionHeight, `${mm(extensionFoundation.anchorSpanMm)} mm`) : ""}
    ${svgText(58, 380, "X · LENGTH / LENGDE", "axis-label", 'transform="rotate(-90 58 380)" text-anchor="middle"')}
    ${svgText(242, widthAxisLabelY, "Y · WIDTH / BREDDE", "axis-label", 'text-anchor="middle"')}
  </g>`;
}

function renderGable(spec) {
  // The section at one scale: as wide and as high as it is, in a 320 × 248 box.
  const { widthMm, heightMm } = spec.dimensions;
  const scale = Math.min(320 / widthMm, 248 / heightMm);
  const cx = 720;
  const base = 330;
  const top = n(base - heightMm * scale);
  const left = n(cx - widthMm * scale / 2);
  const right = n(cx + widthMm * scale / 2);
  const beamY = top + (base - top) * spec.structure.lowerCrossBeamRatio;
  // The collar beam reaches the same share of the way to each leg as before.
  const beamHalf = 62 / 160 * (right - left) / 2;
  const green = spec.doors.emergencyColor;
  // This view is the end gable seen from outside: the left anchors (B1…) on the
  // left, Y running to the right. Doors come from the shape at this view's scale:
  // the end gable's own, and any internal pair behind it.
  const shape = aframeShape(spec);
  const endDoors = shape.doors.filter((door) => door.kind === "end" && door.x > 0);
  const doorW = n(spec.doors.endDoorWidthRatio * widthMm * scale);
  const doorH = n(shape.doors.find((door) => door.kind !== "side")?.heightMm * scale || 0);
  const doorY = n(base - doorH);
  const across = (y) => n(left + y * scale);
  const doorCenters = endDoors.map((door) => across(door.y));
  const internalDoorPair = spec.doors.internalDoorPair;
  const internalDoors = shape.doors.filter((door) => door.kind === "internal");
  const internalDoorCenters = internalDoors.map((door) => across(door.y));
  const internalDoorW = doorW;
  const internalDoorH = doorH;
  const sideDoorHeight = spec.doors.sideDoor.enabled !== false
    ? spec.doors.sideDoor.heightMm / spec.dimensions.heightMm * (base - top)
    : 0;
  const sideDoorTop = base - sideDoorHeight;
  const leftWallAtDoorTop = left + (cx - left) * sideDoorHeight / (base - top);
  const rightWallAtDoorTop = right - (right - cx) * sideDoorHeight / (base - top);
  const leftSideDoorJamb = leftWallAtDoorTop + 14;
  const rightSideDoorJamb = rightWallAtDoorTop - 14;
  const leftRange = `${spec.anchors.closedLabelsLeft[0]}–${spec.anchors.closedLabelsLeft.at(-1)}`;
  const rightRange = `${spec.anchors.closedLabelsRight[0]}–${spec.anchors.closedLabelsRight.at(-1)}`;
  const leftAnchorLabel = spec.structure.extension.enabled
    ? `${spec.anchors.extensionLeftLabel} · ${leftRange}`
    : leftRange;
  const rightAnchorLabel = spec.structure.extension.enabled
    ? `${spec.anchors.extensionRightLabel} · ${rightRange}`
    : rightRange;
  const anchorBlock = spec.foundation.concreteAnchor;
  // The end view is the building's cross-section, fitted into this view's box.
  const section = elevation(sectionProfile(spec), { left, right, top, base });

  return `
  <g id="gable-view" aria-label="A-frame gable elevation" transform="translate(0 350)">
    ${svgText(cx, 58, "A-FRAME / TRIANGELFASADE", "view-title", 'text-anchor="middle"')}
    <polygon class="gable-fill" points="${section.outline.map(([x, y]) => `${x},${y}`).join(" ")}" />
${section.edges.map(([[x1, y1], [x2, y2]]) => `    <line class="structure-heavy" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`).join("\n")}
    <line class="structure-heavy" x1="${n(cx - beamHalf)}" y1="${n(beamY)}" x2="${n(cx + beamHalf)}" y2="${n(beamY)}" />
    ${doorCenters.map((dc) => `
      <g class="door gable-door" style="--door:${green}">
        <rect x="${n(dc - doorW / 2)}" y="${doorY}" width="${n(doorW)}" height="${doorH}" />
        <line class="door-divider" x1="${dc}" y1="${doorY}" x2="${dc}" y2="${base}" />
        <path d="M ${dc} ${base} Q ${dc - doorW / 2 - 12} ${base - 25} ${dc - doorW / 2} ${doorY}" />
        <path d="M ${dc} ${base} Q ${dc + doorW / 2 + 12} ${base - 25} ${dc + doorW / 2} ${doorY}" />
        <line class="door-swing-direction" x1="${dc}" y1="${doorY + 8}" x2="${dc}" y2="${base - 5}" marker-end="url(#door-arrow)" />
      </g>`).join("")}
    ${internalDoorPair?.enabled ? internalDoorCenters.map((dc) => `
      <g class="door internal-gable-door far-door" style="--door:${green}">
        <rect x="${n(dc - internalDoorW / 2)}" y="${n(base - internalDoorH)}" width="${internalDoorW}" height="${internalDoorH}" />
        <line class="door-divider" x1="${dc}" y1="${base - internalDoorH}" x2="${dc}" y2="${base}" />
        <path d="M ${dc} ${base} Q ${n(dc - internalDoorW / 2 - 10)} ${base - 22} ${n(dc - internalDoorW / 2)} ${base - internalDoorH}" />
        <path d="M ${dc} ${base} Q ${n(dc + internalDoorW / 2 + 10)} ${base - 22} ${n(dc + internalDoorW / 2)} ${base - internalDoorH}" />
        <line class="door-swing-direction" x1="${dc}" y1="${base - internalDoorH + 8}" x2="${dc}" y2="${base - 5}" marker-end="url(#door-arrow)" />
      </g>`).join("") : ""}
    ${spec.doors.sideDoor.enabled !== false ? `
      <g class="door gable-middle-door" data-wall="left" style="--door:${green}">
        <path d="M ${left} ${base} L ${n(leftWallAtDoorTop)} ${n(sideDoorTop)} L ${n(leftSideDoorJamb)} ${n(sideDoorTop)} L ${n(leftSideDoorJamb)} ${base}" />
        <line class="door-divider" x1="${n(leftSideDoorJamb - 7)}" y1="${n(sideDoorTop + 12)}" x2="${n(leftSideDoorJamb - 7)}" y2="${base}" />
        <line x1="${n(leftSideDoorJamb)}" y1="${n(base - 14)}" x2="${left - 18}" y2="${n(base - 14)}" marker-end="url(#door-arrow)" />
      </g>
      <g class="door gable-middle-door far-door" data-wall="right" style="--door:${green}">
        <path d="M ${right} ${base} L ${n(rightWallAtDoorTop)} ${n(sideDoorTop)} L ${n(rightSideDoorJamb)} ${n(sideDoorTop)} L ${n(rightSideDoorJamb)} ${base}" />
        <line class="door-divider" x1="${n(rightSideDoorJamb + 7)}" y1="${n(sideDoorTop + 12)}" x2="${n(rightSideDoorJamb + 7)}" y2="${base}" />
        <line x1="${n(rightSideDoorJamb)}" y1="${n(base - 14)}" x2="${right + 18}" y2="${n(base - 14)}" marker-end="url(#door-arrow)" />
      </g>` : ""}
    <rect class="concrete" data-anchor-sample="B1-i-j" data-size-width-mm="${anchorBlock.widthMm}" data-size-length-mm="${anchorBlock.lengthMm}" data-depth-mm="${anchorBlock.depthMm}" x="${left - 24}" y="${base}" width="48" height="38" />
    <rect class="concrete" x="${right - 24}" y="${base}" width="48" height="38" />
    <circle class="anchor-point" cx="${left}" cy="${base}" r="6" />
    <circle class="anchor-point" cx="${right}" cy="${base}" r="6" />
    ${spec.anchors.showApexJoint ? `<circle class="anchor-point apex" cx="${cx}" cy="${top}" r="5" />` : ""}
    ${svgText(left, base + 24, leftAnchorLabel, "anchor-label", 'text-anchor="middle"')}
    ${svgText(right, base + 24, rightAnchorLabel, "anchor-label", 'text-anchor="middle"')}
    ${dimensionVertical(left - 38, base, base + 38, `${mm(anchorBlock.depthMm)} mm`, -1)}
    ${dimensionHorizontal(right - 24, right + 24, base + 50, `${mm(anchorBlock.widthMm)} mm`)}
    ${svgText(left - 30, base + 52, "B1 i-j", "anchor-coordinate-label", 'text-anchor="end"')}
    ${dimensionHorizontal(left, right, base + 76, `${mm(spec.dimensions.widthMm)} mm`)}
    ${dimensionVertical(right + 62, top, base, `${mm(spec.dimensions.heightMm)} mm`)}
    ${svgText(cx, 432, "Y · WIDTH / BREDDE", "axis-label", 'text-anchor="middle"')}
    ${svgText(918, 205, "Z · HEIGHT / HØYDE", "axis-label", 'transform="rotate(-90 918 205)" text-anchor="middle"')}
  </g>`;
}

// The shell in millimetres, as every view draws it: X along the length from
// the start gable, Y across from the left anchors (B1…) to the right ones, Z up.
// The open extension stands past the end gable, beyond a clear passage, as the
// plan and the foundation schedule place it.
export function aframeShape(input) {
  const spec = input.stationRatios ? input : normalizeSpec(input);
  const { closedLengthMm: L, widthMm: W, heightMm: H } = spec.dimensions;
  const frames = spec.structure.extension.enabled ? spec.structure.extension.frames : 0;
  const passageMm = frames ? spec.foundation.extension.passageLengthMm : 0;
  const spanMm = frames ? spec.foundation.extension.anchorSpanMm : 0;
  const extension = Array.from({ length: frames }, (_, index) => ({ id: `E${index + 1}`, x: L + passageMm + (frames > 1 ? index * spanMm / (frames - 1) : 0) }));
  const block = spec.foundation.concreteAnchor;
  const anchors = closedAnchorRatios(spec).flatMap((ratio, index) => [
    { id: spec.anchors.closedLabelsLeft[index] ?? `B${index + 1}`, x: ratio * L, y: 0 },
    { id: spec.anchors.closedLabelsRight[index] ?? `B${index + 1 + closedAnchorRatios(spec).length}`, x: ratio * L, y: W }
  ]);
  if (frames) {
    for (const [where, x] of [["INNER", L + passageMm], ["OUTER", L + passageMm + spanMm]]) {
      anchors.push({ id: `${spec.anchors.extensionLeftLabel}-${where}`, x, y: 0 }, { id: `${spec.anchors.extensionRightLabel}-${where}`, x, y: W });
    }
  }
  // Emergency doors in millimetres. End and internal doors take their width as a
  // share of the span and the side door's height unless the spec gives one.
  const d = spec.doors;
  const doorWidthMm = d.endDoorWidthRatio * W;
  const doorHeightMm = d.endDoorHeightMm ?? d.sideDoor.heightMm;
  const doors = [
    ...(d.endGableStartCenters ?? d.endGableCenters ?? []).map((ratio, index) => ({ id: `start-${index + 1}`, kind: "end", x: 0, y: ratio * W, widthMm: doorWidthMm, heightMm: doorHeightMm })),
    ...(d.endGableEndCenters ?? d.endGableCenters ?? []).map((ratio, index) => ({ id: `end-${index + 1}`, kind: "end", x: L, y: ratio * W, widthMm: doorWidthMm, heightMm: doorHeightMm })),
    ...(d.sideDoor.enabled !== false ? ["left", "right"].map((side) => ({ id: `side-${side}`, kind: "side", side, x: d.sideDoor.stationRatio * L, widthMm: d.sideDoor.widthMm, heightMm: d.sideDoor.heightMm })) : []),
    ...(d.internalDoorPair?.enabled ? (d.internalDoorPair.centerRatios ?? [0.2, 0.8]).map((ratio, index) => ({ id: `internal-${index + 1}`, kind: "internal", x: d.internalDoorPair.stationRatio * L, y: ratio * W, widthMm: doorWidthMm, heightMm: doorHeightMm })) : [])
  ];
  return {
    doors,
    lengthMm: L, widthMm: W, heightMm: H, totalLengthMm: L + passageMm + spanMm, passageMm, spanMm,
    stations: spec.stationRatios.map((ratio) => ratio * L), extension, anchors, anchorBlock: block,
    // The clear passage's head, as a height.
    passageHeadMm: (1 - (spec.structure.extension.passageHeadRatio ?? 0.69)) * H
  };
}

// The 3D sketch: the closed shell's faces, its frames, the open extension and
// the anchors, all from aframeShape, through the same view as every sheet.
function renderAxonometric(spec) {
  const shape = aframeShape(spec);
  const { lengthMm: L, widthMm: W, heightMm: H } = shape;
  const profile = sectionProfile(spec);
  const solid = extrusionSolid(profile, [shape.stations.map((x, index) => ({ id: `F${index + 1}`, ratio: x / L }))], { lengthMm: L });
  const faces = facing(solidFaces(solid));
  const hidden = hiddenBehind(faces);
  const P = (x, y, z) => ({ x, y, z });
  // A point on a leg of the A at a height: the left leg (y = 0 side) or the right.
  const leg = (x, side, z) => P(x, side === "left" ? (z / H) * W / 2 : W - (z / H) * W / 2, z);
  const segments = [];
  const add = (from, to, className, data = "") => segments.push({ from, to, className, data });
  shape.stations.forEach((x, index) => {
    add(leg(x, "left", 0), leg(x, "left", H), "axon-frame", `data-frame="${index + 1}"`);
    add(leg(x, "right", H), leg(x, "right", 0), "axon-frame", `data-frame="${index + 1}"`);
  });
  const clear = spec.structure.extension.clearInterfacePassage;
  shape.extension.forEach(({ id, x }, index) => {
    add(leg(x, "left", 0), leg(x, "left", H), "axon-frame extension-frame", `data-frame="${id}"`);
    // The first frame past a clear passage is open on the right below the passage head.
    const foot = clear && index === 0 ? shape.passageHeadMm : 0;
    add(leg(x, "right", H), leg(x, "right", foot), `axon-frame extension-frame${foot ? " clear-interface" : ""}`, `data-frame="${id}"`);
  });
  const end = shape.extension.length ? shape.extension.at(-1).x : L;
  add(leg(0, "left", H), leg(end, "left", H), "structure-heavy", 'data-rail="ridge"');
  add(leg(0, "left", 0), leg(end, "left", 0), "structure-heavy", 'data-rail="left"');
  add(leg(0, "right", 0), leg(L, "right", 0), "structure-heavy", 'data-rail="right"');
  if (shape.extension.length) {
    add(leg(shape.extension[0].x, "right", 0), leg(end, "right", 0), "structure-heavy", 'data-rail="right-extension"');
    if (clear) add(leg(L, "right", shape.passageHeadMm), leg(shape.extension[0].x, "right", shape.passageHeadMm), "structure-heavy passage-header", 'data-rail="passage-head"');
  }
  // Steel wire bracing on the long walls, as the side view draws it.
  if (spec.bracing.steelWire) {
    const wires = spec.bracing.elements?.length
      ? spec.bracing.elements.map((element) => ({ wall: element.wall === "far" ? "right" : "left", from: element.from, to: element.to }))
      : (spec.bracing.zones ?? []).flatMap(([a, b]) => ["left", "right"].flatMap((wall) => [
          { wall, from: [a, 0], to: [b, 1] }, { wall, from: [a, 1], to: [b, 0] }]));
    for (const wire of wires) {
      add(leg(wire.from[0] * L, wire.wall, (1 - wire.from[1]) * H), leg(wire.to[0] * L, wire.wall, (1 - wire.to[1]) * H), `wire-${wire.wall === "left" ? "near" : "far"}`);
    }
  }
  // Door outlines: end and internal doors stand across the shell; a side door
  // sits on the skin of its long wall, from the ground to its head.
  const doorOutlines = shape.doors.map((door) => {
    const half = door.widthMm / 2, h = door.heightMm;
    const corners = door.kind === "side"
      ? [leg(door.x - half, door.side, 0), leg(door.x + half, door.side, 0), leg(door.x + half, door.side, h), leg(door.x - half, door.side, h)]
      : [P(door.x, door.y - half, 0), P(door.x, door.y + half, 0), P(door.x, door.y + half, h), P(door.x, door.y - half, h)];
    const middle = door.kind === "side" ? [leg(door.x, door.side, 0), leg(door.x, door.side, h)] : [P(door.x, door.y, 0), P(door.x, door.y, h)];
    return { door, edges: [[corners[0], corners[3]], [corners[3], corners[2]], [corners[2], corners[1]]], middle };
  });
  const anchors = shape.anchors.map((anchor) => ({ ...anchor, at: P(anchor.x, anchor.y, 0) }));
  const K = fit([...faces.flatMap((face) => face.points), ...segments.flatMap(({ from, to }) => [from, to]), ...anchors.map(({ at }) => at)], { x: 470, y: 80, w: 450, h: 255 });
  const lines = segments.flatMap(({ from, to, className, data }) => visibleParts(hidden, from, to).map(([a, b]) => {
    const [x1, y1] = K(a), [x2, y2] = K(b);
    return `<line class="${className}"${data ? ` ${data}` : ""} x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" />`;
  }));
  const line3 = ([a, b], className) => { const [x1, y1] = K(a), [x2, y2] = K(b); return `<line class="${className}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" />`; };
  const doors = doorOutlines.map(({ door, edges, middle }) => {
    const parts = edges.flatMap(([a, b]) => visibleParts(hidden, a, b)).map((part) => line3(part, "axon-door-edge"));
    if (!parts.length) return "";
    const divider = visibleParts(hidden, ...middle).map((part) => line3(part, "door-divider"));
    return `<g class="door axon-door" data-door="${door.id}" style="--door:${spec.doors.emergencyColor}">${parts.join("")}${divider.join("")}</g>`;
  });
  const marks = anchors.filter(({ at }) => !hidden(at)).map(({ id, at }) => {
    const [x, y] = K(at);
    return `<circle class="anchor-point concrete-anchor-node" data-anchor="${esc(id)}" cx="${n(x)}" cy="${n(y)}" r="4" />`;
  });
  return `
  <g id="axonometric-view" aria-label="Three-dimensional sketch">
    ${svgText(735, 55, "3D SKETCH / 3D-SKISSE", "view-title", 'text-anchor="middle"')}
    ${faces.map((face) => `<polygon class="axon-wall" points="${face.points.map((p) => K(p).map(n).join(",")).join(" ")}" />`).join("")}
    ${lines.join("")}
    ${doors.join("")}
    ${marks.join("")}
    ${svgText(735, 358, "X LENGTH/LENGDE · Y WIDTH/BREDDE · Z HEIGHT/HØYDE", "axis-label", 'text-anchor="middle"')}
  </g>`;
}

function renderSide(spec) {
  // The left long side (anchors B1…) seen from outside, at one scale: X to the
  // right from the start gable, Z up. The extension stands past the end gable,
  // to the right, as on the plan.
  const shape = aframeShape(spec);
  const hasExtension = spec.structure.extension.enabled;
  const [areaLeft, areaRight] = hasExtension ? [80, 930] : [130, 870];
  const scale = Math.min((areaRight - areaLeft) / shape.totalLengthMm, 370 / shape.heightMm);
  const X = (mmX) => n((areaLeft + areaRight) / 2 + (mmX - shape.totalLengthMm / 2) * scale);
  const xStart = X(0);
  const xEnd = X(shape.lengthMm);
  const yBase = 1205;
  const yTop = n(yBase - shape.heightMm * scale);
  const extensionEnd = X(shape.totalLengthMm);
  const sideViewCenter = (xStart + extensionEnd) / 2;
  const heightDimensionX = Math.min(950, extensionEnd + 50);
  const heightAxisLabelX = heightDimensionX + 22;
  const stationX = spec.stationRatios.map((ratio) => xStart + ratio * (xEnd - xStart));
  const levels = Array.from({ length: 6 }, (_, index) => yTop + index * (yBase - yTop) / 5);
  const anchorRatios = closedAnchorRatios(spec);
  const green = spec.doors.emergencyColor;
  const doorCenter = xStart + spec.doors.sideDoor.stationRatio * (xEnd - xStart);
  const doorWidth = Math.max(28, spec.doors.sideDoor.widthMm / spec.dimensions.closedLengthMm * (xEnd - xStart));
  const doorHeight = spec.doors.sideDoor.heightMm / spec.dimensions.heightMm * (yBase - yTop);
  const doorTop = yBase - doorHeight;
  const sideDoorLeafCount = spec.doors.sideDoor.leafCount ?? 2;
  const startDoorCenters = spec.doors.endGableStartCenters ?? spec.doors.endGableCenters ?? [];
  const endDoorCenters = spec.doors.endGableEndCenters ?? spec.doors.endGableCenters ?? [];
  const internalDoorPair = spec.doors.internalDoorPair;
  const internalDoorX = internalDoorPair?.enabled
    ? xStart + internalDoorPair.stationRatio * (xEnd - xStart)
    : 0;
  const extensionFrames = shape.extension.length;
  const extensionFoundation = spec.foundation.extension;
  const innerAnchorX = extensionFrames ? X(shape.extension[0].x) : xEnd;
  const extensionXs = shape.extension.map(({ x }) => X(x));

  const stationGrid = stationX.map((sx, index) => `
    <line class="station-line" x1="${n(sx)}" y1="${yTop}" x2="${n(sx)}" y2="${yBase}" />
    ${svgText(sx, yTop - 10, index + 1, "station-label", 'text-anchor="middle"')}`).join("");
  const clearHeadY = yTop + (spec.structure.extension.passageHeadRatio ?? 0.69) * (yBase - yTop);
  const extensionGrid = extensionFrames ? extensionXs.map((sx, index) => {
    const isClearInterfacePost = spec.structure.extension.clearInterfacePassage && index === 0;
    return `
      <line class="station-line ${isClearInterfacePost ? "clear-interface passage-boundary" : ""}" x1="${n(sx)}" y1="${yTop}" x2="${n(sx)}" y2="${yBase}" />
      ${svgText(sx, yTop - 10, `E${index + 1}`, "station-label", 'text-anchor="middle"')}`;
  }).join("") : "";
  const passageHeader = spec.structure.extension.clearInterfacePassage
    ? `<line class="structure-heavy passage-header" x1="${xEnd}" y1="${n(clearHeadY)}" x2="${n(innerAnchorX)}" y2="${n(clearHeadY)}" />`
    : "";
  const passageLabelX = (xEnd + innerAnchorX) / 2;
  const levelGrid = levels.map((level, index) => {
    const isBoundary = index === 0 || index === levels.length - 1;
    const className = isBoundary ? "structure-heavy" : "station-line";
    if (index === levels.length - 1 && spec.structure.extension.clearInterfacePassage) {
      return `
        <line class="${className} passage-ground-shell" x1="${xStart}" y1="${n(level)}" x2="${xEnd}" y2="${n(level)}" />
        <line class="${className} passage-ground-extension" x1="${n(innerAnchorX)}" y1="${n(level)}" x2="${extensionEnd}" y2="${n(level)}" />`;
    }
    return `<line class="${className}" x1="${xStart}" y1="${n(level)}" x2="${extensionEnd}" y2="${n(level)}" />`;
  }).join("");

  const anchorMarks = anchorRatios.map((ratio, anchorIndex) => {
    const sx = xStart + ratio * (xEnd - xStart);
    const label = spec.anchors.closedLabelsLeft[anchorIndex] ?? `B${anchorIndex + 1}`;
    return `
      <rect class="concrete" data-anchor="${label}" data-depth-mm="${spec.foundation.concreteAnchor.depthMm}" x="${n(sx - 18)}" y="${yBase}" width="36" height="34" />
      <circle class="anchor-point" cx="${n(sx)}" cy="${yBase}" r="5" />
      ${svgText(sx, yBase + 23, label, "anchor-label", 'text-anchor="middle"')}`;
  }).join("");

  const explicitWireBracing = (spec.bracing.elements ?? []).map((element) => {
    const [fromXRatio, fromYRatio] = element.from;
    const [toXRatio, toYRatio] = element.to;
    const x1 = xStart + fromXRatio * (xEnd - xStart);
    const y1 = yTop + fromYRatio * (yBase - yTop);
    const x2 = xStart + toXRatio * (xEnd - xStart);
    const y2 = yTop + toYRatio * (yBase - yTop);
    const className = element.wall === "far" ? "wire-far" : "wire-near";
    if (element.curveOffset) {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2 + element.curveOffset;
      return `<path class="${className}" data-wire="${element.id}" d="M ${n(x1)} ${n(y1)} Q ${n(cx)} ${n(cy)} ${n(x2)} ${n(y2)}" />`;
    }
    return `<line class="${className}" data-wire="${element.id}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" />`;
  }).join("");

  const zonedWireBracing = (spec.bracing.zones ?? []).map(([startRatio, endRatio]) => {
    const start = xStart + startRatio * (xEnd - xStart);
    const end = xStart + endRatio * (xEnd - xStart);
    return `
      <g class="wire-bracing">
        <line class="wire-near" x1="${n(start)}" y1="${yTop}" x2="${n(end)}" y2="${yBase}" />
        <line class="wire-near" x1="${n(start)}" y1="${yBase}" x2="${n(end)}" y2="${yTop}" />
        <path class="wire-far" d="M ${n(start)} ${yTop} Q ${n((start + end) / 2)} ${n((yTop + yBase) / 2 - 18)} ${n(end)} ${yBase}" />
        <path class="wire-far" d="M ${n(start)} ${yBase} Q ${n((start + end) / 2)} ${n((yTop + yBase) / 2 + 18)} ${n(end)} ${yTop}" />
      </g>`;
  }).join("");
  const wireBracing = spec.bracing.steelWire
    ? (spec.bracing.elements?.length ? explicitWireBracing : zonedWireBracing)
    : "";

  return `
  <g id="side-view" aria-label="Long side elevation">
    ${svgText(sideViewCenter, yTop - 33, "SIDE VIEW / LANGFASADE", "view-title", 'text-anchor="middle"')}
    <rect class="wall-fill" x="${xStart}" y="${yTop}" width="${xEnd - xStart}" height="${yBase - yTop}" />
    <rect class="concrete-rail concrete-rail-side" x="${xStart}" y="${yBase}" width="${xEnd - xStart}" height="10" />
    ${levelGrid}
    ${stationGrid}
    ${extensionGrid}
    ${passageHeader}
    ${spec.structure.extension.clearInterfacePassage ? svgText(passageLabelX, clearHeadY + 18, "CLEAR PASSAGE / ÅPEN PASSASJE", "passage-label", 'text-anchor="middle"') : ""}
    <line class="structure-heavy" x1="${xStart}" y1="${yTop}" x2="${xStart}" y2="${yBase}" />
    <line class="structure-heavy" x1="${xEnd}" y1="${yTop}" x2="${xEnd}" y2="${yBase}" />
    ${wireBracing}
    ${spec.doors.sideDoor.enabled !== false ? `<g class="door side-elevation-door" style="--door:${green}">
      <rect x="${n(doorCenter - doorWidth / 2)}" y="${n(doorTop)}" width="${n(doorWidth)}" height="${n(doorHeight)}" />
      ${sideDoorLeafCount > 1 ? `<line class="door-divider" x1="${n(doorCenter - doorWidth / 6)}" y1="${n(doorTop)}" x2="${n(doorCenter - doorWidth / 6)}" y2="${yBase}" />` : ""}
      ${sideDoorLeafCount > 1
        ? `<path d="M ${doorCenter} ${yBase} Q ${n(doorCenter - doorWidth / 2 - 15)} ${n(yBase - doorHeight / 2)} ${n(doorCenter - doorWidth / 2)} ${doorTop}" />
      <path d="M ${doorCenter} ${yBase} Q ${n(doorCenter + doorWidth / 2 + 15)} ${n(yBase - doorHeight / 2)} ${n(doorCenter + doorWidth / 2)} ${doorTop}" />`
        : `<path d="M ${n(doorCenter - doorWidth / 2)} ${yBase} Q ${n(doorCenter + doorWidth / 2 + 12)} ${n(yBase - doorHeight / 2)} ${n(doorCenter + doorWidth / 2)} ${doorTop}" />`}
      <line class="door-swing-direction" x1="${doorCenter}" y1="${n(doorTop + 8)}" x2="${doorCenter}" y2="${n(yBase - 5)}" marker-end="url(#door-arrow)" />
      <rect class="canopy" x="${n(doorCenter - doorWidth / 2 - 8)}" y="${n(doorTop - 16)}" width="${n(doorWidth + 16)}" height="8" />
    </g>` : ""}
    ${internalDoorPair?.enabled ? `<g class="internal-section-door far-door" style="--door:${green}">
      <line x1="${n(internalDoorX - 3)}" y1="${n(doorTop)}" x2="${n(internalDoorX - 3)}" y2="${yBase}" />
      <line x1="${n(internalDoorX + 3)}" y1="${n(doorTop)}" x2="${n(internalDoorX + 3)}" y2="${yBase}" />
      <line x1="${n(internalDoorX + 3)}" y1="${n(yBase - 22)}" x2="${n(internalDoorX + 34)}" y2="${n(yBase - 22)}" marker-end="url(#door-arrow)" />
    </g>` : ""}
    <g class="edge-door-indicators" style="--door:${green}">
      ${startDoorCenters.length ? `<rect x="${xStart - 32}" y="${yBase - 70}" width="32" height="70" />
      <line x1="${xStart - 32}" y1="${yBase - 35}" x2="${xStart - 54}" y2="${yBase - 35}" marker-end="url(#door-arrow)" />` : ""}
      ${endDoorCenters.length ? `<rect x="${xEnd}" y="${yBase - 70}" width="32" height="70" />
      <line x1="${xEnd + 32}" y1="${yBase - 35}" x2="${xEnd + 54}" y2="${yBase - 35}" marker-end="url(#door-arrow)" />` : ""}
    </g>
    ${extensionFrames ? `<rect class="concrete-rail extension-connector-side" x="${n(innerAnchorX)}" y="${yBase}" width="${n(extensionEnd - innerAnchorX)}" height="10" />` : ""}
    ${anchorMarks}
    ${extensionFrames ? `
      <rect class="concrete extension-anchor-pad extension-anchor-pad-side" data-anchor="${spec.anchors.extensionLeftLabel}-INNER" data-depth-mm="${spec.foundation.concreteAnchor.depthMm}" x="${n(innerAnchorX - 18)}" y="${yBase}" width="36" height="34" />
      <rect class="concrete extension-anchor-pad extension-anchor-pad-side" data-anchor="${spec.anchors.extensionLeftLabel}-OUTER" data-depth-mm="${spec.foundation.concreteAnchor.depthMm}" x="${n(extensionEnd - 18)}" y="${yBase}" width="36" height="34" />
      <circle class="anchor-point" cx="${n(innerAnchorX)}" cy="${yBase}" r="5" />
      <circle class="anchor-point" cx="${extensionEnd}" cy="${yBase}" r="5" />
      ${svgText((innerAnchorX + extensionEnd) / 2, yBase + 24, spec.anchors.extensionLeftLabel, "anchor-label", 'text-anchor="middle"')}
    ` : ""}
    ${dimensionHorizontal(xStart, xEnd, yBase + 62, `${mm(spec.dimensions.closedLengthMm)} mm · ${spec.structure.bays} BAYS`)}
    ${extensionFrames ? dimensionHorizontal(xEnd, innerAnchorX, yBase + 62, `${mm(extensionFoundation.passageLengthMm)} mm PASSAGE`) : ""}
    ${extensionFrames ? dimensionHorizontal(innerAnchorX, extensionEnd, yBase + 62, `${mm(extensionFoundation.anchorSpanMm)} mm`) : ""}
    ${extensionFrames ? dimensionHorizontal(xStart, extensionEnd, yBase + 92, `TOTAL ≈${mm(spec.dimensions.closedLengthMm + spec.dimensions.extensionLengthMm)} mm`) : ""}
    ${dimensionVertical(heightDimensionX, yTop, yBase, `${mm(spec.dimensions.heightMm)} mm`, -1)}
    ${svgText(sideViewCenter, 1330, "X · LENGTH / LENGDE", "axis-label", 'text-anchor="middle"')}
    ${svgText(heightAxisLabelX, n((yTop + yBase) / 2), "Z · HEIGHT / HØYDE", "axis-label", `transform="rotate(-90 ${heightAxisLabelX} ${n((yTop + yBase) / 2)})" text-anchor="middle"`)}
  </g>`;
}

function renderTitleBlock(spec) {
  return `
  <g class="title-block">
    <rect x="35" y="1345" width="930" height="42" />
    <line x1="390" y1="1345" x2="390" y2="1387" />
    <line x1="730" y1="1345" x2="730" y2="1387" />
    <line x1="855" y1="1345" x2="855" y2="1387" />
    ${svgText(48, 1364, spec.drawingTitle, "title-main")}
    ${svgText(48, 1380, `${spec.revision} · TEMPLATE-GENERATED`, "title-small")}
    ${svgText(405, 1364, spec.notes[0] ?? "", "title-small")}
    ${svgText(405, 1380, spec.notes[1] ?? "", "title-small")}
    ${svgText(745, 1364, "SCALE / MÅLESTOKK", "title-small")}
    ${svgText(745, 1380, "NTS · DRAFT", "title-small")}
    ${svgText(870, 1364, "DRAWING / TEGNING", "title-small")}
    ${svgText(870, 1380, `${spec.drawingNumber} · ${spec.revision}`, "title-small")}
    ${svgText(500, 1398, spec.notes[2] ?? "", "provenance", 'text-anchor="middle"')}
  </g>`;
}

export function renderAFrameSheet(input) {
  // Views placed by millimetres leave float noise in sums (127.96000000000001);
  // every number on the sheet is kept to two decimals.
  return renderSheet(input).replace(/(\d+\.\d{3,})/g, (value) => String(Number(Number(value).toFixed(2))));
}

function renderSheet(input) {
  const spec = normalizeSpec(input);
  const title = `Plan ${spec.name}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #d9dde0; font-family: Arial, Helvetica, sans-serif; }
    .sheet { display: block; width: min(100%, 1000px); height: auto; margin: 0 auto; background: #ffffff; }
    text { fill: ${DEFAULT_STROKE}; font-size: 10px; font-weight: 400; }
    .sheet-border, .title-block rect, .title-block line { fill: none; stroke: ${DEFAULT_STROKE}; stroke-width: 1; }
    .view-title, .sheet-title { font-size: 15px; font-weight: 500; }
    .station-label, .anchor-label, .title-small, .provenance { font-size: 8px; }
    .passage-label { font-size: 7px; font-weight: 500; }
    .title-main { font-size: 11px; font-weight: 500; }
    .dimension { fill: none; stroke: ${DEFAULT_STROKE}; stroke-width: 0.8; }
    .dimension-text { font-size: 9px; stroke: none; }
    .axis-label { font-size: 9px; }
    .axis-letter { font-size: 11px; font-weight: 500; }
    .wall-fill, .gable-fill, .axon-wall { fill: ${WALL}; stroke: ${DEFAULT_STROKE}; stroke-width: 1.2; }
    .structure-heavy { fill: none; stroke: ${DEFAULT_STROKE}; stroke-width: 4; stroke-linecap: square; }
    .station-line, .axon-frame { fill: none; stroke: ${DEFAULT_STROKE}; stroke-width: 1.2; }
    .extension-frame { stroke-width: 2; }
    .concrete { fill: ${CONCRETE}; stroke: ${DEFAULT_STROKE}; stroke-width: 0.8; }
    .concrete-rail { fill: ${CONCRETE}; stroke: ${DEFAULT_STROKE}; stroke-width: 0.8; }
    .extension-concrete { fill: ${CONCRETE}; stroke: ${DEFAULT_STROKE}; stroke-width: 0.8; }
    .anchor-point { fill: ${DEFAULT_STROKE}; stroke: ${DEFAULT_STROKE}; }
    .anchor-point.apex { fill: #ffffff; stroke-width: 2; }
    .door, .side-door, .internal-door-pair, .internal-section-door, .edge-door-indicators, .axon-door { fill: none; stroke: var(--door); stroke-width: 2; }
    .door-divider { stroke: var(--door); stroke-width: 1.2; stroke-dasharray: 4 3; }
    .canopy { fill: #ffffff; stroke: ${DEFAULT_STROKE}; }
    .far-door { stroke-dasharray: 5 4; }
    .extension-footing { fill: none; stroke: ${DEFAULT_STROKE}; stroke-width: 3; }
    .wire-near { stroke: ${WIRE_NEAR}; stroke-width: 2.5; }
    .wire-far { fill: none; stroke: ${WIRE_FAR}; stroke-width: 1.7; stroke-dasharray: 7 5; }
    .axis { fill: none; stroke: ${DEFAULT_STROKE}; stroke-width: 1.5; }
    .axis circle { fill: ${DEFAULT_STROKE}; }
    .axis-guide { stroke-width: 0.8; stroke-dasharray: 6 5; }
    .graph-edge.graph-frame { stroke-width: 1.4; }
    .graph-edge.graph-rail { stroke-width: 3; }
    .graph-node-label { font-size: 10px; font-weight: 500; }
    .graph-end-door, .graph-side-door, .graph-internal-door, .graph-door-swing, .graph-door-divider { fill: none; stroke: var(--door); stroke-width: 1.8; }
    .graph-door-divider { stroke-width: 1.1; stroke-dasharray: 3 2; }
    .graph-door-direction { fill: none; stroke: var(--door); stroke-width: 1.8; }
    .hide-emergency-doors .door,
    .hide-emergency-doors .side-door,
    .hide-emergency-doors .internal-door-pair,
    .hide-emergency-doors .internal-section-door,
    .hide-emergency-doors .edge-door-indicators,
    .hide-emergency-doors .axon-door,
    .hide-emergency-doors .graph-end-doors,
    .hide-emergency-doors .graph-internal-doors,
    .hide-emergency-doors .graph-door-swings,
    .hide-emergency-doors .graph-door-arrows,
    .hide-emergency-doors .graph-side-doors { display: none; }
    .title-block { fill: none; stroke: ${DEFAULT_STROKE}; }
    @media print {
      @page { size: A3 portrait; margin: 5mm; }
      body { background: #ffffff; }
      .sheet { width: 100%; }
    }
  </style>
</head>
<body>
  <svg class="sheet ${spec.presentation?.showEmergencyDoors === true ? "show-emergency-doors" : "hide-emergency-doors"}" viewBox="0 0 1000 1410" role="img" aria-labelledby="sheet-title sheet-desc">
    <title id="sheet-title">${esc(spec.drawingTitle)}</title>
    <desc id="sheet-desc">Coordinated top-down, A-frame, side and three-dimensional views generated from one shared building specification.</desc>
    <defs>
      <marker id="door-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill="${spec.doors.emergencyColor}" />
      </marker>
      <marker id="axis-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill="${DEFAULT_STROKE}" />
      </marker>
    </defs>
    <rect class="sheet-border" x="20" y="18" width="960" height="1380" />
    ${svgText(500, 42, `PLAN ${spec.name}`, "sheet-title", 'text-anchor="middle"')}
    ${renderPlan(spec)}
    ${renderGable(spec)}
    ${renderAxonometric(spec)}
    ${renderSide(spec)}
    ${renderTitleBlock(spec)}
  </svg>
</body>
</html>`;
}
