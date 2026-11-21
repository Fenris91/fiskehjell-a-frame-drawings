// The top-down site map, drawn from the site model and nothing else: move a
// structure in src/site-model.mjs and the map follows.
//
// Opened in a browser the page is also a layout editor: drag structures and
// perimeter corners, rotate, add, remove, and copy the result back into the model.
// Opened as site-map.html#static (the exporter does this) it is only the drawing.
import { siteModel, validateSiteModel } from "./site-model.mjs";

const WIDTH = 1400;
const HEIGHT = 1260;
const MARGIN = { left: 90, right: 90, top: 70, bottom: 150 };

// ---------------------------------------------------------------------------
// Shared with the page. These functions are written into the page with
// toString(), so each may use only its arguments and the other functions here.
// ---------------------------------------------------------------------------
function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// Footprint corners as [east, north]. A rectangle's corners 0-1 and 2-3 are its
// two ends. A structure may instead give `outline`, its own corners as
// [across, along] metres from its centre, or `round: true` for a circle whose
// diameter is its width. Outlines must bulge outward everywhere (be convex).
function cornersOf(structure) {
  const radians = structure.angleDeg * Math.PI / 180;
  const across = [Math.cos(radians), -Math.sin(radians)];
  const along = [Math.sin(radians), Math.cos(radians)];
  const local = structure.round
    ? Array.from({ length: 24 }, (_, index) => [Math.cos(index / 24 * 2 * Math.PI) * structure.width / 2, Math.sin(index / 24 * 2 * Math.PI) * structure.width / 2])
    : structure.outline ?? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([w, l]) => [w * structure.width / 2, l * structure.length / 2]);
  return local.map(([w, l]) => [
    structure.east + across[0] * w + along[0] * l,
    structure.north + across[1] * w + along[1] * l
  ]);
}

// East grows right, north grows up.
function toScreen(view, east, north) {
  const round = (value) => Math.round(value * 10) / 10;
  return [round(view.offsetX + (east - view.e0) * view.scale), round(view.offsetY + (view.n1 - north) * view.scale)];
}

