# Fiskehjell A-frame drawings

A data-driven sheet generator for A-frame buildings in the style of the
Norwegian *fiskehjell*, the timber rack used to dry stockfish. One building
specification controls the top-down, A-frame, side and 3D views, so dimensions,
stations, doors, anchors and bracing cannot silently drift between views.

The four buildings and the site layout in this repository are **examples**.
Every dimension is provisional. Nothing here is an engineering or contractor
drawing, and nothing may be built from it without independent verification.

| Hall | Shell 8 | Example site |
| --- | --- | --- |
| ![Hall drawing sheet](docs/samples/hall.png) | ![Shell 8 drawing sheet](docs/samples/shell8.png) | ![Example site map](docs/samples/site-map.png) |

## Example buildings

| Id | Name | What it shows |
| --- | --- | --- |
| `hall` | Hall | 12 × 27 m, 13 frames, eight main anchors, an open four-frame extension and a clear pedestrian passage |
| `shell6` | Shell 6 | Six-frame closed shell, four corner anchors, one full-span wire cross on each long wall |
| `shell6d` | Shell 6D | The six-frame shell with two opposed internal doors and one gable-end exit |
| `shell8` | Shell 8 | Eight-frame closed shell, six anchors, one full-height wire cross on each long wall |

## Generate and verify

Requirements: Node 22 or newer for the drawings; Python 3 with `reportlab`,
`pypdf` and `pillow`, plus a browser, for PNG and PDF export. The browser is
Chrome, Chromium or Edge, or Firefox together with `geckodriver`.

```sh
npm test
npm run build
python scripts/export.py
```

`npm run build` writes one drawing sheet and one checkpoint sheet per building
to `dist/`, and the machine-readable data to `output/data/`. Open
`dist/hall.html` in a browser, or print it to an A3 PDF.

`python scripts/export.py` writes:

- one 3000 × 4230 PNG per building to `output/png/`;
- one two-page A3 PDF per building to `output/pdf/<building>.pdf`: the
  coordinated drawing, then a checkpoint page with dimensions, labels and
  foundation coordinates;
- `output/pdf/a-frame-buildings.pdf`, the combined set: four drawings, the site
  map, the specification register and four checkpoint pages;
- `output/pdf/a-frame-buildings-no-overview.pdf`, the same set without the site
  map.

The exporter finds a browser on the `PATH` or in the usual install locations,
and prefers Chrome, Chromium or Edge. `--browser firefox` or `--browser chrome`
chooses one; `CHROME_PATH` points at a Chrome-family executable explicitly.
Both give the same page counts, page sizes and image sizes. Text edges differ
slightly between the two, so images are not identical pixel for pixel.
Generated files are not committed.

For a quicker iteration on one checkpoint page, after a full export:

```sh
npm run build
python scripts/export.py --building hall --checkpoint-only
```

Omit `--checkpoint-only` to regenerate both pages and the PNG for one building.
Repeat `--building` to select several.

The lower part of each checkpoint page shows three simplified top-down
construction states from the same footprint: joists with chicken wire, blocking
with insulation, and the finished floor layer. These states live in
`checkpoint.topDownLayers` and can be overridden per building.

## Create another A-frame building

1. Copy `src/specs/hall.mjs` (or `shell6.mjs` for a plain closed shell) to a
   new building name.
2. Change dimensions, frame count, doors, anchors and bracing in that spec.
3. Import the new spec in `scripts/build.mjs`, and add its id to `BUILDINGS`
   in `scripts/export.py`.
4. Add a test covering the new building's authoritative dimensions and labels.

The renderer expects `stations === bays + 1`. Custom non-uniform station
locations can be supplied as normalized `stationRatios` from `0` to `1`.

## Specification ownership

| Section | Controls |
| --- | --- |
| `dimensions` | Closed length, width, height and extension length |
| `structure` | Stations, bays, ridge, cross-beam, extension frames and the clear interface passage |
| `anchors` | Closed anchor stations, B labels and L-extension labels |
| `doors` | End pairs, middle door, canopy, leaf split and outward swing |
| `bracing` | Near/far steel-wire convention and braced side-view zones |
| `shellGraph` | Named 3D structural nodes, node-to-node edges, open interface gap and outer X/Y/Z extents |
| `notes` | Status and verification statements printed on the sheet |

The 3D structure is topology-driven: every line references two named nodes.
Move a node once to update every connected edge. `axisExtents` owns the outer
X, Y and Z datums, and `clearPassage.between` records the deliberate missing
base connection at the shell/extension pedestrian opening.

Doors can be added, removed or moved with `sideDoor.enabled`,
`sideDoor.stationRatio` and `endGableCenters`. Wire elements are individually
addressable in `bracing.elements`; each has an id, a wall, two normalized
endpoints and an optional curve offset.

## Example site model

`src/site-model.mjs` holds an **invented** site: it copies no real place. It is
laid out to show how the pieces are meant to work together:

- **North:** the road, the public entrance, with tickets and toilets beside it.
- **West:** the Hall, with a backstage block and a delivery gate behind it, so
  crew and goods never cross the public yard.
- **Middle:** an open yard, with the kitchen and bar serving every room.
- **South:** the long Shell 8 across the yard from the entrance, with a back exit.
- **East:** the waterfront, with the boathouse, sauna, changing rooms and a quiet
  shell.

The Hall is fixed at local `E=0, N=0`; every other structure, perimeter vertex,
zone and gate is in metres from that reference, rounded to half a metre.
Building sheets keep their local `X=length, Y=width, Z=height` axes, while the
site uses `E/N/Z`.

`npm run build` validates the model, writes `output/data/site-model.json` (with
derived footprint corners, extents and perimeter length) and draws
`dist/site-map.html` from it with `src/render-site-map.mjs`. Move a structure in
the model and the map follows; a structure outside the perimeter is refused.

Opened in a browser, `dist/site-map.html` is also a layout editor. Drag a
structure or a perimeter corner (positions snap to half a metre), rotate the
selected structure with the buttons or the `[` and `]` keys, nudge it with the
arrow keys, and add or remove containers and service units. A structure that
overlaps another or leaves the perimeter is outlined in red and named in the
status line. **Copy layout** gives the `structures` and `perimeter` text to
paste into `src/site-model.mjs`; nothing is saved until you do. Zones, gates,
road and water are not editable in the page. The exporter opens
`site-map.html#static`, which is the drawing without the editor.

See [docs/site-coordinate-system.md](docs/site-coordinate-system.md) for the
coordinate contract, validation rules and known limits.

## Licence

MIT. See [LICENSE](LICENSE).
