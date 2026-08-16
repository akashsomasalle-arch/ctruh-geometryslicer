import * as THREE from "three";
import { MeshCutter } from "./MeshCutter";
import type { SceneManager } from "./SceneManager";
import type { ModelManager } from "./ModelManager";
import type { CutRecord } from "./types";

const MIN_DRAG_PX = 8;
const CAP_COLOR = 0x9aa8c2;

interface CutGesture {
  startNdc: THREE.Vector2;
  endNdc: THREE.Vector2;
  startWorld: THREE.Vector3;
  endWorld: THREE.Vector3;
}

/**
 * Orchestrates cut gestures, plane derivation, preview, and part registration.
 * Triangle math lives in MeshCutter — not here.
 */
export class CutManager {
  sceneManager: SceneManager;
  modelManager: ModelManager;
  cutter = new MeshCutter();
  parts: THREE.Mesh[] = [];

  private _worldPos = new THREE.Vector3();
  private _worldQuat = new THREE.Quaternion();
  private _worldScale = new THREE.Vector3();
  private _viewDir = new THREE.Vector3();
  private _dragDir = new THREE.Vector3();
  private _normal = new THREE.Vector3();
  private _mid = new THREE.Vector3();
  private _box = new THREE.Box3();
  private _size = new THREE.Vector3();
  private _fallbackPlane = new THREE.Plane();
  private _raycaster = new THREE.Raycaster();
  private _tmpLookTarget = new THREE.Vector3();
  private _gesture: CutGesture | null = null;
  private _onMessage: ((text: string) => void) | null = null;
  private _onCut: ((record: CutRecord) => void) | null = null;
  private _previewLine: THREE.Line;
  private _previewPlane: THREE.Mesh;

  constructor(sceneManager: SceneManager, modelManager: ModelManager) {
    this.sceneManager = sceneManager;
    this.modelManager = modelManager;
    this._previewLine = this._createPreviewLine();
    this._previewPlane = this._createPreviewPlane();
    sceneManager.previewRoot.add(this._previewLine);
    sceneManager.previewRoot.add(this._previewPlane);
    this.hidePreview();
  }

  onMessage(fn: (text: string) => void): void {
    this._onMessage = fn;
  }

  onCut(fn: (record: CutRecord) => void): void {
    this._onCut = fn;
  }

  setParts(meshes: THREE.Mesh[]): void {
    this.parts = meshes.slice();
  }

  getParts(): THREE.Mesh[] {
    return this.parts;
  }

  getObjects(): THREE.Object3D[] {
    return this.sceneManager.piecesRoot.children.filter(
      (child) => !child.userData?.ignorePick
    );
  }

  getSelectable(object: THREE.Object3D | null | undefined): THREE.Object3D | null {
    if (!object) return null;
    const root = this.sceneManager.piecesRoot;
    let current: THREE.Object3D | null = object;
    while (current && current.parent && current.parent !== root) {
      current = current.parent;
    }
    return current?.parent === root ? current : object;
  }

  addObject(object: THREE.Object3D): void {
    const parent = this.sceneManager.piecesRoot;
    if (object.parent !== parent) parent.add(object);
    for (const mesh of this.modelManager.collectMeshes(object)) {
      if (!this.parts.includes(mesh)) this.parts.push(mesh);
    }
  }

  removeObject(object: THREE.Object3D): void {
    const meshes = new Set(this.modelManager.collectMeshes(object));
    this.parts = this.parts.filter((part) => !meshes.has(part));
    object.parent?.remove(object);
  }

  insertObject(object: THREE.Object3D, index: number): void {
    this.addObject(object);
    const children = this.sceneManager.piecesRoot.children;
    const current = children.indexOf(object);
    if (current === -1 || current === index) return;
    children.splice(current, 1);
    children.splice(Math.max(0, Math.min(index, children.length)), 0, object);
  }

  addPart(mesh: THREE.Mesh): void {
    this.addObject(mesh);
  }

  removePart(mesh: THREE.Object3D): void {
    const selectable = this.getSelectable(mesh);
    if (selectable) this.removeObject(selectable);
  }

  insertPart(mesh: THREE.Object3D, index: number): void {
    this.insertObject(mesh, index);
  }

  restoreParts(meshes: THREE.Mesh[], parents?: Map<THREE.Object3D, THREE.Object3D | null>): void {
    const fallback = this.sceneManager.piecesRoot;
    const wanted = new Set(meshes);

    for (const mesh of this.parts) {
      if (!wanted.has(mesh)) mesh.parent?.remove(mesh);
    }

    this.parts = [];
    for (const mesh of meshes) {
      const home = parents?.get(mesh);
      const parent = home?.parent != null || home === fallback ? home : fallback;
      if (parent && mesh.parent !== parent) parent.add(mesh);
      this.parts.push(mesh);
    }
    this._pruneEmptyGroups();
    this.sceneManager.requestRender();
  }

