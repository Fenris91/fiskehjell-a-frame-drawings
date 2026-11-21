import { normalizeSpec } from "./render-sheet.mjs";
import { foundationSchedule } from "./foundation-schedule.mjs";

const INK = "#111111";
const MUTED = "#5f666b";
const LIGHT = "#eef1f3";
const GRID = "#cdd2d6";
const GREEN = "#00a84f";

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const mm = (value) => `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} mm`;

function text(x, y, value, className = "", extra = "") {
  return `<text x="${x}" y="${y}" class="${className}" ${extra}>${esc(value)}</text>`;
}

function valueRow(x, y, label, value, width = 270) {
  return `
    ${text(x, y, label, "row-label")}
    ${text(x + width, y, value, "row-value", 'text-anchor="end"')}
    <line class="row-rule" x1="${x}" y1="${y + 8}" x2="${x + width}" y2="${y + 8}" />`;
}

function doorSummary(spec) {
  const start = spec.doors.endGableStartCenters ?? spec.doors.endGableCenters ?? [];
  const end = spec.doors.endGableEndCenters ?? spec.doors.endGableCenters ?? [];
  const endSets = start.length + end.length;
  const sideDoorSets = spec.doors.sideDoor?.setCount ?? (spec.doors.sideDoor?.oppositeSideDashed ? 2 : 1);
  const side = spec.doors.sideDoor?.enabled !== false
    ? `${sideDoorSets} long-side sets at X=${Math.round(spec.doors.sideDoor.stationRatio * 100)}% / ${sideDoorSets} langsidesett ved X=${Math.round(spec.doors.sideDoor.stationRatio * 100)}%`
    : "No long-side exterior door / Ingen utvendig langsidedor";
  const internal = spec.doors.internalDoorPair?.enabled
    ? `2 opposed internal doors at X=${Math.round(spec.doors.internalDoorPair.stationRatio * 100)}% / 2 motstaende innvendige dorer ved X=${Math.round(spec.doors.internalDoorPair.stationRatio * 100)}%`
    : "No internal door pair / Ingen innvendig dorpar";
  return [
    `${endSets} end-gable door sets / ${endSets} gavldorsett`,
    side,
    internal,
    "Emergency-door overlay is optional and off in this issue / Nodutgangslag er valgfritt og avslatt"
  ];
}

function bracingSummary(spec) {
  if (!spec.bracing?.steelWire) return "No steel-wire bracing specified / Ingen stålwire angitt";
  const zones = spec.bracing.elements?.length
    ? `${spec.bracing.elements.length} defined wire elements`
    : `${spec.bracing.zones?.length ?? 0} wire-cross zones`;
  return `${zones}; near wall solid, far wall dashed / nær vegg heltrukket, fjern vegg stiplet`;
}

function anchorTable(schedule) {
  const chunks = [schedule.anchors.slice(0, 6), schedule.anchors.slice(6, 12)];
  return chunks.map((anchors, column) => {
    const x = column === 0 ? 48 : 510;
    const header = `
      ${text(x, 324, "ID", "table-head")}
      ${text(x + 68, 324, "CENTER X", "table-head")}
      ${text(x + 155, 324, "CENTER Y", "table-head")}
      ${text(x + 242, 324, "CENTER Z", "table-head")}
      ${text(x + 320, 324, "SIZE X/Y/Z", "table-head")}`;
    const rows = anchors.map((anchor, index) => {
      const y = 352 + index * 34;
      return `
        ${text(x, y, anchor.id, "table-id")}
        ${text(x + 68, y, mm(anchor.centerMm.x), "table-cell")}
        ${text(x + 155, y, mm(anchor.centerMm.y), "table-cell")}
        ${text(x + 242, y, mm(anchor.centerMm.z), "table-cell")}
        ${text(x + 320, y, `${anchor.sizeMm.x}/${anchor.sizeMm.y}/${anchor.sizeMm.z}`, "table-cell")}
        <line class="table-rule" x1="${x}" y1="${y + 10}" x2="${x + 410}" y2="${y + 10}" />`;
    }).join("");
    return `<g class="anchor-column">${header}${rows}</g>`;
  }).join("");
}

