# Design Notes

## System architecture

Four systems plus a tiny state machine. Data flows one way: **UI / pointer → CutManager → MeshCutter → scene parts**.

```
          ┌─────────────┐
          │     UI      │  mode, model id, hints
          └──────┬──────┘
                 │
          ┌──────▼──────┐     ┌──────────────────┐
 pointer  │ Interaction │────►│   EditorState    │
 events   │  Manager    │     │ navigate|cut     │
          └──────┬──────┘     │ idle|cutting|drag│
                 │            └──────────────────┘
        cut gesture / pick
                 │
          ┌──────▼──────┐
          │ CutManager  │  NDC → ray → P1,P2 → plane
          │             │  preview line + plane
          │             │  part registry
          └──────┬──────┘
                 │ cut(mesh, plane)
          ┌──────▼──────┐
          │ MeshCutter  │  local plane, classify,
          │             │  split, caps, geometries
          └─────────────┘

SceneManager = viewport only (lights, grid, PBR, orbit)
ModelManager = load / dispose / flatten GLTF graphs
```

**Why this split**

- The assignment forbids cutting logic in UI or scene setup.
- `MeshCutter.cut(mesh, plane)` has no knowledge of hoodie vs cube. If it renders as a `THREE.Mesh` with a position attribute, it can be cut.
- `CutManager` owns *when* to cut and *what* to replace in the graph. `MeshCutter` owns *how*.
- `EditorState` keeps Navigate/Cut orthogonal to the transient pointer phase (idle / cutting / dragging) so orbit can be disabled during a gesture without losing the HUD mode.

**Coordinate spaces**

- Gesture points and the cutting plane start in **world** space.
- Vertices stay in **local** space. The plane is pulled into local space with `inverse(matrixWorld)` rather than transforming every vertex to world (cheaper, and independent of nesting).
- After load, meshes are `attach`ed to an identity `piecesRoot` so later drags can apply world-space deltas to `mesh.position` without parent scale/rotation fighting the motion.

## Tradeoffs

| Simplified | Why | What I would build next |
|---|---|---|
| Non-indexed triangles | Avoids index-buffer surgery and shared-vertex splits | Weld vertices after the cut; preserve original index layout where possible |
| Ear clipping + fan fallback for caps | Robust enough for convex / mildly concave slices in 3 days | Constrained Delaunay; handle holes and multiple shells |
| First material only | GLTF multi-material groups are easy to get wrong after `toNonIndexed()` | Map original groups through the splitter |
| No skeleton bake | Skinned clothing is a research problem on its own | Bake posed vertices before classify |
| Small gap after cut | Makes the demo readable without a gizmo | Optional; or an explode slider |
| Main-thread slice | Keeps the architecture obvious | Move `MeshCutter` to a Worker; stream pieces back |
| JS instead of TS | Matches this repo and the “adapt” request | Add JSDoc → TS if the team prefers |

Not attempted (out of scope): undo/redo, CSG unions, gizmos, WebGPU, backend.

## Scaling to 20 models

Nothing in the cutter is model-specific. Supporting 20 assets is a **catalog** problem:

1. Add entries to `MODELS` in `ModelManager` (`id`, `name`, `type`, `url`).
2. The loader already disposes the previous graph, frames the camera, and registers meshes with `CutManager`.
3. Keep assets in a uniform size range (or keep the existing auto-normalize to ~2.4 units) so lighting, grid, and orbit limits stay valid.
4. Prefer watertight, unskinned meshes if cap quality matters; clothing/open shells will still split but caps may be incomplete — that is a content guideline, not a new code path.

A remote catalog (JSON of GLTF URLs) could replace the hardcoded list without touching `MeshCutter`.

## Performance

Slicing is **O(triangles)** per mesh: classify every vertex, lerp crossing edges, emit new triangles, then O(segments) to stitch caps.

**Concerns**

- A 100k-triangle GLTF means ~100k classifications and potentially tens of thousands of new vertices. Main-thread hitch.
- `toNonIndexed()` duplicates shared vertices (memory).
- Cap stitching is small compared to the triangle loop unless the slice is extremely jagged.

**What we did**

- **AABB vs plane** reject before reading attributes.
- **Local-space plane** so we do not transform every vertex to world.
- **Vector pools** on `MeshCutter` for the per-triangle scratch vectors.
- **Skip degenerate** faces and empty-side results (no split → original mesh kept).
- Normalize imported models to a bounded size so rasterization and shadow maps stay stable.

**Next**

- Worker for the triangle loop.
- Skip triangles whose three distances have the same sign without cloning vertex objects (already cheap; could go further with typed-array in-place writes).
- BVH for picking, not for slicing (slicing must visit intersecting triangles; a BVH would only skip subtrees whose bounds miss the plane — worth it above ~200k tris).
