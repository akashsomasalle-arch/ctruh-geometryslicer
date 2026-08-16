# Geometry Slicer

Desktop web editor for cutting 3D meshes in real time. Draw a mouse gesture across a model; a cutting plane is derived from that stroke; the mesh splits into independent pieces you can transform, inspect, and export.

**Demo:** [https://ctruh-geometryslicer.netlify.app/](https://ctruh-geometryslicer.netlify.app/)

**Framework:** Three.js (r183) + TypeScript + Vite. Renderer is WebGL 2 via `WebGLRenderer`.

**Shading:** PBR by default (`MeshStandardMaterial` + `RoomEnvironment` / HDR IBL, ambient / hemisphere / directional lights, ACES tone mapping). The properties panel can convert a selected mesh to Phong, Lambert, Physical, and other Three.js materials. Viewport shading can also preview normals or wireframe without changing the stored material.

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
2. **Navigate** — orbit / pan / zoom. Click a piece to select it, then use the gizmo (`W` translate, `R` rotate, `S` scale).
3. **Cut** — drag across the model. A 2D stroke and a translucent 3D plane preview the cut. Release to slice.
4. Switch or add shapes from the catalog (primitives, text, sprite, T-Shirt). Import `.glb` / `.gltf` / `.obj` / `.fbx` / `.usdz`. Cutting uses the same pipeline for every mesh.
5. **Outliner** — viewport click selects the whole import. In the Scene list, each mesh shows as `name` plus a green geometry dot and a pink material name (`mesh_2 ● Metal 01`). Click the mesh, the green dot, or the material to edit that object / geometry / material. Drag the bar under the list to resize it.
6. File menu: save / open a project JSON, export GLB / GLTF / OBJ / USDZ.
7. Shortcuts: `C` cut, `N` navigate, `Esc` cancel, `Del` delete, `Ctrl+Z` undo, `Ctrl+Shift+Z` redo.

## Third-party libraries

Only **three** is a package dependency. Loaders, exporters, and controls come from `three/addons`. There is no glMatrix, CSG, or third-party slicer.

| Library | Why |
|---|---|
| **three** | Scene, camera, renderer, PBR, raycasting, `Plane` / `BufferGeometry` math helpers |
| **GLTFLoader** + **DRACOLoader** | Load assignment and user GLTFs, including Draco-compressed files |
| **OBJLoader** / **MTLLoader**, **FBXLoader**, **USDLoader** | User uploads beyond GLTF |
| **HDRLoader** + **RoomEnvironment** | Environment lighting for PBR |
| **OrbitControls** | Navigate-mode orbit / pan / zoom |
| **TransformControls** | Translate / rotate / scale gizmo on selected pieces |
| **ViewHelper** | Viewport axis gizmo |
| **FontLoader** + **TextGeometry** | Add → Text |
| **GLTFExporter**, **OBJExporter**, **USDZExporter**, **fflate** | Export and Publish zip |
| **Vite** | Dev server and bundler |

All cutting math is in `src/editor/core/MeshCutter.ts`.

## Architecture

```
App
 ├── SceneManager        camera, renderer, lights, grid, env, orbit, helpers, shading
 ├── ModelManager        catalog, GLTF / OBJ / FBX / USDZ / primitives, upload, dispose
 ├── InteractionManager  pointer events, raycasting, TransformControls
 ├── CutManager          gesture → plane → MeshCutter → register parts
 ├── MeshCutter          triangle classify / split / caps
 ├── EditorState         NAVIGATE | CUT + idle/cutting/dragging
 ├── History             undo / redo (cut, transform, add, delete, clone, mode)
 └── UI                  home, menubar, sidebar, outliner, properties (no geometry)
```

Cutting logic is not in UI or scene setup. `CutManager` orchestrates; `MeshCutter.cut(mesh, plane)` is generic.

See [DESIGN.md](./DESIGN.md) for how these systems communicate, tradeoffs, scaling, and performance.

## How the cutting plane is derived

The mouse lives in 2D. The mesh lives in 3D. Two screen points are not enough for a unique plane, so the camera supplies the third direction.

1. Pointer → NDC:
   `x = 2 * mouseX / width - 1`, `y = -(2 * mouseY / height - 1)`
2. `raycaster.setFromCamera(ndc, camera)`
3. Ray ∩ mesh (or a camera-facing plane through the model center on a miss) → `P1`, `P2`
4. `D = P2 - P1`, `V = camera view direction`
5. `N = normalize(D × V)` (falls back to `D × camera.up` if that cross product is degenerate)
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
- **Multi-material source meshes**: only the first material is kept on the surface group. Cut pieces always get `[surface, cap]`.
- **Coplanar triangles** are assigned to the positive side rather than becoming cap geometry.
- **Property-panel edits** (material type, colors, fog) are not on the undo stack — only cuts, gizmo transforms, add / clone / delete, and mode switches are.
- Pieces are separated by a small gap along the plane normal so the cut is visible.
- No multi-stroke boolean, no Web Workers.

A working 70% slicer on arbitrary `THREE.Mesh` / `BufferGeometry` was preferred over a fragile 100% CSG attempt.
