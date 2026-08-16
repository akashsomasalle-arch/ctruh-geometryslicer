# Design Notes

## System architecture

The slicer is a small pipeline inside a larger editor. Data for a cut still flows one way: **UI / pointer → CutManager → MeshCutter → scene parts**. `App` wires everything else (history, catalog, save/export) so UI and scene setup never call `MeshCutter` directly.

```
          ┌─────────────┐
          │     UI      │  mode, catalog, outliner, properties
          └──────┬──────┘
                 │ callbacks
          ┌──────▼──────┐     ┌──────────────────┐
 pointer  │ Interaction │────►│   EditorState    │
 events   │  Manager    │     │ navigate|cut     │
          └──────┬──────┘     │ idle|cutting|drag│
                 │            └────────┬─────────┘
        cut gesture / pick             │
                 │                     │
          ┌──────▼──────┐       ┌──────▼──────┐
          │ CutManager  │──────►│   History   │  undo/redo
          │             │ onCut │ cut, move,  │
          │ NDC → plane │       │ add, delete │
          │ part graph  │       └─────────────┘
          └──────┬──────┘
                 │ cut(mesh, plane)
          ┌──────▼──────┐
          │ MeshCutter  │  local plane, classify,
          │             │  split, caps, geometries
          └─────────────┘

SceneManager  = viewport (lights, grid, PBR, orbit, helpers, shading, WebGL)
ModelManager  = catalog / upload / dispose / keep groups
App           = glue: load, history commands, save/open/export, property edits
```

**How they talk**

- `UI` is DOM only. Buttons and menus fire callbacks (`onModeChange`, `onUndo`, `onObjectEdit`, …). It never reads vertex buffers.
- `EditorState` keeps Navigate/Cut orthogonal to the transient pointer phase (`idle` / `cutting` / `dragging`). Orbit and the transform gizmo follow the mode; a cut gesture can disable orbit without losing the HUD mode.
- `InteractionManager` owns picking and `TransformControls`. Viewport picks walk up to the imported root so a GLTF stays one selectable model. Outliner clicks stay on the exact mesh, geometry, or material so nested GLTF materials can be edited. In Cut mode it forwards the stroke to `CutManager`. In Navigate mode it selects a piece and attaches the gizmo. Transforms are reported to `App`, which records them in `History`.
- `CutManager` owns *when* to cut and *what* to replace in the graph: derive the world plane, preview line + plane, call `MeshCutter`, spawn two pieces, register them, then emit a `CutRecord` (`before` / `after` / `parents`) so `App` can undo.
- `MeshCutter.cut(mesh, plane)` has no knowledge of hoodie vs cube. If it renders as a `THREE.Mesh` with a position attribute, it can be cut.
- `History` is a linear undo/redo stack. Cuts restore the previous mesh graph; gizmo moves restore position / rotation / scale; add / clone / delete restore object membership.

**Coordinate spaces**

- Gesture points and the cutting plane start in **world** space.
- Vertices stay in **local** space. The plane is pulled into local space with `inverse(matrixWorld)` rather than transforming every vertex to world (cheaper, and independent of nesting).
- After load, meshes live under an identity `piecesRoot`. Gizmo drags write world-space deltas to `object.position` / `rotation` / `scale` without a parent transform fighting the motion. Multi-mesh GLTFs stay as a group so one gizmo moves the whole asset.

## Tradeoffs

| Simplified | Why | What I would build next |
|---|---|---|
| Non-indexed triangles | Avoids index-buffer surgery and shared-vertex splits | Weld vertices after the cut; preserve original index layout where possible |
| Ear clipping + fan fallback for caps | Robust enough for convex / mildly concave slices | Constrained Delaunay; handle holes and multiple shells |
| First material only on the cut surface | GLTF multi-material groups are easy to get wrong after `toNonIndexed()` | Map original groups through the splitter |
| No skeleton bake | Skinned clothing is a research problem on its own | Bake posed vertices before classify |
| Small gap after cut | Makes the demo readable without extra UI | Optional explode slider |
| Main-thread slice | Keeps the architecture obvious | Move `MeshCutter` to a Worker; stream pieces back |
| Property edits not undoable | Gizmo / cut / graph ops were the high-value history cases | Snapshot material and scene settings as commands |

Built after the original slicer (not left as future work): TypeScript throughout, undo/redo for cuts and transforms, TransformControls instead of free drag, editor shell (outliner, properties, resources), save / open / export / publish.

Not attempted (out of scope): CSG unions, multi-stroke booleans, backend hosting, automatic hole-aware cap topology.

## Scaling to 20 models

Nothing in the cutter is model-specific. Supporting 20 assets is a **catalog** problem, and the editor already treats it that way:

1. Add entries to `MODELS` in `ModelManager` (`id`, `name`, `type`, `url` / `shape`).
2. `load(id)` disposes the previous graph, frames the camera, and registers meshes with `CutManager`. `add(id)` appends without wiping the scene.
3. Uploads (`.glb`, `.gltf`, `.obj`, `.fbx`, `.usdz`) join the same catalog as `type: "upload"`.
4. Keep assets in a uniform size range (or keep the existing auto-normalize to ~2.4 units) so lighting, grid, and orbit limits stay valid.
5. Prefer watertight, unskinned meshes if cap quality matters; clothing/open shells will still split but caps may be incomplete — that is a content guideline, not a new code path.

A remote catalog (JSON of GLTF URLs) could replace the hardcoded list without touching `MeshCutter`. Lights, cameras, sprites, and groups already share the Add menu; they are not sliced, only the meshes `ModelManager.collectMeshes` returns.

## Performance

Slicing is **O(triangles)** per mesh: classify every vertex, lerp crossing edges, emit new triangles, then O(segments) to stitch caps.

**Concerns**

- A 100k-triangle GLTF means ~100k classifications and potentially tens of thousands of new vertices. Main-thread hitch.
- `toNonIndexed()` duplicates shared vertices (memory).
- Cap stitching is small compared to the triangle loop unless the slice is extremely jagged.
- Re-triangulation happens on pointer-up, not every preview frame. Preview is a line + a scaled plane mesh, not a live CSG.

**What we did**

- **AABB vs plane** reject before reading attributes.
- **Local-space plane** so we do not transform every vertex to world.
- **Vector pools** on `MeshCutter` for the per-triangle scratch vectors.
- **Skip degenerate** faces and empty-side results (no split → original mesh kept).
- Normalize imported models to a bounded size so rasterization and shadow maps stay stable.
- **Demand rendering**: the loop only draws when orbit, a cut, a gizmo, or a helper actually changed — idle GPU time stays flat.
- Pixel ratio capped at 2.

**Next**

- Worker for the triangle loop.
- Skip triangles whose three distances have the same sign without cloning vertex objects (already cheap; could go further with typed-array in-place writes).
- BVH for picking, not for slicing (slicing must visit intersecting triangles; a BVH would only skip subtrees whose bounds miss the plane — worth it above ~200k tris).