function insidePolygon(point, polygon) {
  let inside = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    const within = point[0] >= Math.min(a[0], b[0]) - 0.03 && point[0] <= Math.max(a[0], b[0]) + 0.03 &&
      point[1] >= Math.min(a[1], b[1]) - 0.03 && point[1] <= Math.max(a[1], b[1]) + 0.03;
    if (Math.abs(cross) < 0.03 && within) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// Two convex footprints at any angle: they overlap unless some edge direction separates them.
function footprintsOverlap(first, second) {
  const a = cornersOf(first), b = cornersOf(second);
  for (const corners of [a, b]) {
    for (let index = 0; index < corners.length; index += 1) {
      const next = corners[(index + 1) % corners.length];
      const edge = [next[0] - corners[index][0], next[1] - corners[index][1]];
      const axis = [-edge[1], edge[0]];
      const span = (points) => points.map(([e, n]) => e * axis[0] + n * axis[1]);
      const pa = span(a), pb = span(b);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
    }
  }
  return true;
}

// The drawing of one structure: footprint, ridge for an A-frame, name and size.
function structureMarkup(structure, view) {
  const number = (value) => Math.round(value * 10) / 10;
  const corners = cornersOf(structure);
  const points = corners.map(([east, north]) => toScreen(view, east, north).join(",")).join(" ");
  const [cx, cy] = toScreen(view, structure.east, structure.north);
  const radians = structure.angleDeg * Math.PI / 180;
  // Text runs along the longer side, and never upside down.
  const direction = structure.length >= structure.width
    ? [Math.sin(radians), -Math.cos(radians)]
    : [Math.cos(radians), Math.sin(radians)];
  let turn = Math.round(Math.atan2(direction[1], direction[0]) * 1800 / Math.PI) / 10;
  if (turn > 90) turn -= 180;
  if (turn < -90) turn += 180;
  const rotate = turn === 0 || structure.round ? "" : ` transform="rotate(${turn} ${cx} ${cy})"`;
  const room = Math.max(structure.width, structure.length) * view.scale;
  const narrow = Math.min(structure.width, structure.length) * view.scale;
  const lines = narrow < 70
    ? [structure.name]
    : [structure.name, `${number(structure.width)} × ${number(structure.length)} m`];
  // A long name in a small footprint gets smaller type, never squeezed letters.
  const label = lines.map((line, index) => {
    const base = index === 0 ? 16 : 13;
    const fitted = Math.max(7, Math.min(base, Math.floor((room - 14) / (line.length * 0.55))));
    const style = fitted < base ? ` style="font-size:${fitted}px"` : "";
    const y = number(cy + (index - (lines.length - 1) / 2) * 20 + 5);
    return `<text class="structure-${index === 0 ? "name" : "size"}" x="${cx}" y="${y}" text-anchor="middle"${rotate}${style}>${escapeText(line)}</text>`;
  });
  let ridge = "";
  if (structure.category === "aframe" && !structure.outline && !structure.round) {
    const start = toScreen(view, (corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2);
    const end = toScreen(view, (corners[2][0] + corners[3][0]) / 2, (corners[2][1] + corners[3][1]) / 2);
    ridge = `<line class="ridge" x1="${start[0]}" y1="${start[1]}" x2="${end[0]}" y2="${end[1]}"/>`;
  }
  const title = escapeText(structure.name) + (structure.role ? ` — ${escapeText(structure.role)}` : "");
  return `<polygon class="structure structure-${escapeText(structure.category)}" points="${points}"><title>${title}</title></polygon>${ridge}${label.join("")}`;
}

// The editor. It runs in the page; `shared` are the functions above.
function startEditor() {
  if (location.hash === "#static") return;
  const data = JSON.parse(document.getElementById("site-data").textContent);
  const view = data.view;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  let structures = clone(data.structures);
  let perimeter = clone(data.perimeter);
  let selected = null;
  let drag = null;
  let added = 0;

  const svg = document.querySelector("svg.site-map");
  const layer = svg.querySelector('[data-layer="structures"]');
  const perimeterShape = svg.querySelector(".perimeter");
  const handles = document.createElementNS("http://www.w3.org/2000/svg", "g");
  handles.setAttribute("data-layer", "handles");
  svg.querySelector('[data-layer="exits"]').after(handles);

  const bar = document.createElement("div");
  bar.className = "editor";
  bar.innerHTML = `
    <span class="editor-title">Layout editor</span>
    <button type="button" data-action="rotate" data-by="-15" title="Rotate the selected structure (key: [)">⟲ 15°</button>
    <button type="button" data-action="rotate" data-by="15" title="Rotate the selected structure (key: ])">⟳ 15°</button>
    <button type="button" data-action="add" data-category="mobile">+ Container</button>
    <button type="button" data-action="add" data-category="service">+ Service unit</button>
    <button type="button" data-action="add" data-category="permanent" data-shape="round">+ Round</button>
    <button type="button" data-action="add" data-category="permanent" data-shape="outline">+ Angled</button>
    <button type="button" data-action="remove">Remove</button>
    <button type="button" data-action="reset">Reset</button>
    <button type="button" data-action="copy">Copy layout</button>
    <span class="editor-readout" aria-live="polite"></span>
    <span class="editor-status" aria-live="polite"></span>
    <textarea class="editor-output" rows="6" readonly hidden aria-label="Layout to paste into src/site-model.mjs"></textarea>`;
  document.body.insertBefore(bar, document.body.firstChild);
  const readout = bar.querySelector(".editor-readout");
  const status = bar.querySelector(".editor-status");
  const output = bar.querySelector(".editor-output");
  document.body.classList.add("editing");

  const snap = (value) => Math.round(value * 2) / 2;
  const svgPoint = (event) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const at = point.matrixTransform(svg.getScreenCTM().inverse());
    return [view.e0 + (at.x - view.offsetX) / view.scale, view.n1 - (at.y - view.offsetY) / view.scale];
  };
  const find = (id) => structures.find((structure) => structure.id === id);

  function problems() {
    const polygon = perimeter.map(({ east, north }) => [east, north]);
    const found = new Map();
    const note = (id, text) => found.set(id, [...(found.get(id) ?? []), text]);
    for (const structure of structures) {
      if (!cornersOf(structure).every((corner) => insidePolygon(corner, polygon))) note(structure.id, "outside the perimeter");
    }
    for (let i = 0; i < structures.length; i += 1) {
      for (let j = i + 1; j < structures.length; j += 1) {
        if (footprintsOverlap(structures[i], structures[j])) {
          note(structures[i].id, `overlaps ${structures[j].name}`);
          note(structures[j].id, `overlaps ${structures[i].name}`);
        }
      }
    }
    return found;
  }

  function render() {
    const found = problems();
    layer.innerHTML = structures.map((structure) =>
      `<g data-structure="${escapeText(structure.id)}" data-category="${escapeText(structure.category)}" class="${structure.id === selected ? "selected" : ""}${found.has(structure.id) ? " problem" : ""}">${structureMarkup(structure, view)}</g>`).join("");
    perimeterShape.setAttribute("points", perimeter.map(({ east, north }) => toScreen(view, east, north).join(",")).join(" "));
    handles.innerHTML = perimeter.map(({ east, north }, index) => {
      const [x, y] = toScreen(view, east, north);
      return `<circle class="handle" data-vertex="${index}" cx="${x}" cy="${y}" r="9"><title>Drag to move this corner of the perimeter</title></circle>`;
    }).join("");
    const current = find(selected);
    readout.textContent = current
      ? `${current.name}: E ${current.east} · N ${current.north} · ${current.angleDeg}°`
      : "Select a structure to move or rotate it.";
    status.textContent = found.size
      ? [...found].map(([id, notes]) => `${find(id).name} ${[...new Set(notes)].join(", ")}`).join(" · ")
      : "Layout is valid.";
    status.classList.toggle("bad", found.size > 0);
    svg.dataset.problems = String(found.size);
  }

  function layoutText() {
    const line = (item) => "    { " + Object.entries(item).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ") + " }";
    return `  structures: [\n${structures.map(line).join(",\n")}\n  ],\n  perimeter: [\n${perimeter.map(line).join(",\n")}\n  ],`;
  }

  svg.addEventListener("pointerdown", (event) => {
    const vertex = event.target.closest?.("[data-vertex]");
    const group = event.target.closest?.("[data-structure]");
    if (vertex) {
      drag = { vertex: Number(vertex.dataset.vertex) };
    } else if (group) {
      selected = group.dataset.structure;
      const structure = find(selected), at = svgPoint(event);
      drag = { id: selected, offset: [structure.east - at[0], structure.north - at[1]] };
    } else {
      selected = null;
    }
    if (drag) { svg.setPointerCapture(event.pointerId); event.preventDefault(); }
    render();
  });
  svg.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const at = svgPoint(event);
    if (drag.vertex !== undefined) {
      perimeter[drag.vertex].east = snap(at[0]); perimeter[drag.vertex].north = snap(at[1]);
    } else {
      const structure = find(drag.id);
      structure.east = snap(at[0] + drag.offset[0]); structure.north = snap(at[1] + drag.offset[1]);
    }
    render();
  });
  const stop = () => { drag = null; };
  svg.addEventListener("pointerup", stop);
  svg.addEventListener("pointercancel", stop);

  const rotate = (by) => {
    const structure = find(selected);
    if (!structure) return;
    structure.angleDeg = ((structure.angleDeg + by + 180) % 360 + 360) % 360 - 180;
    render();
  };
  bar.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "rotate") rotate(Number(button.dataset.by));
    if (action === "add") {
      added += 1;
      const mobile = button.dataset.category === "mobile", shape = button.dataset.shape;
      const kind = shape === "round" ? ["round", "Round"] : shape === "outline" ? ["angled", "Angled"] : mobile ? ["container", "Container"] : ["service-unit", "Service unit"];
      const structure = { id: `${kind[0]}-new-${added}`, name: `${kind[1]} ${added}`,
        category: button.dataset.category, east: snap((view.e0 + view.e1) / 2), north: snap((view.n0 + view.n1) / 2),
        width: shape ? 6 : mobile ? 2.5 : 6, length: shape === "outline" ? 9 : shape ? 6 : mobile ? 6 : 4, height: 3, angleDeg: 0, dimensionStatus: "approximate" };
      if (shape === "round") structure.round = true;
      // One corner cut off at an angle, as [across, along] metres from the centre.
      if (shape === "outline") structure.outline = [[-3, -4.5], [3, -4.5], [3, 4.5], [0, 4.5], [-3, 1.5]];
      structures.push(structure); selected = structure.id; render();
    }
    if (action === "remove" && selected && selected !== data.origin) {
      structures = structures.filter((structure) => structure.id !== selected); selected = null; render();
    }
    if (action === "reset") { structures = clone(data.structures); perimeter = clone(data.perimeter); selected = null; output.hidden = true; render(); }
    if (action === "copy") {
      output.value = layoutText(); output.hidden = false; output.select();
      navigator.clipboard?.writeText(output.value).catch(() => {});
    }
  });
  document.addEventListener("keydown", (event) => {
    const structure = find(selected);
    if (!structure || event.target.closest("textarea")) return;
    const step = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, 0.5], ArrowDown: [0, -0.5] }[event.key];
    if (step) { structure.east = snap(structure.east + step[0]); structure.north = snap(structure.north + step[1]); event.preventDefault(); render(); }
    if (event.key === "[") rotate(-15);
    if (event.key === "]") rotate(15);
  });
  render();
}
// ---------------------------------------------------------------------------