  private _pruneEmptyGroups(): void {
    const root = this.sceneManager.piecesRoot;
    for (const child of [...root.children]) {
      if (
        (child as THREE.Mesh).isMesh ||
        (child as THREE.Light).isLight ||
        (child as THREE.Camera).isCamera ||
        (child as THREE.Sprite).isSprite ||
        child.userData?.ignorePick
      ) {
        continue;
      }
      if (!this.modelManager.collectMeshes(child).length) root.remove(child);
    }
  }

  beginGesture(ndc: THREE.Vector2, camera: THREE.Camera): void {
    const startWorld = this._projectPoint(ndc, camera);
    this._gesture = {
      startNdc: ndc.clone(),
      endNdc: ndc.clone(),
      startWorld,
      endWorld: startWorld.clone(),
    };
    this._updatePreview(camera);
  }

  updateGesture(ndc: THREE.Vector2, camera: THREE.Camera): void {
    if (!this._gesture) return;
    this._gesture.endNdc.copy(ndc);
    this._gesture.endWorld = this._projectPoint(ndc, camera);
    this._updatePreview(camera);
  }

  endGesture(camera: THREE.Camera, screenDeltaPx: number): boolean {
    const gesture = this._gesture;
    this._gesture = null;
    this.hidePreview();

    if (!gesture || screenDeltaPx < MIN_DRAG_PX) {
      this._onMessage?.("Drag farther across the model to cut.");
      return false;
    }

    const plane = this.derivePlane(gesture.startWorld, gesture.endWorld, camera);
    if (!plane) {
      this._onMessage?.("Could not derive a cutting plane from that gesture.");
      return false;
    }

    return this.executeCut(plane);
  }

  cancelGesture(): void {
    this._gesture = null;
    this.hidePreview();
  }

  derivePlane(p1: THREE.Vector3, p2: THREE.Vector3, camera: THREE.Camera): THREE.Plane | null {
    this._dragDir.subVectors(p2, p1);
    if (this._dragDir.lengthSq() < 1e-10) return null;

    camera.getWorldDirection(this._viewDir);
    this._normal.crossVectors(this._dragDir, this._viewDir);
    if (this._normal.lengthSq() < 1e-10) {
      this._normal.crossVectors(this._dragDir, camera.up);
    }
    if (this._normal.lengthSq() < 1e-10) return null;

    this._normal.normalize();
    return new THREE.Plane().setFromNormalAndCoplanarPoint(this._normal, p1);
  }

  executeCut(worldPlane: THREE.Plane): boolean {
    const before = this.parts.slice();
    const nextParts: THREE.Mesh[] = [];
    const parents = new Map<THREE.Object3D, THREE.Object3D | null>();
    let splitCount = 0;
    const piecesRoot = this.sceneManager.piecesRoot;
    const reservedNames = this._usedNames();

    for (const mesh of before) {
      parents.set(mesh, mesh.parent);
      const result = this.cutter.cut(mesh, worldPlane);
      if (!result) {
        nextParts.push(mesh);
        continue;
      }

      mesh.updateWorldMatrix(true, false);
      mesh.matrixWorld.decompose(this._worldPos, this._worldQuat, this._worldScale);

      reservedNames.delete(mesh.name);
      const pieceA = this._makePiece(result.positive, mesh, this._worldPos, this._worldQuat, this._worldScale, reservedNames);
      const pieceB = this._makePiece(result.negative, mesh, this._worldPos, this._worldQuat, this._worldScale, reservedNames);

      this._separatePieces(pieceA, pieceB, worldPlane);

      piecesRoot.add(pieceA);
      piecesRoot.add(pieceB);
      parents.set(pieceA, piecesRoot);
      parents.set(pieceB, piecesRoot);
      mesh.parent?.remove(mesh);

      nextParts.push(pieceA, pieceB);
      splitCount++;
    }

    this.parts = nextParts;
    this._pruneEmptyGroups();
    this.sceneManager.requestRender();

    if (splitCount === 0) {
      this._onMessage?.("The plane missed the mesh. Try dragging across the object.");
      return false;
    }

    this._onMessage?.(
      splitCount === 1
        ? "Cut complete — click a piece to transform it."
        : `Cut ${splitCount} meshes — click a piece to transform it.`
    );
    this._onCut?.({ before, after: nextParts.slice(), parents });
    return true;
  }