function layerDoorOverlay(spec, geometry) {
  const { footprintX, footprintY, footprintWidth, footprintHeight, totalLength } = geometry;
  const closedHeight = footprintHeight * spec.dimensions.closedLengthMm / totalLength;
  const startY = footprintY;
  const endY = footprintY + closedHeight;
  const startCenters = spec.doors.endGableStartCenters ?? spec.doors.endGableCenters ?? [];
  const endCenters = spec.doors.endGableEndCenters ?? spec.doors.endGableCenters ?? [];
  const doorSets = [];

  const endDoor = (id, centerRatio, y, direction) => {
    const center = footprintX + centerRatio * footprintWidth;
    const halfWidth = Math.max(5, footprintWidth * spec.doors.endDoorWidthRatio / 2);
    const extent = direction * 18;
    return `
      <g class="layer-door" data-layer-door-set="${id}" data-door-location="gable">
        <line class="layer-door-direction" x1="${center}" y1="${y}" x2="${center}" y2="${y + extent}" marker-end="url(#checkpoint-door-arrow)" />
        <path d="M ${center} ${y + extent} Q ${center - halfWidth} ${y + extent} ${center - halfWidth} ${y}" />
        <path d="M ${center} ${y + extent} Q ${center + halfWidth} ${y + extent} ${center + halfWidth} ${y}" />
        <line class="layer-door-divider" x1="${center}" y1="${y - 3}" x2="${center}" y2="${y + 3}" />
      </g>`;
  };

  startCenters.forEach((center, index) => doorSets.push(endDoor(`start-${index + 1}`, center, startY, -1)));
  endCenters.forEach((center, index) => doorSets.push(endDoor(`end-${index + 1}`, center, endY, 1)));

  if (spec.doors.sideDoor?.enabled !== false) {
    const y = footprintY + closedHeight * spec.doors.sideDoor.stationRatio;
    const halfWidth = Math.max(5, spec.doors.sideDoor.widthMm / totalLength * footprintHeight / 2);
    const sideDoor = (id, x, direction) => {
      const extent = direction * 18;
      return `
        <g class="layer-door" data-layer-door-set="${id}" data-door-location="long-side">
          <line class="layer-door-direction" x1="${x}" y1="${y}" x2="${x + extent}" y2="${y}" marker-end="url(#checkpoint-door-arrow)" />
          <path d="M ${x + extent} ${y} Q ${x + extent} ${y - halfWidth} ${x} ${y - halfWidth}" />
          <path d="M ${x + extent} ${y} Q ${x + extent} ${y + halfWidth} ${x} ${y + halfWidth}" />
          <line class="layer-door-divider" x1="${x - 3}" y1="${y}" x2="${x + 3}" y2="${y}" />
        </g>`;
    };
    doorSets.push(sideDoor("side-left", footprintX, -1), sideDoor("side-right", footprintX + footprintWidth, 1));
  }

  const internal = spec.doors.internalDoorPair;
  if (internal?.enabled) {
    const y = footprintY + closedHeight * internal.stationRatio;
    const direction = internal.opensToward === "start" ? -1 : 1;
    for (const [index, center] of (internal.centerRatios ?? [0.2, 0.8]).entries()) {
      doorSets.push(endDoor(`internal-${index + 1}`, center, y, direction));
    }
  }

  return `<g class="layer-emergency-doors" aria-label="Emergency-door locations and opening directions">${doorSets.join("")}</g>`;
}