const SHARED = [escapeText, cornersOf, toScreen, insidePolygon, footprintsOverlap, structureMarkup, startEditor];

function bounds(model) {
  const points = [
    ...model.perimeter.map(({ east, north }) => [east, north]),
    ...Object.values(model.context ?? {}).flatMap((item) => item.points)
  ];
  const east = points.map(([value]) => value);
  const north = points.map(([, value]) => value);
  return { e0: Math.min(...east), e1: Math.max(...east), n0: Math.min(...north), n1: Math.max(...north) };
}

export function siteMapView(model = siteModel) {
  const box = bounds(model);
  const scale = Math.min(
    (WIDTH - MARGIN.left - MARGIN.right) / (box.e1 - box.e0),
    (HEIGHT - MARGIN.top - MARGIN.bottom) / (box.n1 - box.n0)
  );
  return {
    ...box,
    scale,
    offsetX: MARGIN.left + ((WIDTH - MARGIN.left - MARGIN.right) - (box.e1 - box.e0) * scale) / 2,
    offsetY: MARGIN.top + ((HEIGHT - MARGIN.top - MARGIN.bottom) - (box.n1 - box.n0) * scale) / 2
  };
}

export { cornersOf, footprintsOverlap, structureMarkup };

export function renderSiteMap(model = siteModel) {
  const errors = validateSiteModel(model);
  if (errors.length > 0) throw new Error(`Invalid site model:\n- ${errors.join("\n- ")}`);

  const view = siteMapView(model);
  const esc = escapeText;
  const n = (value) => Number(value.toFixed(1));
  const px = (east) => toScreen(view, east, 0)[0];
  const py = (north) => toScreen(view, 0, north)[1];
  const path = (points) => points.map(([east, north]) => toScreen(view, east, north).join(",")).join(" ");

  const grid = [];
  for (let east = Math.ceil(view.e0 / 10) * 10; east <= view.e1; east += 10) {
    grid.push(`<line class="grid" x1="${px(east)}" y1="${py(view.n1)}" x2="${px(east)}" y2="${py(view.n0)}"/>`);
    grid.push(`<text class="grid-label" x="${px(east)}" y="${py(view.n0) + 18}" text-anchor="middle">E ${east}</text>`);
  }
  for (let north = Math.ceil(view.n0 / 10) * 10; north <= view.n1; north += 10) {
    grid.push(`<line class="grid" x1="${px(view.e0)}" y1="${py(north)}" x2="${px(view.e1)}" y2="${py(north)}"/>`);
    grid.push(`<text class="grid-label" x="${px(view.e0) - 8}" y="${py(north) + 4}" text-anchor="end">N ${north}</text>`);
  }

  const context = Object.entries(model.context ?? {}).map(([kind, item]) => {
    const [east, north] = item.points[Math.floor(item.points.length / 2)];
    return `<polyline class="context context-${esc(kind)}" points="${path(item.points)}"/>
    <text class="context-label" x="${px(east)}" y="${py(north) - 12}" text-anchor="middle">${esc(item.name.toUpperCase())}</text>`;
  });

  const zones = model.zones.map((zone) =>
    `<polygon class="zone zone-${esc(zone.kind)}" data-zone="${esc(zone.id)}" points="${path(zone.points)}"/>`);

  const structures = model.structures.map((structure) =>
    `<g data-structure="${esc(structure.id)}" data-category="${esc(structure.category)}">${structureMarkup(structure, view)}</g>`);

  const exits = model.exits.map((exit, index) => {
    const key = String.fromCharCode(65 + index);
    return `<g data-exit="${esc(exit.id)}">
      <circle class="exit" cx="${px(exit.east)}" cy="${py(exit.north)}" r="13"/>
      <text class="exit-key" x="${px(exit.east)}" y="${py(exit.north) + 5}" text-anchor="middle">${key}</text>
    </g>`;
  });

  const legendY = HEIGHT - 96;
  const swatches = [
    ["structure structure-aframe", "A-FRAME"],
    ["structure structure-permanent", "PERMANENT"],
    ["structure structure-service", "SERVICE"],
    ["structure structure-mobile", "MOBILE"],
    ["zone zone-outdoor", "YARD"],
    ["zone zone-dock", "WATERFRONT"],
    ["zone zone-circulation", "PUBLIC LOOP"]
  ].map(([className, label], index) =>
    `<g transform="translate(${90 + index * 178} ${legendY})"><rect class="${className}" x="0" y="-11" width="30" height="20"/><text class="legend-label" x="40" y="5">${label}</text></g>`);
  const exitKey = model.exits.map((exit, index) =>
    `<text class="legend-label" x="${90 + index * 315}" y="${legendY + 44}"><tspan class="exit-key-inline">${String.fromCharCode(65 + index)}</tspan>  ${esc(exit.name)}</text>`);

  const barMetres = 20;
  const barX = WIDTH - MARGIN.right - barMetres * view.scale;
  const barY = MARGIN.top - 26;

  // "<" is escaped so the data can never close its own script element.
  const data = JSON.stringify({
    view,
    origin: model.coordinateSystem.originStructureId,
    structures: model.structures,
    perimeter: model.perimeter.map(({ east, north }) => ({ east, north }))
  }).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Example site map</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #ffffff; font-family: Arial, Helvetica, sans-serif; }
    .site-map { display: block; width: min(100%, ${WIDTH}px); height: auto; margin: 0 auto; background: #ffffff; touch-action: none; }
    text { fill: #111111; font-size: 15px; pointer-events: none; user-select: none; }
    .grid { stroke: #dfe3e6; stroke-width: 1; }
    .grid-label, .context-label, .legend-label { font-size: 13px; fill: #5d646a; }
    .context { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .context-road { stroke: #8b9197; stroke-width: 16; }
    .context-water { stroke: #9cc3e6; stroke-width: 20; }
    .perimeter { fill: #f7f4ef; stroke: #d9682b; stroke-width: 5; stroke-linejoin: round; }
    .zone { stroke: none; pointer-events: none; }
    .zone-outdoor { fill: #cfe3c4; fill-opacity: .7; }
    .zone-dock { fill: #c9dff2; fill-opacity: .6; }
    .zone-circulation { fill: none; stroke: #7a8088; stroke-width: 4; stroke-dasharray: 14 9; stroke-linejoin: round; }
    .structure { stroke: #111111; stroke-width: 3; stroke-linejoin: miter; }
    .structure-aframe { fill: #ffffff; }
    .structure-permanent { fill: #d8dde1; }
    .structure-service { fill: #f0e3c4; }
    .structure-mobile { fill: #e9d2d2; }
    .ridge { stroke: #111111; stroke-width: 1.5; stroke-dasharray: 8 6; pointer-events: none; }
    .structure-name { font-size: 16px; font-weight: 700; }
    .structure-size { font-size: 13px; }
    /* A halo in the footprint colour keeps the name readable over the ridge line. */
    .structure-name, .structure-size { paint-order: stroke; stroke: #ffffff; stroke-width: 5px; stroke-linejoin: round; }
    [data-category="permanent"] text { stroke: #d8dde1; }
    [data-category="service"] text { stroke: #f0e3c4; }
    [data-category="mobile"] text { stroke: #e9d2d2; }
    .exit { fill: #ffffff; stroke: #1a7f4b; stroke-width: 4; }
    .exit-key, .exit-key-inline { font-size: 14px; font-weight: 700; fill: #1a7f4b; }
    .title { font-size: 22px; font-weight: 700; }
    .note { font-size: 13px; fill: #5d646a; }
    .scale-bar { stroke: #111111; stroke-width: 3; }
    .north line { stroke: #111111; stroke-width: 3; }
    /* Editor: present only when the page's script has started it. */
    .editing [data-structure] { cursor: grab; }
    .editing [data-structure].selected .structure { stroke: #1f5fbf; stroke-width: 5; }
    .editing [data-structure].problem .structure { stroke: #c02626; stroke-dasharray: 10 6; }
    .handle { fill: #ffffff; stroke: #d9682b; stroke-width: 3; cursor: move; }
    .editor { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; max-width: ${WIDTH}px; margin: 0 auto; padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #dfe3e6; }
    .editor-title { font-weight: 700; margin-right: 6px; }
    .editor button { font: inherit; padding: 5px 10px; border: 1px solid #8b9197; border-radius: 4px; background: #ffffff; cursor: pointer; }
    .editor button:hover { background: #eef2f4; }
    .editor-readout { margin-left: 6px; }
    .editor-status { color: #1a7f4b; }
    .editor-status.bad { color: #c02626; font-weight: 700; }
    .editor-output { flex-basis: 100%; width: 100%; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; }
    @media print { .editor, [data-layer="handles"] { display: none; } }
  </style>
</head>
<body>
  <svg class="site-map" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="site-map-title site-map-desc">
    <title id="site-map-title">Example site map</title>
    <desc id="site-map-desc">An invented example layout drawn from the site model: ${model.structures.length} structures inside a ${n(view.e1 - view.e0)} by ${n(view.n1 - view.n0)} metre drawing area.</desc>
    <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
    <text class="title" x="${MARGIN.left}" y="42">EXAMPLE SITE · TOP DOWN / OVERSIKTSKART</text>
    <g aria-label="Scale bar">
      <line class="scale-bar" x1="${n(barX)}" y1="${barY}" x2="${n(barX + barMetres * view.scale)}" y2="${barY}"/>
      <text class="note" x="${n(barX + barMetres * view.scale / 2)}" y="${barY - 8}" text-anchor="middle">${barMetres} m</text>
    </g>
    <g aria-label="Grid, 10 metre squares">${grid.join("")}</g>
    <g aria-label="Surroundings">${context.join("")}</g>
    <polygon class="perimeter" points="${path(model.perimeter.map(({ east, north }) => [east, north]))}"/>
    <g aria-label="Zones">${zones.join("")}</g>
    <g data-layer="structures" aria-label="Structures">
    ${structures.join("\n    ")}
    </g>
    <g data-layer="exits" aria-label="Entrances and exits">${exits.join("")}</g>
    <g class="north" aria-label="North" transform="translate(${MARGIN.left - 46} ${MARGIN.top + 60})">
      <line x1="0" y1="34" x2="0" y2="-20"/><path d="M0 -34 L9 -16 L-9 -16 Z" fill="#111111"/><text x="-6" y="-42">N</text>
    </g>
    <g aria-label="Legend">${swatches.join("")}${exitKey.join("")}</g>
    <text class="note" x="${MARGIN.left}" y="${HEIGHT - 16}">INVENTED EXAMPLE LAYOUT · NOT SURVEYED · METRES FROM THE CENTRE OF THE HALL</text>
  </svg>
  <script type="application/json" id="site-data">${data}</script>
  <script>
${SHARED.map((fn) => fn.toString()).join("\n")}
startEditor();
  </script>
</body>
</html>
`;
}