  hidePreview(): void {
    this._previewLine.visible = false;
    this._previewPlane.visible = false;
    this.sceneManager.requestRender();
  }

  private _projectPoint(ndc: THREE.Vector2, camera: THREE.Camera): THREE.Vector3 {
    this._raycaster.setFromCamera(ndc, camera);
    const hits = this._raycaster.intersectObjects(this.parts, true);
    if (hits.length) return hits[0].point.clone();

    this._box.makeEmpty();
    for (const mesh of this.parts) this._box.expandByObject(mesh);
    const center = this._box.isEmpty()
      ? new THREE.Vector3()
      : this._box.getCenter(new THREE.Vector3());

    camera.getWorldDirection(this._viewDir);
    this._fallbackPlane.setFromNormalAndCoplanarPoint(this._viewDir, center);
    const point = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._fallbackPlane, point)) {
      return point;
    }
    return center;
  }

  private _updatePreview(camera: THREE.Camera): void {
    const g = this._gesture;
    if (!g) return;

    const positions = this._previewLine.geometry.attributes.position;
    positions.setXYZ(0, g.startWorld.x, g.startWorld.y, g.startWorld.z);
    positions.setXYZ(1, g.endWorld.x, g.endWorld.y, g.endWorld.z);
    positions.needsUpdate = true;
    this._previewLine.visible = true;

    const plane = this.derivePlane(g.startWorld, g.endWorld, camera);
    if (!plane) {
      this._previewPlane.visible = false;
      this.sceneManager.requestRender();
      return;
    }

    this._box.makeEmpty();
    for (const mesh of this.parts) this._box.expandByObject(mesh);
    const radius = this._box.isEmpty()
      ? 2
      : this._box.getSize(this._size).length() * 0.55;

    this._mid.addVectors(g.startWorld, g.endWorld).multiplyScalar(0.5);
    this._previewPlane.position.copy(this._mid);
    this._previewPlane.scale.set(radius, radius, 1);
    this._previewPlane.lookAt(this._tmpLookTarget.copy(this._mid).add(plane.normal));
    this._previewPlane.visible = true;
    this.sceneManager.requestRender();
  }

  private _createPreviewLine(): THREE.Line {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)
    );
    const material = new THREE.LineBasicMaterial({
      color: 0x7ec8ff,
      depthTest: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 10;
    line.frustumCulled = false;
    line.userData.ignorePick = true;
    return line;
  }

  private _createPreviewPlane(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x7ec8ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 9;
    mesh.userData.ignorePick = true;
    return mesh;
  }

  private _makePiece(
    geometry: THREE.BufferGeometry,
    sourceMesh: THREE.Mesh,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    scale: THREE.Vector3,
    reservedNames: Set<string>
  ): THREE.Mesh {
    const sourceMat = Array.isArray(sourceMesh.material)
      ? sourceMesh.material[0]
      : sourceMesh.material;

    const surfaceMat = sourceMat.clone();
    const capMat = new THREE.MeshStandardMaterial({
      color: CAP_COLOR,
      metalness: 0.35,
      roughness: 0.4,
      side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geometry, [surfaceMat, capMat]);
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);
    mesh.scale.copy(scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = this._nextCutName(sourceMesh, reservedNames);
    mesh.userData.draggable = true;
    return mesh;
  }

  private _usedNames(): Set<string> {
    const names = new Set<string>();
    this.sceneManager.piecesRoot.traverse((object) => {
      if (object.name) names.add(object.name);
    });
    return names;
  }

  private _cutBaseName(name: string): string {
    return this.modelManager.standardName(name);
  }

  private _nextCutName(sourceMesh: THREE.Mesh, reservedNames: Set<string>): string {
    const base = this._cutBaseName(sourceMesh.name);
    let name = base;
    let index = 1;
    while (reservedNames.has(name)) {
      name = `${base}${index}`;
      index++;
    }
    reservedNames.add(name);
    return name;
  }

  private _separatePieces(a: THREE.Object3D, b: THREE.Object3D, worldPlane: THREE.Plane): void {
    this._box.makeEmpty();
    this._box.expandByObject(a);
    const gap = Math.max(this._box.getSize(this._size).length() * 0.012, 0.012);
    const n = worldPlane.normal;
    a.position.addScaledVector(n, gap);
    b.position.addScaledVector(n, -gap);
  }

  private _disposeMesh(mesh: THREE.Mesh): void {
    mesh.geometry?.dispose();
  }

  disposeDetached(meshes: THREE.Object3D[]): void {
    for (const mesh of meshes) {
      if (!mesh || mesh.parent) continue;
      if ((mesh as THREE.Mesh).isMesh) this._disposeMesh(mesh as THREE.Mesh);
    }
  }
}