function topDownLayerState(spec, stage, index) {
  const windowX = 64 + index * 294;
  const windowY = 870;
  const windowWidth = 272;
  const windowHeight = 405;
  const totalLength = spec.dimensions.closedLengthMm + (spec.dimensions.extensionLengthMm ?? 0);
  const ratio = totalLength / spec.dimensions.widthMm;
  const maxWidth = 202;
  const maxHeight = 294;
  const footprintWidth = ratio > maxHeight / maxWidth ? maxHeight / ratio : maxWidth;
  const footprintHeight = ratio > maxHeight / maxWidth ? maxHeight : maxWidth * ratio;
  const footprintX = windowX + (windowWidth - footprintWidth) / 2;
  const footprintY = 944 + (maxHeight - footprintHeight) / 2;
  const clipId = `layer-clip-${spec.id}-${index + 1}`;
  const showAnchors = stage.showAnchors === true;
  const anchorSchedule = showAnchors ? foundationSchedule(spec).anchors : [];
  const anchorPads = anchorSchedule.map((anchor) => {
    const x = footprintX + (anchor.centerMm.y / spec.dimensions.widthMm) * footprintWidth;
    const y = footprintY + (anchor.centerMm.x / totalLength) * footprintHeight;
    const width = (anchor.sizeMm.y / spec.dimensions.widthMm) * footprintWidth;
    const height = (anchor.sizeMm.x / totalLength) * footprintHeight;
    return `
      <g class="layer-anchor" data-layer-anchor="${anchor.id}">
        <rect class="layer-anchor-pad" x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" />
        <circle class="layer-anchor-point" cx="${x}" cy="${y}" r="2.5" />
      </g>`;
  }).join("");
  const structure = [];
  const joistCount = 6;
  const blockingCount = Math.max(4, Math.min(9, spec.structure.bays));
  for (let joist = 0; joist < joistCount; joist += 1) {
    const x = footprintX + (joist / (joistCount - 1)) * footprintWidth;
    structure.push(`<line class="layer-wood" x1="${x}" y1="${footprintY}" x2="${x}" y2="${footprintY + footprintHeight}" />`);
  }
  for (let blocking = 1; blocking < blockingCount; blocking += 1) {
    const y = footprintY + (blocking / blockingCount) * footprintHeight;
    structure.push(`<line class="layer-blocking" x1="${footprintX}" y1="${y}" x2="${footprintX + footprintWidth}" y2="${y}" />`);
  }
  const mesh = [];
  for (let offset = -maxHeight; offset <= maxWidth + maxHeight; offset += 13) {
    mesh.push(
      `<line class="layer-mesh" x1="${footprintX + offset}" y1="${footprintY}" x2="${footprintX + offset - maxHeight}" y2="${footprintY + maxHeight}" />`,
      `<line class="layer-mesh" x1="${footprintX + offset}" y1="${footprintY}" x2="${footprintX + offset + maxHeight}" y2="${footprintY + maxHeight}" />`
    );
  }
  const deckLines = [];
  for (let y = footprintY + 8; y < footprintY + footprintHeight; y += 10) {
    deckLines.push(`<line class="layer-deck-line" x1="${footprintX}" y1="${y}" x2="${footprintX + footprintWidth}" y2="${y}" />`);
  }
  const layerContent = stage.kind === "mesh"
    ? `<g clip-path="url(#${clipId})">${mesh.join("")}</g>${structure.join("")}`
    : stage.kind === "insulation"
      ? `<rect class="layer-insulation" x="${footprintX}" y="${footprintY}" width="${footprintWidth}" height="${footprintHeight}" />${structure.join("")}`
      : `<rect class="layer-deck" x="${footprintX}" y="${footprintY}" width="${footprintWidth}" height="${footprintHeight}" />${deckLines.join("")}`;
  const extensionDivider = spec.structure.extension.enabled
    ? footprintY + footprintHeight * spec.dimensions.closedLengthMm / totalLength
    : null;
  const doorOverlay = stage.showDoors === true
    ? layerDoorOverlay(spec, { footprintX, footprintY, footprintWidth, footprintHeight, totalLength })
    : "";
  return `
    <g class="layer-state" data-layer-state="${stage.id}" data-layer-kind="${stage.kind}">
      <defs><clipPath id="${clipId}"><rect x="${footprintX}" y="${footprintY}" width="${footprintWidth}" height="${footprintHeight}" /></clipPath></defs>
      <rect class="layer-window" x="${windowX}" y="${windowY}" width="${windowWidth}" height="${windowHeight}" />
      <circle class="layer-number" cx="${windowX + 22}" cy="${windowY + 24}" r="13" />
      ${text(windowX + 22, windowY + 28, stage.number, "layer-number-text", 'text-anchor="middle"')}
      ${text(windowX + 44, windowY + 22, stage.title, "layer-title")}
      ${text(windowX + 44, windowY + 38, stage.subtitle, "layer-subtitle")}
      <rect class="layer-ground" x="${footprintX}" y="${footprintY}" width="${footprintWidth}" height="${footprintHeight}" />
      ${layerContent}
      ${anchorPads}
      ${extensionDivider == null ? "" : `<line class="layer-extension-divider" data-extension-divider="true" x1="${footprintX}" y1="${extensionDivider}" x2="${footprintX + footprintWidth}" y2="${extensionDivider}" />`}
      <rect class="layer-outline" x="${footprintX}" y="${footprintY}" width="${footprintWidth}" height="${footprintHeight}" />
      ${doorOverlay}
    </g>`;
}

