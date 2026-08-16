# Geometry Slicer

Desktop web tool for cutting 3D meshes in real time. Draw a mouse gesture across a model; a cutting plane is derived from that stroke; the mesh splits into independent, draggable pieces.

**Framework:** Three.js (r183) + TypeScript + Vite  
**Shading:** PBR (`MeshStandardMaterial` + HDR environment, ambient / hemisphere / directional lights)

## Run

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## How to use

1. Open the app → **Start Editing**
2. **Navigate** — orbit / pan / zoom. Click a piece to drag it.
3. **Cut** — drag across the model. A 2D stroke and a translucent 3D plane preview the cut. Release to slice.
4. Switch models from the dropdown (primitives + T-Shirt). Cutting works on each through the same pipeline.
5. Shortcuts: `C` cut, `N` navigate, `Esc` cancel.

## Third-party libraries

| Library | Why |
|---|---|
| **three** | Scene, camera, renderer, PBR, raycasting, `Plane` / `BufferGeometry` math helpers |
| **GLTFLoader** | Load assignment GLTF models |
| **DRACOLoader** | Decode Draco-compressed GLTFs if present |
| **HDRLoader** | Environment lighting for PBR |
| **OrbitControls** | Navigate-mode orbit / pan / zoom |
| **Vite** | Dev server and bundler |

No external CSG / slicing library. All cutting math is in `src/editor/core/MeshCutter.ts`.

## Architecture

```
App
 ├── SceneManager        camera, renderer, lights, grid, env, orbit
 ├── ModelManager        GLTF / primitives, dispose, flatten transforms
 ├── InteractionManager  pointer events, raycasting, piece drag
 ├── CutManager          gesture → plane → MeshCutter → register parts
 ├── MeshCutter          triangle classify / split / caps
 ├── EditorState         NAVIGATE | CUT + idle/cutting/dragging
 └── UI                  home, HUD, model switcher (no geometry)
```

Cutting logic is not in UI or scene setup. `CutManager` orchestrates; `MeshCutter.cut(mesh, plane)` is generic.

## How the cutting plane is derived

The mouse lives in 2D. The mesh lives in 3D. Two screen points are not enough for a unique plane, so the camera supplies the third direction.

1. Pointer → NDC:  
   `x = 2 * mouseX / width - 1`, `y = -(2 * mouseY / height - 1)`
2. `raycaster.setFromCamera(ndc, camera)`
3. Ray ∩ mesh (or a camera-facing plane through the model center on a miss) → `P1`, `P2`
4. `D = P2 - P1`, `V = camera view direction`
5. `N = normalize(D × V)`
6. Plane: point `P1`, normal `N`

That is the interpretation of *“cutting plane is derived from the 2D mouse drag path projected into 3D world space.”*

## How vertices are classified

The world plane is transformed into the mesh’s **local** space (`plane.applyMatrix4(inverse(matrixWorld))`) so vertices are never compared across coordinate spaces.

Signed distance: `d = n · p + constant` (`THREE.Plane.distanceToPoint`).

- `d > ε` → positive piece  
- `d < -ε` → negative piece  
- `|d| ≤ ε` → on the plane  

AABB vs plane is tested first; meshes that miss are skipped (`O(1)` reject).

## How triangles are split

Geometry is converted with `toNonIndexed()` so each triangle owns its vertices (simpler topology, more memory).

- All vertices on one side → keep the triangle on that side  
- Crossing → walk edges, lerp intersection `P = A + t(B - A)` with `t = dA / (dA - dB)`  
- Position, normal, and UV are interpolated at the same `t`  
- Resulting 3- or 4-gons are fan-triangulated onto each piece  

## How caps are generated

Each split triangle contributes a segment on the plane. Segments are snapped, stitched into loops, projected to 2D in the plane basis, ear-clipped (fan fallback if ear clipping fails), and appended as a second material group so the cut face is visible.

- Positive piece cap normal: `-N`  
- Negative piece cap normal: `+N`  

## Known issues / incomplete areas

- **Open / non-manifold meshes** (clothing GLTFs): caps can be incomplete or missing loops.
- **Intersection graph degree > 2** (self-intersections, T-junctions): loop stitching can fail; fan fallback may produce overlapping cap triangles.
- **Skinned / morph meshes**: bind-pose / base geometry is sliced; bone/morph deformation is not baked.
- **Multi-material source meshes**: only the first material is kept on the surface group.
- **Coplanar triangles** are assigned to the positive side rather than becoming cap geometry.
- **No undo**, no multi-stroke boolean, no Web Workers.
- Pieces are separated by a small gap along the plane normal so the cut is visible.

A working 70% slicer on arbitrary `THREE.Mesh` / `BufferGeometry` was preferred over a fragile 100% CSG attempt.

See [DESIGN.md](./DESIGN.md) for architecture, tradeoffs, scaling, and performance.
