# Scene model fixtures

Real public files used by the placement tests. Total about 48 KB.

| File | Source | Licence |
| --- | --- | --- |
| `cesium-discrete-lod/tileset.json`, `cesium-discrete-lod/dragon_low.b3dm` | https://github.com/CesiumGS/3d-tiles-samples/tree/main/1.0/TilesetWithDiscreteLOD (raw.githubusercontent.com, branch `main`) | CC0, per the sample's README |
| `macky-doc.kml` | `doc.kml` inside https://developers.google.com/static/kml/documentation/MackyBldg.kmz, linked from https://developers.google.com/kml/documentation/models | Google Developers site content, CC BY 4.0 (https://developers.google.com/site-policies). Model by Noel Nemcik. |

Not stored, numbers only (hardcoded in the tests with their source):

- `files/CU Macky.dae` from the same KMZ: third-party model, licence not stated. The test keeps only the convex hull of its vertices.
- Pont de Recouvrance KMZ, `navisu-launcher/data/stl/kmz/buildings/pontRecouvrance/` in https://github.com/terre-virtuelle/navisu: repository has no licence. The test keeps the Model block values and four deck corners.
- Building and bridge geometry from OpenStreetMap (way 46146360, ways 1423115033 and 1423115034), (c) OpenStreetMap contributors, ODbL 1.0.
