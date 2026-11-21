// The top-down site map, drawn from the site model and nothing else: move a
// structure in src/site-model.mjs and the map follows.
import { siteModel, structureCorners, validateSiteModel } from "./site-model.mjs";

const WIDTH = 1400;
const HEIGHT = 1260;
const MARGIN = { left: 90, right: 90, top: 70, bottom: 150 };

const esc = (value) => String(value)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const n = (value) => Number(value.toFixed(1));

function bounds(model) {
  const points = [
    ...model.perimeter.map(({ east, north }) => [east, north]),
    ...Object.values(model.context ?? {}).flatMap((item) => item.points)
  ];
  const east = points.map(([value]) => value);
  const north = points.map(([, value]) => value);
  return { e0: Math.min(...east), e1: Math.max(...east), n0: Math.min(...north), n1: Math.max(...north) };
}

export function renderSiteMap(model = siteModel) {
  const errors = validateSiteModel(model);
  if (errors.length > 0) throw new Error(`Invalid site model:\n- ${errors.join("\n- ")}`);

  const box = bounds(model);
  const scale = Math.min(
    (WIDTH - MARGIN.left - MARGIN.right) / (box.e1 - box.e0),
    (HEIGHT - MARGIN.top - MARGIN.bottom) / (box.n1 - box.n0)
  );
  const offsetX = MARGIN.left + ((WIDTH - MARGIN.left - MARGIN.right) - (box.e1 - box.e0) * scale) / 2;
  const offsetY = MARGIN.top + ((HEIGHT - MARGIN.top - MARGIN.bottom) - (box.n1 - box.n0) * scale) / 2;
  // East grows right, north grows up.
  const px = (east) => n(offsetX + (east - box.e0) * scale);
  const py = (north) => n(offsetY + (box.n1 - north) * scale);
  const path = (points) => points.map(([east, north]) => `${px(east)},${py(north)}`).join(" ");

  const grid = [];
  for (let east = Math.ceil(box.e0 / 10) * 10; east <= box.e1; east += 10) {
    grid.push(`<line class="grid" x1="${px(east)}" y1="${py(box.n1)}" x2="${px(east)}" y2="${py(box.n0)}"/>`);
    grid.push(`<text class="grid-label" x="${px(east)}" y="${py(box.n0) + 18}" text-anchor="middle">E ${east}</text>`);
  }
  for (let north = Math.ceil(box.n0 / 10) * 10; north <= box.n1; north += 10) {
    grid.push(`<line class="grid" x1="${px(box.e0)}" y1="${py(north)}" x2="${px(box.e1)}" y2="${py(north)}"/>`);
    grid.push(`<text class="grid-label" x="${px(box.e0) - 8}" y="${py(north) + 4}" text-anchor="end">N ${north}</text>`);
  }

  const context = Object.entries(model.context ?? {}).map(([kind, item]) => {
    const [east, north] = item.points[Math.floor(item.points.length / 2)];
    return `<polyline class="context context-${esc(kind)}" points="${path(item.points)}"/>
    <text class="context-label" x="${px(east)}" y="${py(north) - 12}" text-anchor="middle">${esc(item.name.toUpperCase())}</text>`;
  });

  const zones = model.zones.map((zone) =>
    `<polygon class="zone zone-${esc(zone.kind)}" data-zone="${esc(zone.id)}" points="${path(zone.points)}"/>`);

  const structures = model.structures.map((structure) => {
    const corners = structureCorners(structure).map(({ east, north }) => [east, north]);
    const alongEastWest = Math.abs(Math.sin(structure.angleDeg * Math.PI / 180)) > 0.7;
    const spanAcross = (alongEastWest ? structure.width : structure.length) * scale;
    const spanAlong = (alongEastWest ? structure.length : structure.width) * scale;
    // Text runs along the longer side so it stays inside the footprint.
    const rotate = spanAcross > spanAlong ? ` transform="rotate(-90 ${px(structure.east)} ${py(structure.north)})"` : "";
    const room = Math.max(spanAcross, spanAlong);
    const size = `${n(structure.width)} × ${n(structure.length)} m`;
    const small = Math.min(spanAcross, spanAlong) < 70;
    const lines = small ? [structure.name] : [structure.name, size];
    // A long name in a small footprint gets smaller type, never squeezed letters.
    const label = lines.map((line, index) => {
      const base = index === 0 ? 16 : 13;
      const fitted = Math.min(base, Math.floor((room - 14) / (line.length * 0.55)));
      const style = fitted < base ? ` style="font-size:${fitted}px"` : "";
      return `<text class="structure-${index === 0 ? "name" : "size"}" x="${px(structure.east)}" y="${n(py(structure.north) + (index - (lines.length - 1) / 2) * 20 + 5)}" text-anchor="middle"${rotate}${style}>${esc(line)}</text>`;
    });
    // The ridge of an A-frame, so its direction reads at a glance.
    const axis = structure.category === "aframe"
      ? (() => {
          const [a, b, c, d] = corners;
          const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
          const start = mid(a, b), end = mid(c, d);
          return `<line class="ridge" x1="${px(start[0])}" y1="${py(start[1])}" x2="${px(end[0])}" y2="${py(end[1])}"/>`;
        })()
      : "";
    return `<g data-structure="${esc(structure.id)}" data-category="${esc(structure.category)}">
      <polygon class="structure structure-${esc(structure.category)}" points="${path(corners)}"><title>${esc(structure.name)}${structure.role ? ` — ${esc(structure.role)}` : ""}</title></polygon>
      ${axis}
      ${label.join("\n      ")}
    </g>`;
  });

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
  const barX = WIDTH - MARGIN.right - barMetres * scale;
  const barY = MARGIN.top - 26;

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
    .site-map { display: block; width: min(100%, ${WIDTH}px); height: auto; margin: 0 auto; background: #ffffff; }
    text { fill: #111111; font-size: 15px; }
    .grid { stroke: #dfe3e6; stroke-width: 1; }
    .grid-label, .context-label, .legend-label { font-size: 13px; fill: #5d646a; }
    .context { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .context-road { stroke: #8b9197; stroke-width: 16; }
    .context-water { stroke: #9cc3e6; stroke-width: 20; }
    .perimeter { fill: #f7f4ef; stroke: #d9682b; stroke-width: 5; stroke-linejoin: round; }
    .zone { stroke: none; }
    .zone-outdoor { fill: #cfe3c4; fill-opacity: .7; }
    .zone-dock { fill: #c9dff2; fill-opacity: .6; }
    .zone-circulation { fill: none; stroke: #7a8088; stroke-width: 4; stroke-dasharray: 14 9; stroke-linejoin: round; }
    .structure { stroke: #111111; stroke-width: 3; stroke-linejoin: miter; }
    .structure-aframe { fill: #ffffff; }
    .structure-permanent { fill: #d8dde1; }
    .structure-service { fill: #f0e3c4; }
    .structure-mobile { fill: #e9d2d2; }
    .ridge { stroke: #111111; stroke-width: 1.5; stroke-dasharray: 8 6; }
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
  </style>
</head>
<body>
  <svg class="site-map" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="site-map-title site-map-desc">
    <title id="site-map-title">Example site map</title>
    <desc id="site-map-desc">An invented example layout drawn from the site model: ${model.structures.length} structures inside a ${n(box.e1 - box.e0)} by ${n(box.n1 - box.n0)} metre drawing area.</desc>
    <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
    <text class="title" x="${MARGIN.left}" y="42">EXAMPLE SITE · TOP DOWN / OVERSIKTSKART</text>
    <g aria-label="Scale bar">
      <line class="scale-bar" x1="${n(barX)}" y1="${barY}" x2="${n(barX + barMetres * scale)}" y2="${barY}"/>
      <text class="note" x="${n(barX + barMetres * scale / 2)}" y="${barY - 8}" text-anchor="middle">${barMetres} m</text>
    </g>
    <g aria-label="Grid, 10 metre squares">${grid.join("")}</g>
    <g aria-label="Surroundings">${context.join("")}</g>
    <polygon class="perimeter" points="${path(model.perimeter.map(({ east, north }) => [east, north]))}"/>
    <g aria-label="Zones">${zones.join("")}</g>
    <g aria-label="Structures">
    ${structures.join("\n    ")}
    </g>
    <g aria-label="Entrances and exits">${exits.join("")}</g>
    <g class="north" aria-label="North" transform="translate(${MARGIN.left - 46} ${MARGIN.top + 60})">
      <line x1="0" y1="34" x2="0" y2="-20"/><path d="M0 -34 L9 -16 L-9 -16 Z" fill="#111111"/><text x="-6" y="-42">N</text>
    </g>
    <g aria-label="Legend">${swatches.join("")}${exitKey.join("")}</g>
    <text class="note" x="${MARGIN.left}" y="${HEIGHT - 16}">INVENTED EXAMPLE LAYOUT · NOT SURVEYED · METRES FROM THE CENTRE OF THE HALL</text>
  </svg>
</body>
</html>
`;
}