function topDownLayerField(spec) {
  const stages = spec.checkpoint?.topDownLayers ?? [];
  return `
    <g id="top-down-layer-states" aria-label="Three simplified top-down construction layer states">
      <rect class="layer-field" x="48" y="820" width="904" height="500" />
      ${text(64, 846, "TOP-DOWN LAYER STATES / LAGVIS OVERSIKT", "section-title")}
      ${text(936, 846, "ANCHORS SHOWN / FORANKRINGER VIST - DOOR LAYER OPTIONAL", "layer-field-note", 'text-anchor="end"')}
      ${stages.map((stage, index) => topDownLayerState(spec, stage, index)).join("")}
      ${text(52, 1085, "X - LENGTH / LENGDE", "map-axis-label", 'transform="rotate(-90 52 1085)" text-anchor="middle"')}
      ${text(500, 1308, "Y - WIDTH / BREDDE", "map-axis-label", 'text-anchor="middle"')}
    </g>`;
}

export function renderCheckpointSheet(input) {
  const spec = normalizeSpec(input);
  const emergencyColor = spec.doors.emergencyColor ?? GREEN;
  const schedule = foundationSchedule(spec);
  const totalLength = spec.dimensions.closedLengthMm + (spec.dimensions.extensionLengthMm ?? 0);
  const extension = spec.structure.extension.enabled;
  const dimensions = [
    ["Closed-shell length / Lengde lukket del", mm(spec.dimensions.closedLengthMm)],
    ["Overall width / Bredde", mm(spec.dimensions.widthMm)],
    ["Overall height / Hoyde", mm(spec.dimensions.heightMm)],
    ["Stations / A-rammer", String(spec.structure.stations)],
    ["Bays / Fag", String(spec.structure.bays)]
  ];
  if (extension) dimensions.push(
    ["Extension length / Utvidelseslengde", mm(spec.dimensions.extensionLengthMm)],
    ["Total length / Total lengde", mm(totalLength)],
    ["Clear passage / Apen passasje", mm(spec.foundation.extension.passageLengthMm)],
    ["Extension anchor span / Forankringsspenn", mm(spec.foundation.extension.anchorSpanMm)]
  );
  const dimensionRows = dimensions.slice(0, 6).map((row, index) => valueRow(48, 128 + index * 25, row[0], row[1])).join("");
  const dimensionRows2 = dimensions.slice(6).map((row, index) => valueRow(350, 128 + index * 25, row[0], row[1], 235)).join("");
  const doors = doorSummary(spec).map((line, index) => text(48, 674 + index * 24, line, index === 3 ? "legend-green" : "legend-line")).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(spec.name)} dimensions and labels</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #d9dde0; font-family: Arial, Helvetica, sans-serif; }
    .sheet { display: block; width: min(100%, 1000px); height: 1410px; margin: 0 auto; background: #ffffff; }
    text { fill: ${INK}; font-size: 10px; font-weight: 400; }
    .sheet-border, .panel, .footer, .footer line { fill: none; stroke: ${INK}; stroke-width: 1; }
    .sheet-title { font-size: 18px; font-weight: 500; }
    .sheet-subtitle, .section-title { font-size: 13px; font-weight: 500; }
    .section-note, .row-label, .row-value, .legend-line, .legend-green { font-size: 9px; }
    .section-note, .layer-field-note, .layer-subtitle { fill: ${MUTED}; }
    .row-value, .table-cell { font-variant-numeric: tabular-nums; }
    .row-rule, .table-rule { stroke: ${GRID}; stroke-width: 0.8; }
    .table-head { font-size: 8px; font-weight: 500; }
    .table-id { font-size: 9px; font-weight: 500; }
    .table-cell { font-size: 8px; }
    .legend-green { fill: ${GREEN}; font-weight: 500; }
    .layer-field { fill: ${LIGHT}; fill-opacity: 0.24; stroke: ${INK}; stroke-width: 1.2; }
    .layer-window { fill: #ffffff; stroke: ${INK}; stroke-width: 1; }
    .layer-field-note, .layer-subtitle, .map-axis-label { font-size: 8px; }
    .layer-title { font-size: 9px; font-weight: 500; }
    .layer-number { fill: ${INK}; }
    .layer-number-text { fill: #ffffff; font-size: 9px; font-weight: 500; }
    .layer-ground { fill: #d7dade; stroke: none; }
    .layer-anchor-pad { fill: #e5e7e9; fill-opacity: 0.86; stroke: ${INK}; stroke-width: 0.8; }
    .layer-anchor-point { fill: ${INK}; }
    .layer-door { fill: none; stroke: ${emergencyColor}; stroke-width: 1.55; }
    .layer-door-divider { stroke-width: 0.9; stroke-dasharray: 2 2; }
    .layer-door-direction { stroke-width: 1.35; }
    .hide-emergency-doors .layer-emergency-doors { display: none; }
    .layer-insulation { fill: #e7c85b; fill-opacity: 0.72; stroke: none; }
    .layer-deck { fill: #b79869; stroke: none; }
    .layer-wood, .layer-blocking { stroke: #85613d; stroke-width: 5; }
    .layer-blocking { stroke-width: 3.4; }
    .layer-mesh { stroke: #7e888e; stroke-width: 0.65; }
    .layer-deck-line { stroke: #755a38; stroke-width: 0.75; }
    .layer-outline { fill: none; stroke: ${INK}; stroke-width: 1.4; }
    .layer-extension-divider { stroke: ${INK}; stroke-width: 1; stroke-dasharray: 5 4; }
    .footer-main { font-size: 10px; font-weight: 500; }
    .footer-small { font-size: 8px; }
    @media print {
      @page { size: A3 portrait; margin: 5mm; }
      body { background: #ffffff; }
      .sheet { width: 1000px; height: 1410px; }
    }
  </style>
</head>
<body>
  <svg class="sheet ${spec.presentation?.showEmergencyDoors === true ? "show-emergency-doors" : "hide-emergency-doors"}" width="1000" height="1410" viewBox="0 0 1000 1410" role="img" aria-labelledby="checkpoint-title checkpoint-desc">
    <title id="checkpoint-title">${esc(spec.name)} dimensions and labels checkpoint</title>
    <desc id="checkpoint-desc">Cross-check page generated from the same building specification as the coordinated drawing, with dimensions, labels, foundation coordinates and three simplified top-down construction layer states.</desc>
    <defs>
      <marker id="checkpoint-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill="${INK}" />
      </marker>
      <marker id="checkpoint-door-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill="${emergencyColor}" />
      </marker>
    </defs>
    <rect x="0" y="0" width="1000" height="1410" fill="#ffffff" />
    <rect class="sheet-border" x="20" y="18" width="960" height="1380" />
    ${text(500, 48, `${spec.name} - DIMENSIONS AND LABELS / MAL OG BETEGNELSER`, "sheet-title", 'text-anchor="middle"')}
    ${text(500, 68, "PAGE 2 - SPECIFICATION CROSS-CHECK / SPESIFIKASJONSKONTROLL", "section-note", 'text-anchor="middle"')}

    <rect class="panel" x="35" y="84" width="565" height="184" />
    ${text(48, 102, "AUTHORITATIVE DIMENSIONS / HOVEDMAL", "section-title")}
    ${dimensionRows}${dimensionRows2}

    <rect class="panel" x="615" y="84" width="350" height="184" />
    ${text(630, 102, "AXES AND DOCUMENT / AKSER OG DOKUMENT", "section-title")}
    ${valueRow(630, 126, "X", "Length / Lengde", 310)}
    ${valueRow(630, 151, "Y", "Width / Bredde", 310)}
    ${valueRow(630, 176, "Z", "Height / Hoyde", 310)}
    ${valueRow(630, 211, "Drawing / Tegning", spec.drawingNumber, 310)}
    ${valueRow(630, 236, "Revision / Revisjon", `${spec.revision} - ${spec.status}`, 310)}

    <rect class="panel" x="35" y="282" width="930" height="324" />
    ${text(48, 304, "FOUNDATION COORDINATE SCHEDULE / FORANKRINGSKOORDINATER", "section-title")}
    ${text(952, 304, "Origin: closed-shell start gable, left rail, foundation level (0,0,0)", "section-note", 'text-anchor="end"')}
    ${anchorTable(schedule)}
    ${text(48, 584, "Coordinates are anchor centres. Size order is X/Y/Z. Z=0 is foundation level; depth extends downward.", "section-note")}
    ${text(952, 584, `Concrete anchor count / Antall betongankre: ${schedule.anchors.length}`, "section-note", 'text-anchor="end"')}

    <rect class="panel" x="35" y="620" width="930" height="180" />
    ${text(48, 646, "LABELS AND STRUCTURAL CONVENTIONS / BETEGNELSER OG KONVENSJONER", "section-title")}
    ${doors}
    ${text(520, 674, "Black dots: structural joints / Sorte prikker: knutepunkter", "legend-line")}
    ${text(520, 698, "Grey blocks: concrete anchors / Gra blokker: betongankre", "legend-line")}
    ${text(520, 722, bracingSummary(spec), "legend-line")}
    ${text(520, 746, "Near/far, solid/dashed and door IDs match page 1 / Symbolbruk og ID-er samsvarer med side 1", "legend-line")}
    ${text(520, 770, "All reconstructed dimensions remain provisional until verified on site.", "section-note")}

    ${topDownLayerField(spec)}

    <g class="footer">
      <rect x="35" y="1340" width="930" height="46" />
      <line x1="390" y1="1340" x2="390" y2="1386" />
      <line x1="720" y1="1340" x2="720" y2="1386" />
      <line x1="855" y1="1340" x2="855" y2="1386" />
      ${text(48, 1359, `${spec.name} - DIMENSIONS / LABELS`, "footer-main")}
      ${text(48, 1377, "PAGE 2 OF 2 / SIDE 2 AV 2", "footer-small")}
      ${text(405, 1359, "SAME SPECIFICATION SOURCE AS PAGE 1", "footer-small")}
      ${text(405, 1377, "CROSS-CHECK BEFORE ISSUE / KONTROLLER FOR UTGIVELSE", "footer-small")}
      ${text(735, 1359, "SCALE / MALESTOKK", "footer-small")}
      ${text(735, 1377, "SCHEDULE: NTS", "footer-small")}
      ${text(870, 1359, "DRAWING / TEGNING", "footer-small")}
      ${text(870, 1377, `${spec.drawingNumber} - ${spec.revision}`, "footer-small")}
    </g>
  </svg>
</body>
</html>`;
}
