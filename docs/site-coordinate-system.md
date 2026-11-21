# Example site-coordinate system

The site model is a single source of truth for the relationship between the
building drawings, the outdoor yard, circulation routes, dock area and outer
perimeter. It is intentionally local and relative: it is an example layout,
not a surveyed municipal coordinate set.

## Reference and axes

- `Hall` is fixed at local `E=0, N=0`.
- `E` points east and `N` points north in the site overview.
- `Z` is height above the local ground datum.
- Every other footprint is stored as an east/north offset, width, length and
  plan angle from that reference.
- A building sheet keeps its own local `X=length`, `Y=width`, `Z=height`
  convention. The site model converts the X/Y footprint to E/N corners.

This separation prevents a common failure mode: changing a display angle or
3D camera must not change the plan location of a building.

## Owned layers

`src/site-model.mjs` owns:

1. Structure centers, dimensions, categories and plan angles.
2. The enclosing perimeter.
3. Outdoor, dock and circulation polygons.
4. Entrance and exit points.
5. The road and waterline drawn around the site for orientation.
6. Derived footprint corners, extents, border length and enclosure checks.

The four A-frame dimensions are cross-checked against their authoritative
building specifications. Permanent, service and mobile structures remain
approximate until verified.

## Regeneration

```powershell
npm run site-model
npm test
npm run build
```

The export is written to `output/data/site-model.json`. It is suitable for a
map renderer, a future 3D overview, CAD/GIS handoff, clash checks or a building
mover UI. Derived values are regenerated; they should not be edited by hand.

## Validation and capacity

The current validation rejects:

- duplicate structure IDs;
- missing or non-finite coordinates;
- non-positive dimensions;
- a moved or missing reference structure;
- malformed perimeter or zone geometry;
- mismatch between A-frame site dimensions and building specs;
- structure corners outside the accepted perimeter.

The model currently supports arbitrary rectangular footprints, angles and
categories. New structures, containers, zones and doors can be added without
changing the coordinate contract. A future surveyed transform can be added
alongside the local system without invalidating existing offsets.

For quick iteration, a UI only needs to edit a structure's `east`, `north` and
`angleDeg`, or a perimeter vertex's `east` and `north`. Width, length and height
remain owned by the corresponding building specification. The JSON export is
therefore also the stable API boundary for sliders, drag handles and alternate
2D/3D renderers.

## Known limitation

The placement is an example layout, not a survey. Values marked
`approximate` or `provisional` must be verified before construction,
engineering or authority use.
