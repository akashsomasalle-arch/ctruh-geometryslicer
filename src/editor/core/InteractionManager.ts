import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { EditorMode } from "./EditorState";
import type { EditorState } from "./EditorState";
import type { SceneManager } from "./SceneManager";
import type { CutManager } from "./CutManager";
import type { UI } from "./UI";
import type { SelectOptions } from "./types";

interface GizmoStart {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

type TransformKind = "position" | "rotation" | "scale";
type TransformCallback = (
  object: THREE.Object3D,
  from: THREE.Vector3 | THREE.Euler,
  to: THREE.Vector3 | THREE.Euler,
  kind: TransformKind
) => void;

/**
 * Pointer events, picking, and transform gizmo.
 * Forwards cut gestures to CutManager; does not contain slicing math.
 */
export class InteractionManager {
  sceneManager: SceneManager;
  cutManager: CutManager;
  editorState: EditorState;
  ui: UI;
  raycaster = new THREE.Raycaster();
  ndc = new THREE.Vector2();
  selected: THREE.Object3D | null = null;
  enabled = true;
  transformControls: TransformControls;

  private _pointerDown: { x: number; y: number } | null = null;
  private _onTransform: TransformCallback | null = null;
  private _gizmoStart: GizmoStart | null = null;
  private _downOnGizmo = false;
  private _selectionBounds = new THREE.Box3();
  private _selectionBox: THREE.Box3Helper;
  private _gizmoHelper: THREE.Object3D;
  private _onDown: (event: PointerEvent) => void;
  private _onMove: (event: PointerEvent) => void;
  private _onUp: (event: PointerEvent) => void;
  private _onKey: (event: KeyboardEvent) => void;

  constructor(
    sceneManager: SceneManager,
    cutManager: CutManager,
    editorState: EditorState,
    ui: UI
  ) {
    this.sceneManager = sceneManager;
    this.cutManager = cutManager;
    this.editorState = editorState;
    this.ui = ui;

    this._selectionBox = new THREE.Box3Helper(this._selectionBounds, 0xffff00);
    const boxMat = this._selectionBox.material as THREE.LineBasicMaterial;
    boxMat.depthTest = false;
    boxMat.transparent = true;
    boxMat.fog = false;
    this._selectionBox.visible = false;
    this._selectionBox.userData.ignorePick = true;
    sceneManager.scene.add(this._selectionBox);

    this.transformControls = new TransformControls(sceneManager.camera, sceneManager.canvas);
    this.transformControls.setMode("translate");
    this.transformControls.addEventListener("change", () => sceneManager.requestRender());
    this.transformControls.addEventListener("objectChange", () => this.updateHelpers());
    this.transformControls.addEventListener("mouseDown", () => this._onGizmoDown());
    this.transformControls.addEventListener("mouseUp", () => this._onGizmoUp());

    this._gizmoHelper = this.transformControls.getHelper();
    this._gizmoHelper.traverse((child) => {
      child.userData.ignorePick = true;
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) (mat as THREE.Material & { fog?: boolean }).fog = false;
      }
    });
    sceneManager.scene.add(this._gizmoHelper);

    const canvas = sceneManager.canvas;
    this._onDown = this._handleDown.bind(this);
    this._onMove = this._handleMove.bind(this);
    this._onUp = this._handleUp.bind(this);
    this._onKey = this._handleKey.bind(this);

    canvas.addEventListener("pointerdown", this._onDown);
    window.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerup", this._onUp);
    window.addEventListener("keydown", this._onKey);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  onTransform(fn: TransformCallback): void {
    this._onTransform = fn;
  }

  updateHelpers(): void {
    const selected = this.selected;
    const locked =
      !selected ||
      this.editorState.isCut() ||
      selected === this.sceneManager.camera ||
      selected === this.sceneManager.scene;

    if (locked) {
      this._selectionBox.visible = false;
      this.transformControls.detach();
      this.transformControls.enabled = false;
      if (selected && selected !== this.sceneManager.scene) {
        if (!this.ui.properties?.contains(document.activeElement)) {
          this.ui.refreshProperties(selected);
        }
      }
      this.sceneManager.requestRender();
      return;
    }

    this._selectionBounds.setFromObject(selected, true);
    this._selectionBox.visible = !this._selectionBounds.isEmpty();
    this.transformControls.enabled = true;
    if (this.transformControls.object !== selected) {
      this.transformControls.attach(selected);
    }
    this.sceneManager.updateObjectHelpers();
    if (!this.ui.properties?.contains(document.activeElement)) {
      this.ui.refreshProperties(selected);
    }
    this.sceneManager.requestRender();
  }

  private _eventNdc(event: PointerEvent): THREE.Vector2 {
    const rect = this.sceneManager.canvas.getBoundingClientRect();
    this.ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    return this.ndc;
  }

  private _pickPart(event: PointerEvent): { object: THREE.Object3D } | null {
    this._eventNdc(event);
    this.raycaster.setFromCamera(this.ndc, this.sceneManager.camera);
    const hits = this.raycaster.intersectObjects(
      this.sceneManager.piecesRoot.children,
      true
    );
    const meshHit = hits.find((hit) => !hit.object.userData?.ignorePick);
    if (meshHit) return meshHit;

    const helperHits = this.raycaster.intersectObjects(
      this.sceneManager.helpersRoot.children,
      true
    );
    const picker = helperHits.find((hit) => hit.object.userData?.object);
    return picker ? { object: picker.object.userData.object as THREE.Object3D } : null;
  }

  private _onGizmo(): boolean {
    return this.transformControls.dragging || this.transformControls.axis != null;
  }

  private _onGizmoDown(): void {
    const object = this.transformControls.object;
    if (!object) return;
    this._gizmoStart = {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
    };
    this.sceneManager.setOrbitEnabled(false);
  }

  private _onGizmoUp(): void {
    const object = this.transformControls.object;
    const start = this._gizmoStart;
    this._gizmoStart = null;
    this.sceneManager.setOrbitEnabled(this.editorState.isNavigate());
    if (!object || !start) return;

    const mode = this.transformControls.getMode();
    if (mode === "translate" && !start.position.equals(object.position)) {
      this._onTransform?.(object, start.position, object.position.clone(), "position");
    } else if (mode === "rotate" && !start.rotation.equals(object.rotation)) {
      this._onTransform?.(object, start.rotation, object.rotation.clone(), "rotation");
    } else if (mode === "scale" && !start.scale.equals(object.scale)) {
      this._onTransform?.(object, start.scale, object.scale.clone(), "scale");
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resetSelection();
  }

  private _handleDown(event: PointerEvent): void {
    if (!this.enabled || event.button !== 0) return;
    this._pointerDown = { x: event.clientX, y: event.clientY };

    if (this.editorState.isCut()) {
      this.sceneManager.setOrbitEnabled(false);
      this.editorState.beginCutting();
      this.cutManager.beginGesture(this._eventNdc(event).clone(), this.sceneManager.camera);
      this.ui.setHint("Release to slice");
      this.sceneManager.canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    this._downOnGizmo = this._onGizmo();
    if (this._downOnGizmo) return;

    const hit = this._pickPart(event);
    if (hit) this._select(hit.object);
  }

  private _handleMove(event: PointerEvent): void {
    if (this.editorState.pointer !== "cutting" || !this._pointerDown) return;
    this.cutManager.updateGesture(
      this._eventNdc(event).clone(),
      this.sceneManager.camera
    );
    this.ui.updateScreenLine(
      this._pointerDown.x,
      this._pointerDown.y,
      event.clientX,
      event.clientY
    );
    this.sceneManager.requestRender();
  }

  private _handleUp(event: PointerEvent): void {
    if (this.editorState.pointer === "cutting" && this._pointerDown) {
      const dx = event.clientX - this._pointerDown.x;
      const dy = event.clientY - this._pointerDown.y;
      const dist = Math.hypot(dx, dy);
      this.cutManager.endGesture(this.sceneManager.camera, dist);
      this.ui.hideScreenLine();
      this.editorState.idle();
      this.sceneManager.setOrbitEnabled(false);
      this.sceneManager.requestRender();
      this.ui.setHint("Drag across the model to cut · N to navigate");
      return;
    }

    if (!this._pointerDown || this._downOnGizmo || this._onGizmo()) return;
    const moved = Math.hypot(
      event.clientX - this._pointerDown.x,
      event.clientY - this._pointerDown.y
    ) > 2;
    if (!moved && !this._pickPart(event)) this._clearSelection();
  }

  private _handleKey(event: KeyboardEvent): void {
    if (!this.enabled) return;
    const target = event.target;
    if (target instanceof Element && target.matches("input, select, textarea, button")) return;

    if (event.ctrlKey || event.metaKey) {
      if (event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) this.ui.redo();
        else this.ui.undo();
      }
      return;
    }

    if (event.key === "Delete") {
      this.ui.deleteSelected();
      return;
    }

    if (event.key === "Escape") {
      this.cutManager.cancelGesture();
      this.ui.hideScreenLine();
      this._clearSelection();
      this.editorState.idle();
      this.sceneManager.setOrbitEnabled(this.editorState.isNavigate());
      this.sceneManager.requestRender();
      return;
    }

    if (event.key === "w" || event.key === "W") this._setGizmoMode("translate");
    if (event.key === "r" || event.key === "R") this._setGizmoMode("rotate");
    if (event.key === "s" || event.key === "S") this._setGizmoMode("scale");

    if (event.key === "c" || event.key === "C") {
      this.ui.setMode(EditorMode.CUT);
    }
    if (event.key === "n" || event.key === "N") {
      this.ui.setMode(EditorMode.NAVIGATE);
    }
  }

  private _setGizmoMode(mode: "translate" | "rotate" | "scale"): void {
    if (this.editorState.isCut()) return;
    this.transformControls.setMode(mode);
    this.sceneManager.requestRender();
  }

  private _select(mesh: THREE.Object3D, options?: SelectOptions): void {
    this.selected = options?.exact ? mesh : this.cutManager.getSelectable(mesh) || mesh;
    this.ui.setSelection(this.selected, options);
    this.ui.setHint(
      options?.prop === "material"
        ? "Material selected — edit it in the Material tab"
        : options?.prop === "geometry"
          ? "Geometry selected — inspect it in the Geometry tab"
          : "Use the gizmo to move · W translate · R rotate · S scale"
    );
    this.updateHelpers();
  }

  selectMesh(mesh: THREE.Object3D | null, options?: SelectOptions): void {
    if (!mesh) {
      this._clearSelection();
      return;
    }
    this._select(mesh, options);
  }

  private _clearSelection(): void {
    this.selected = null;
    this.ui.setSelection(null);
    this.updateHelpers();
  }

  resetSelection(): void {
    this._clearSelection();
  }

  syncOrbitToMode(): void {
    if (this.editorState.pointer !== "idle") return;
    this.sceneManager.setOrbitEnabled(this.editorState.isNavigate());
    this.updateHelpers();
  }
}
