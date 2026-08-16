import * as THREE from "three";
import { EditorState, EditorMode } from "./EditorState";
import { SceneManager } from "./SceneManager";
import { ModelManager } from "./ModelManager";
import { CutManager } from "./CutManager";
import { InteractionManager } from "./InteractionManager";
import { History } from "./History";
import { UI } from "./UI";
import type {
  HistoryCommand,
  ObjectEdit,
  SidebarSettings,
  CutRecord,
  ResourceKind,
  EditorModeName,
  CameraKind,
  HelperKey,
  ShadingMode,
} from "./types";

type TransformKind = "position" | "rotation" | "scale";
type MaterialBag = THREE.Material & Record<string, unknown>;
type WritableUuid = { uuid: string };
type Copyable = { copy: (value: THREE.Vector3 | THREE.Euler) => unknown };

const MATERIAL_CLASSES: Record<string, new () => THREE.Material> = {
  LineBasicMaterial: THREE.LineBasicMaterial,
  LineDashedMaterial: THREE.LineDashedMaterial,
  MeshBasicMaterial: THREE.MeshBasicMaterial,
  MeshDepthMaterial: THREE.MeshDepthMaterial,
  MeshNormalMaterial: THREE.MeshNormalMaterial,
  MeshLambertMaterial: THREE.MeshLambertMaterial,
  MeshMatcapMaterial: THREE.MeshMatcapMaterial,
  MeshPhongMaterial: THREE.MeshPhongMaterial,
  MeshToonMaterial: THREE.MeshToonMaterial,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
  MeshPhysicalMaterial: THREE.MeshPhysicalMaterial,
  ShadowMaterial: THREE.ShadowMaterial,
  SpriteMaterial: THREE.SpriteMaterial,
  PointsMaterial: THREE.PointsMaterial,
};

const MATERIAL_COPY_KEYS: readonly string[] = [
  "color",
  "emissive",
  "emissiveIntensity",
  "roughness",
  "metalness",
  "opacity",
  "transparent",
  "map",
  "emissiveMap",
  "alphaMap",
  "bumpMap",
  "bumpScale",
  "normalMap",
  "normalScale",
  "displacementMap",
  "displacementScale",
  "roughnessMap",
  "metalnessMap",
  "envMap",
  "lightMap",
  "aoMap",
  "aoMapIntensity",
  "side",
  "flatShading",
  "blending",
  "vertexColors",
  "wireframe",
  "depthTest",
  "depthWrite",
  "alphaTest",
  "forceSinglePass",
  "specular",
  "shininess",
  "reflectivity",
];

const COLOR_MAPS = new Set(["map", "emissiveMap", "sheenColorMap", "specularColorMap", "envMap"]);

interface ProjectFileJson {
  metadata?: { type?: string };
  camera?: unknown;
  scene?: unknown;
  gridVisible?: boolean;
  project?: {
    mode?: EditorModeName;
    modelId?: string;
    title?: string;
    editable?: boolean;
    cameraType?: CameraKind;
    shadows?: boolean;
    shadowType?: number;
    toneMapping?: number;
    toneMappingExposure?: number;
  };
}

/**
 * Wires systems together. Scene setup and UI never call MeshCutter directly.
 */
export class App {
  editorState: EditorState;
  ui: UI;
  history: History;
  started: boolean;
  sceneManager?: SceneManager;
  modelManager?: ModelManager;
  cutManager?: CutManager;
  interaction?: InteractionManager;
  _modeSnapshot: EditorModeName | null;
  _ignoreModeHistory: boolean;
  _disabledMaps: WeakMap<object, Record<string, unknown>>;
  _projectTitle: string;
  _projectEditable: boolean;
  _playing: boolean;

  constructor() {
    this.editorState = new EditorState();
    this.ui = new UI(this.editorState);
    this.history = new History();
    this.started = false;
    this._modeSnapshot = null;
    this._ignoreModeHistory = false;
    this._disabledMaps = new WeakMap();
    this._projectTitle = "";
    this._projectEditable = false;
    this._playing = false;

    this.history.onChange(() => this._syncHistoryUi());
    this._syncHistoryUi();

    this.ui.onStart(() => this.start());
    this.ui.onModeChange((mode: EditorModeName) => this._onMode(mode));
    this.ui.onModelChange((id: string) => this._loadModel(id));
    this.ui.onAdd((id: string) => this._addMesh(id));
    this.ui.onUpload((files: File[]) => this._uploadModel(files));
  }

  setActive(active: boolean): void {
    this.ui?.editor?.classList.toggle("active", active);
    if (active) this.sceneManager?.resize();
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    const canvas = document.querySelector("canvas.webgl") as HTMLCanvasElement;
    const viewport = document.querySelector("#viewport") as HTMLElement | null;
    this.sceneManager = new SceneManager(canvas, viewport);
    this.modelManager = new ModelManager(this.sceneManager);
    this.cutManager = new CutManager(this.sceneManager, this.modelManager);
    this.interaction = new InteractionManager(
      this.sceneManager,
      this.cutManager,
      this.editorState,
      this.ui
    );

    this.modelManager.onLoad((_root: THREE.Object3D, meshes: THREE.Mesh[]) => {
      this.cutManager!.setParts(meshes);
      this._refreshOutliner();
    });

    this.cutManager.onMessage((text: string) => {
      this.ui.setStatus(text);
      this._refreshOutliner();
    });
    this.cutManager.onCut((record: CutRecord) => this._recordCut(record));
    this.interaction.onTransform(
      (mesh: THREE.Object3D, from: THREE.Vector3 | THREE.Euler, to: THREE.Vector3 | THREE.Euler, kind: TransformKind) =>
        this._recordTransform(mesh, from, to, kind)
    );

    this.ui.onLayout(() => this.sceneManager!.resize());
    this.ui.onFrame(() => this.sceneManager!.fitCameraTo(this.sceneManager!.piecesRoot));
    this.ui.onToggleGrid((visible: boolean) => this.sceneManager!.setGridVisible(visible));
    this.ui.onToggleHelpers((key: HelperKey, visible: boolean) => this.sceneManager!.setHelperState(key, visible));
    this.ui.onSelectPart((mesh, options) => this.interaction!.selectMesh(mesh, options));
    this.ui.onNewEmpty(() => this._newEmpty());
    this.ui.onSave(() => this._saveProject());
    this.ui.onOpen(() => this._openProject());
    this.ui.onOpenProject((file: File) => this._loadProjectFile(file));
    this.ui.onExport((format: string) => this._exportScene(format));
    this.ui.onUndo(() => this._undo());
    this.ui.onRedo(() => this._redo());
    this.ui.onCenter(() => this._centerSelected());
    this.ui.onClone(() => this._cloneSelected());
    this.ui.onDelete(() => this._deleteSelected());
    this.ui.onObjectEdit((object: THREE.Object3D, change: ObjectEdit) => this._editObject(object, change));
    this.ui.onSceneEdit((settings: SidebarSettings) => this._editScene(settings));
    this.ui.onProjectEdit((settings: SidebarSettings) => this._editProject(settings));
    this.ui.onProjectPlay((playing: boolean) => this._setPlaying(playing));
    this.ui.onProjectPublish(() => this._publishProject());
    this.ui.onAssignResource((kind: ResourceKind, uuid: string) => this._assignResource(kind, uuid));
    this.ui.onClearHistory(() => this._clearHistory());
    this.ui.onViewportCamera((uuid: string) => this._setViewportCamera(uuid));
    this.ui.onViewportShading((mode: ShadingMode) => this.sceneManager!.setShading(mode));
    this.ui.onViewHelperClick((event: PointerEvent) => this.sceneManager!.handleViewHelperClick(event));
    this.ui.onSceneMap((target: string, file: File) => this._loadSceneMap(target, file));
    this.ui.syncSidebarSettings(this.sceneManager.getSidebarSettings());
    this.ui.markSceneMap("background", true);
    this.ui.markSceneMap("environment", true);
    this.ui.setViewportCameras(
      this.sceneManager.getViewportCameras(),
      this.sceneManager.viewportCamera
    );

    this.sceneManager.onRender((stats) => this.ui.setViewportInfo(stats));
    this.sceneManager.start();
    this._ignoreModeHistory = true;
    this._onMode(this.editorState.mode);
    this._ignoreModeHistory = false;
    this.modelManager.ensureDefaultLights();
    this.ui.setCatalog(this.modelManager.getCatalog(), "box");
    this._loadModel("box");
  }

  async _loadModel(id: string): Promise<void> {
    this.ui.setLoading(true);
    this.ui.setStatus("Loading…");
    this.interaction?.resetSelection();
    try {
      await this.modelManager!.load(id);
      const resolved = id === "cube" ? "box" : id;
      if (this.ui.modelSelect?.querySelector(`[value="${resolved}"]`)) {
        this.ui.modelSelect.value = resolved;
      }
      this.cutManager!.hidePreview();
      this.ui.hideScreenLine();
      this.history.clear();
      this.ui.setStatus("Model ready.");
      this.ui.setHint(
        this.editorState.isCut()
          ? "Drag across the model to cut · N to navigate"
          : "Orbit to look around · C to cut · click a piece to transform"
      );
    } catch (err) {
      console.error(err);
      this.ui.setStatus("Failed to load that model.");
    } finally {
      this.ui.setLoading(false);
    }
  }

  async _addMesh(id: string): Promise<void> {
    this.ui.setLoading(true, "Adding…");
    try {
      const added = await this.modelManager!.add(id);
      this.cutManager!.addObject(added.object);
      this.interaction?.selectMesh(added.object);
      this._refreshOutliner();
      this.history.push({
        label: "add",
        execute: () => {
          this.cutManager!.addObject(added.object);
          this.interaction!.selectMesh(added.object);
          this._refreshOutliner();
        },
        undo: () => {
          this.cutManager!.removeObject(added.object);
          this.interaction!.resetSelection();
          this._refreshOutliner();
        },
        dispose: () => this.cutManager!.disposeDetached(added.meshes),
      } satisfies HistoryCommand);
      this.ui.setStatus(`Added ${added.object.name || "mesh"}.`);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Could not add that mesh.";
      this.ui.setStatus(message);
    } finally {
      this.ui.setLoading(false);
    }
  }

  async _uploadModel(files: File[]): Promise<void> {
    this.ui.setLoading(true, "Loading upload…");
    this.ui.setStatus("Loading…");
    this.interaction?.resetSelection();
    try {
      const { id, name } = await this.modelManager!.addUpload(files);
      this.ui.setCatalog(this.modelManager!.getCatalog(), id);
      this.cutManager!.hidePreview();
      this.ui.hideScreenLine();
      this.history.clear();
      this.ui.setStatus(`Loaded ${name}.`);
      this.ui.setHint(
        this.editorState.isCut()
          ? "Drag across the model to cut · N to navigate"
          : "Orbit to look around · C to cut · click a piece to transform"
      );
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Could not read that model.";
      this.ui.setStatus(message);
    } finally {
      this.ui.setLoading(false);
    }
  }

  _saveProject(): void {
    const json = {
      metadata: {
        type: "GeometrySlicer",
        version: 1,
        generator: "Geometry Slicer",
      },
      project: {
        mode: this.editorState.mode,
        modelId: this.modelManager!.currentId,
        title: this._projectTitle,
        editable: this._projectEditable,
        cameraType: this.sceneManager!.cameraType,
        rendererType: this.sceneManager!.rendererType,
        antialias: this.sceneManager!.antialias,
        shadows: this.sceneManager!.renderer.shadowMap.enabled,
        shadowType: this.sceneManager!.renderer.shadowMap.type,
        toneMapping: this.sceneManager!.renderer.toneMapping,
        toneMappingExposure: this.sceneManager!.renderer.toneMappingExposure,
      },
      ...this.sceneManager!.toJSON(),
    };

    const name = this._fileTitle();
    this._downloadBlob(
      new Blob([JSON.stringify(json)], { type: "application/json" }),
      `${name}.json`
    );
    this.ui.setStatus(`Saved ${name}.json.`);
  }

  _openProject(): void {
    if (!confirm("Any unsaved data will be lost. Are you sure?")) return;
    this.ui.openProjectPicker();
  }

  async _loadProjectFile(file: File): Promise<void> {
    this.ui.setLoading(true, "Opening project…");
    this.ui.setStatus("Opening…");
    this.interaction?.resetSelection();
    try {
      const json = JSON.parse(await file.text()) as ProjectFileJson;
      if (!this._isProjectJson(json)) {
        throw new Error("That file is not a saved editor project.");
      }

      this.cutManager!.hidePreview();
      this.ui.hideScreenLine();
      this.history.clear();

      const object = await this.sceneManager!.fromJSON(json);
      if (object) {
        this.modelManager!.replaceFromObject(object, json.project?.modelId || "project");
      } else {
        this.modelManager!.clear();
        this.cutManager!.setParts([]);
      }

      const mode = json.project?.mode;
      this._ignoreModeHistory = true;
      if (mode) this.ui.setMode(mode);
      this._ignoreModeHistory = false;
      this._modeSnapshot = this.editorState.mode;
      this.ui.setGridChecked(json.gridVisible !== false);
      this._projectTitle = json.project?.title || "";
      this._projectEditable = Boolean(json.project?.editable);
      if (json.project?.cameraType) this.sceneManager!.setCameraType(json.project.cameraType);
      if (json.project?.shadows != null) this.sceneManager!.setShadows(json.project.shadows);
      if (json.project?.shadowType != null) this.sceneManager!.setShadowType(json.project.shadowType);
      if (json.project?.toneMapping != null) this.sceneManager!.setToneMapping(json.project.toneMapping);
      if (json.project?.toneMappingExposure != null) {
        this.sceneManager!.setToneMappingExposure(json.project.toneMappingExposure);
      }
      this.ui.syncSidebarSettings({
        ...this.sceneManager!.getSidebarSettings(),
        title: this._projectTitle,
        editable: this._projectEditable,
      });

      const modelId = json.project?.modelId;
      if (modelId && this.ui.modelSelect?.querySelector(`[value="${modelId}"]`)) {
        this.ui.modelSelect.value = modelId;
      } else if (this.ui.modelSelect) {
        this.ui.modelSelect.selectedIndex = -1;
      }

      this.ui.setStatus("Project loaded.");
      this.ui.setHint(
        this.editorState.isCut()
          ? "Drag across the model to cut · N to navigate"
          : "Orbit to look around · C to cut · click a piece to transform"
      );
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Failed to open that project.";
      this.ui.setStatus(message);
    } finally {
      this.ui.setLoading(false);
    }
  }

  _isProjectJson(json: unknown): boolean {
    if (!json || typeof json !== "object") return false;
    const data = json as ProjectFileJson;
    if (data.metadata?.type === "GeometrySlicer") return true;
    return Boolean(data.camera && data.scene);
  }

  _newEmpty(): void {
    if (!confirm("Any unsaved data will be lost. Are you sure?")) return;
    this.interaction?.resetSelection();
    this.cutManager!.hidePreview();
    this.ui.hideScreenLine();
    this.modelManager!.clear();
    this.modelManager!.ensureDefaultLights();
    this.cutManager!.setParts([]);
    this.history.clear();
    this.sceneManager!.resetCamera();
    this._refreshOutliner();
    if (this.ui.modelSelect) this.ui.modelSelect.selectedIndex = -1;
    this.ui.setStatus("Empty scene.");
    this.sceneManager!.requestRender();
    this.ui.setHint("Add a shape or import a model to start cutting.");
  }

  async _exportScene(format: string): Promise<void> {
    const parts = this.cutManager!.getParts();
    if (!parts.length) {
      this.ui.setStatus("Nothing to export.");
      return;
    }

    const root = this.sceneManager!.piecesRoot;
    try {
      if (format === "obj") {
        const { OBJExporter } = await import("three/addons/exporters/OBJExporter.js");
        const text = new OBJExporter().parse(root);
        this._downloadBlob(new Blob([text], { type: "text/plain" }), "scene.obj");
      } else if (format === "usdz") {
        const { USDZExporter } = await import("three/addons/exporters/USDZExporter.js");
        const result = await new USDZExporter().parseAsync(root);
        this._downloadBlob(
          new Blob([result as BlobPart], { type: "model/vnd.usdz+zip" }),
          "scene.usdz"
        );
      } else {
        const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
        const binary = format === "glb";
        const result = await new Promise<ArrayBuffer | { [key: string]: unknown }>((resolve, reject) => {
          new GLTFExporter().parse(root, resolve, reject, { binary });
        });
        if (binary) {
          this._downloadBlob(new Blob([result as ArrayBuffer], { type: "application/octet-stream" }), "scene.glb");
        } else {
          this._downloadBlob(
            new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
            "scene.gltf"
          );
        }
      }
      this.ui.setStatus(`Exported scene.${format}.`);
    } catch (err) {
      console.error(err);
      this.ui.setStatus("Export failed.");
    }
  }

  _downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  _onMode(mode: EditorModeName): void {
    this.cutManager?.cancelGesture();
    this.ui.hideScreenLine();
    this.interaction?.syncOrbitToMode();

    if (mode === EditorMode.CUT) {
      this.ui.setHint("Drag across the model to cut · N to navigate");
    } else {
      this.ui.setHint("Orbit to look around · C to cut · click a piece to transform");
    }

    const from = this._modeSnapshot;
    this._modeSnapshot = mode;
    if (this._ignoreModeHistory || from == null || from === mode) return;

    const apply = (next: EditorModeName): void => {
      this._ignoreModeHistory = true;
      this.ui.setMode(next);
      this._ignoreModeHistory = false;
      this._modeSnapshot = next;
    };

    this.history.push({
      label: "mode",
      execute: () => apply(mode),
      undo: () => apply(from),
    } satisfies HistoryCommand);
  }

  _syncHistoryUi(): void {
    this.ui.setHistoryState({
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      undos: this.history.undos,
      redos: this.history.redos,
    });
  }

  _clearHistory(): void {
    if (!this.history.canUndo() && !this.history.canRedo()) return;
    if (!confirm("Clear undo history?")) return;
    this.history.clear();
    this.ui.setStatus("History cleared.");
  }

  _editScene(settings: SidebarSettings): void {
    this.sceneManager!.setSceneAppearance(settings);
  }

  async _loadSceneMap(target: string, file: File): Promise<void> {
    try {
      await this.sceneManager!.loadEquirect(file, target);
      this.ui.markSceneMap(target, true);
      this.ui.setStatus(`Loaded ${file.name}.`);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Could not load that map.";
      this.ui.setStatus(message);
    }
  }

  _setViewportCamera(uuid: string): void {
    const camera = this.sceneManager!.getViewportCameras().find((item) => item.uuid === uuid);
    this.sceneManager!.setViewportCamera(camera);
  }

  async _editProject(settings: SidebarSettings): Promise<void> {
    this._projectTitle = settings.title ?? this._projectTitle;
    this._projectEditable = Boolean(settings.editable);

    if (settings.cameraType && settings.cameraType !== this.sceneManager!.cameraType) {
      const camera = this.sceneManager!.setCameraType(settings.cameraType);
      if (this.interaction?.transformControls) {
        this.interaction.transformControls.camera = camera;
      }
      this._refreshOutliner();
    }

    if (settings.antialias !== this.sceneManager!.antialias) {
      await this.sceneManager!.recreateRenderer({ antialias: settings.antialias });
    }

    this.sceneManager!.setShadows(settings.shadows as boolean);
    this.sceneManager!.setShadowType(settings.shadowType as number);
    this.sceneManager!.setToneMapping(settings.toneMapping as number);
    this.sceneManager!.setToneMappingExposure(settings.exposure as number);
  }

  _setPlaying(playing: boolean): void {
    this._playing = Boolean(playing);
    this.ui.setPlaying(this._playing);
    this.sceneManager!.setPlaying(this._playing);
    this.interaction?.setEnabled(!this._playing);
    this.sceneManager!.resize();
    this.sceneManager!.requestRender();
    this.ui.setStatus(this._playing ? "Playing." : "Stopped.");
  }

  async _publishProject(): Promise<void> {
    const root = this.sceneManager!.piecesRoot;
    if (!root.children.length) {
      this.ui.setStatus("Nothing to publish.");
      return;
    }

    this.ui.setLoading(true, "Publishing…");
    try {
      const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
      const { zipSync, strToU8 } = await import("three/addons/libs/fflate.module.js");
      const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
        new GLTFExporter().parse(
          root,
          (result) => resolve(result as ArrayBuffer),
          reject,
          { binary: true }
        );
      });
      const title = this._fileTitle();
      const html = this._publishHtml(title);
      const zip = zipSync({
        "index.html": strToU8(html),
        "scene.glb": new Uint8Array(glb),
      }, { level: 6 }) as Uint8Array;
      this._downloadBlob(new Blob([zip as BlobPart], { type: "application/zip" }), `${title}.zip`);
      this.ui.setStatus(`Published ${title}.zip.`);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Could not publish.";
      this.ui.setStatus(message);
    } finally {
      this.ui.setLoading(false);
    }
  }

  _publishHtml(title: string): string {
    const edit = this._projectEditable
      ? `<a href="#" style="position:absolute;bottom:20px;right:20px;padding:10px 16px;color:#fff;border:1px solid #fff;border-radius:20px;text-decoration:none;">EDIT</a>`
      : "";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>html,body{margin:0;height:100%;overflow:hidden;background:#111}canvas{display:block}</style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.183.2/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.183.2/examples/jsm/"
    }
  }
  </script>
</head>
<body>
${edit}
<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 10000);
camera.position.set(0, 5, 10);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(5, 10, 7.5);
scene.add(key);
new GLTFLoader().load("./scene.glb", (gltf) => {
  scene.add(gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0, radius * 0.6, radius * 2.2));
  }
});
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
(function tick() {
  requestAnimationFrame(tick);
  controls.update();
  renderer.render(scene, camera);
})();
</script>
</body>
</html>`;
  }

  _assignResource(kind: ResourceKind, uuid: string): void {
    const object = this.interaction?.selected;
    if (!object) {
      this.ui.setStatus("Select a mesh first.");
      return;
    }
    const mesh = object as THREE.Mesh;
    const { geometries, materials } = this.sceneManager!.collectResources();
    if (kind === "geometries" && mesh.geometry) {
      const geometry = geometries.find((item) => item.uuid === uuid);
      if (!geometry) return;
      mesh.geometry = geometry;
      this.ui.setStatus("Assigned geometry.");
    } else if (kind === "materials" && mesh.material) {
      const material = materials.find((item) => item.uuid === uuid);
      if (!material) return;
      if (Array.isArray(object.userData._originalMaterial)) {
        object.userData._originalMaterial[0] = material;
      } else if (object.userData._originalMaterial) {
        object.userData._originalMaterial = material;
      }
      if (this.sceneManager!.shading === "solid") mesh.material = material;
      this.ui.setStatus("Assigned material.");
    }
    this.interaction?.updateHelpers();
    this._refreshOutliner();
    this.sceneManager!.requestRender();
  }

  _fileTitle(): string {
    const title = String(this._projectTitle || "").trim();
    return title || "untitled";
  }

  _editObject(object: THREE.Object3D | null | undefined, change: ObjectEdit | null | undefined): void {
    if (!object || !change) return;

    if (change.kind === "position" || change.kind === "scale") {
      object[change.kind][change.axis as "x" | "y" | "z"] = change.value as number;
    } else if (change.kind === "rotation") {
      object.rotation[change.axis as "x" | "y" | "z"] = change.value as number;
    } else if (change.kind === "name") {
      object.name = change.value as string;
      this._refreshOutliner();
    } else if (change.kind === "visible") {
      object.visible = change.value as boolean;
    } else if (change.kind === "frustumCulled") {
      object.frustumCulled = change.value as boolean;
    } else if (change.kind === "renderOrder") {
      object.renderOrder = change.value as number;
    } else if (change.kind === "uuid") {
      (object as WritableUuid).uuid = THREE.MathUtils.generateUUID();
      this.ui.refreshProperties(object);
    } else if (change.kind === "lightColor" && (object as THREE.Light).color) {
      (object as THREE.Light).color.set(change.value as THREE.ColorRepresentation);
    } else if (change.kind === "lightIntensity") {
      (object as THREE.Light).intensity = change.value as number;
    } else if (change.kind === "castShadow") {
      object.castShadow = change.value as boolean;
      if (!(object as THREE.Light).isLight) {
        object.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).castShadow = change.value as boolean;
        });
      }
      this.sceneManager!.renderer.shadowMap.needsUpdate = true;
    } else if (change.kind === "receiveShadow") {
      object.receiveShadow = change.value as boolean;
      if (!(object as THREE.Light).isLight) {
        object.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh) (child as THREE.Mesh).receiveShadow = change.value as boolean;
        });
      }
      this.sceneManager!.renderer.shadowMap.needsUpdate = true;
    } else if (change.kind === "shadowIntensity" && (object as THREE.DirectionalLight).shadow) {
      (object as THREE.DirectionalLight).shadow.intensity = change.value as number;
    } else if (change.kind === "shadowBias" && (object as THREE.DirectionalLight).shadow) {
      (object as THREE.DirectionalLight).shadow.bias = change.value as number;
    } else if (change.kind === "shadowNormalBias" && (object as THREE.DirectionalLight).shadow) {
      (object as THREE.DirectionalLight).shadow.normalBias = change.value as number;
    } else if (change.kind === "shadowRadius" && (object as THREE.DirectionalLight).shadow) {
      (object as THREE.DirectionalLight).shadow.radius = change.value as number;
    } else if (change.kind === "fov") {
      (object as THREE.PerspectiveCamera).fov = change.value as number;
      (object as THREE.PerspectiveCamera).updateProjectionMatrix?.();
    } else if (change.kind === "near") {
      (object as THREE.PerspectiveCamera).near = change.value as number;
      (object as THREE.PerspectiveCamera).updateProjectionMatrix?.();
    } else if (change.kind === "far") {
      (object as THREE.PerspectiveCamera).far = change.value as number;
      (object as THREE.PerspectiveCamera).updateProjectionMatrix?.();
    } else if (change.kind === "material") {
      this._editMaterial(object, change);
    }

    this.interaction?.updateHelpers();
    this.sceneManager!.requestRender();
  }

  _objectMaterial(object: THREE.Object3D, slot = 0): THREE.Material | null {
    const mesh = object as THREE.Mesh;
    const source = (object.userData?._originalMaterial ?? mesh.material) as
      | THREE.Material
      | THREE.Material[]
      | null
      | undefined;
    if (Array.isArray(source)) return source[slot] ?? source[0] ?? null;
    return source ?? null;
  }

  _setObjectMaterial(object: THREE.Object3D, slot: number, material: THREE.Material): void {
    const stored = object.userData?._originalMaterial as THREE.Material | THREE.Material[] | undefined;
    if (stored) {
      if (Array.isArray(stored)) stored[slot] = material;
      else object.userData._originalMaterial = material;
    }
    const mesh = object as THREE.Mesh;
    if (this.sceneManager!.shading === "solid") {
      if (Array.isArray(mesh.material)) mesh.material[slot] = material;
      else mesh.material = material;
      if (!stored) object.userData._originalMaterial = mesh.material;
    }
  }

  _editMaterial(object: THREE.Object3D, change: ObjectEdit): void {
    const material = this._objectMaterial(object, change.slot);
    if (!material) return;
    const keyed = material as MaterialBag;

    if (change.action === "type") {
      const next = this._convertMaterial(material, change.value as string);
      if (next) {
        this._setObjectMaterial(object, change.slot ?? 0, next);
        this.ui.refreshProperties(object);
      }
    } else if (change.action === "uuid") {
      (material as WritableUuid).uuid = THREE.MathUtils.generateUUID();
      this.ui.refreshProperties(object);
    } else if (change.action === "name") {
      material.name = change.value as string;
      this._refreshOutliner();
    } else if (change.action === "color" && (keyed[change.property as string] as { set?: (v: unknown) => void })?.set) {
      (keyed[change.property as string] as THREE.Color).set(change.value as THREE.ColorRepresentation);
    } else if (change.action === "value") {
      keyed[change.property as string] = change.value;
      material.needsUpdate = true;
    } else if (change.action === "vector" && keyed[change.property as string]) {
      (keyed[change.property as string] as THREE.Vector2)[change.axis as "x" | "y"] = change.value as number;
    } else if (change.action === "toggleMap") {
      this._toggleMaterialMap(material, change.property as string, change.enabled);
      this.ui.refreshProperties(object);
    } else if (change.action === "loadMap") {
      this._loadMaterialMap(object, material, change.property as string, change.file as File);
      return;
    } else if (change.action === "texture") {
      this._applyTextureSettings(material, change);
    }

    this.sceneManager!.requestRender();
  }

  _convertMaterial(current: THREE.Material, type: string): THREE.Material | null {
    const MaterialClass = MATERIAL_CLASSES[type];
    if (!MaterialClass || current.type === type) return null;
    const next = new MaterialClass();
    const from = current as MaterialBag;
    const to = next as MaterialBag;
    for (const key of MATERIAL_COPY_KEYS) {
      if (!(key in current) || !(key in next)) continue;
      const value = from[key] as { isTexture?: boolean; clone?: () => unknown } | null | undefined;
      if (value == null) continue;
      if (value.isTexture) to[key] = value;
      else if (value.clone) to[key] = value.clone();
      else to[key] = value;
    }
    next.name = current.name;
    (next as WritableUuid).uuid = current.uuid;
    return next;
  }

  _toggleMaterialMap(material: THREE.Material, property: string, enabled?: boolean): void {
    const keyed = material as MaterialBag;
    if (enabled) {
      const stored = this._disabledMaps.get(material)?.[property];
      if (stored) keyed[property] = stored;
    } else if (keyed[property]) {
      let maps = this._disabledMaps.get(material);
      if (!maps) {
        maps = {};
        this._disabledMaps.set(material, maps);
      }
      maps[property] = keyed[property];
      keyed[property] = null;
    }
    material.needsUpdate = true;
  }

  async _loadMaterialMap(
    object: THREE.Object3D,
    material: THREE.Material,
    property: string,
    file: File
  ): Promise<void> {
    try {
      const url = URL.createObjectURL(file);
      const texture = await new THREE.TextureLoader().loadAsync(url);
      if (COLOR_MAPS.has(property) && texture.colorSpace !== THREE.SRGBColorSpace) {
        texture.colorSpace = THREE.SRGBColorSpace;
      }
      if (property === "envMap") texture.mapping = THREE.EquirectangularReflectionMapping;
      (material as MaterialBag)[property] = texture;
      material.needsUpdate = true;
      this.ui.refreshProperties(object);
      this.ui.setStatus(`Loaded ${file.name}.`);
      this.sceneManager!.requestRender();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Could not load that texture.";
      this.ui.setStatus(message);
    }
  }

  _applyTextureSettings(material: THREE.Material, change: ObjectEdit): void {
    const texture = (material as MaterialBag)[change.property as string] as THREE.Texture | undefined;
    if (!texture) return;
    texture.repeat.set(change.repeatX as number, change.repeatY as number);
    texture.offset.set(change.offsetX as number, change.offsetY as number);
    texture.wrapS = change.wrap as THREE.Wrapping;
    texture.wrapT = change.wrap as THREE.Wrapping;
    texture.flipY = change.flipY as boolean;
    texture.colorSpace = change.colorSpace as THREE.ColorSpace;
    texture.needsUpdate = true;
    material.needsUpdate = true;
  }

  _refreshOutliner(): void {
    this.sceneManager!.setShading(this.sceneManager!.shading);
    this.ui.setOutliner(this.cutManager!.getObjects(), this.interaction?.selected, {
      camera: this.sceneManager!.camera,
      scene: this.sceneManager!.scene,
      cameras: this.sceneManager!.getViewportCameras(),
      viewportCamera: this.sceneManager!.viewportCamera,
    });
    this.ui.setResources(this.sceneManager!.collectResources(), this.interaction?.selected);
  }

  _selectedMesh(): THREE.Object3D | null {
    return this.interaction?.selected ?? null;
  }

  _undo(): void {
    const command = this.history.undo();
    if (!command) return;
    this.ui.setStatus(command.label ? `Undo ${command.label}.` : "Undo.");
  }

  _redo(): void {
    const command = this.history.redo();
    if (!command) return;
    this.ui.setStatus(command.label ? `Redo ${command.label}.` : "Redo.");
  }

  _recordCut(record: CutRecord): void {
    this.history.push({
      label: "cut",
      execute: () => {
        this.cutManager!.restoreParts(record.after, record.parents);
        this.interaction!.resetSelection();
        this._refreshOutliner();
      },
      undo: () => {
        this.cutManager!.restoreParts(record.before, record.parents);
        this.interaction!.resetSelection();
        this._refreshOutliner();
      },
      dispose: () => {
        this.cutManager!.disposeDetached([...record.before, ...record.after]);
      },
    } satisfies HistoryCommand);
  }

  _recordTransform(
    mesh: THREE.Object3D,
    from: THREE.Vector3 | THREE.Euler,
    to: THREE.Vector3 | THREE.Euler,
    kind: TransformKind = "position"
  ): void {
    const labels: Record<TransformKind, string> = { position: "move", rotation: "rotate", scale: "scale" };
    this.history.push({
      label: labels[kind] || "move",
      execute: () => {
        (mesh[kind] as Copyable).copy(to);
        this.interaction!.updateHelpers();
      },
      undo: () => {
        (mesh[kind] as Copyable).copy(from);
        this.interaction!.updateHelpers();
      },
    } satisfies HistoryCommand);
  }

  _centerSelected(): void {
    const mesh = this._selectedMesh();
    if (!mesh) {
      this.ui.setStatus("Select an object to center.");
      return;
    }

    const oldPosition = mesh.position.clone();
    const aabb = new THREE.Box3().setFromObject(mesh);
    const center = aabb.getCenter(new THREE.Vector3());
    const newPosition = oldPosition.clone().sub(center);

    this.history.execute({
      label: "center",
      execute: () => {
        mesh.position.copy(newPosition);
        this.interaction!.updateHelpers();
      },
      undo: () => {
        mesh.position.copy(oldPosition);
        this.interaction!.updateHelpers();
      },
    } satisfies HistoryCommand);
    this.ui.setStatus("Centered object.");
  }

  _cloneSelected(): void {
    const source = this._selectedMesh();
    if (!source) {
      this.ui.setStatus("Select an object to clone.");
      return;
    }

    const cloned = this.modelManager!.cloneObject(source);

    this.history.execute({
      label: "clone",
      execute: () => {
        this.cutManager!.addObject(cloned);
        this.interaction!.selectMesh(cloned);
        this._refreshOutliner();
      },
      undo: () => {
        this.cutManager!.removeObject(cloned);
        this.interaction!.selectMesh(source);
        this._refreshOutliner();
      },
    } satisfies HistoryCommand);
    this.ui.setStatus("Cloned object.");
  }

  _deleteSelected(): void {
    const object = this._selectedMesh();
    if (!object) {
      this.ui.setStatus("Select an object to delete.");
      return;
    }

    const index = this.cutManager!.getObjects().indexOf(object);
    this.history.execute({
      label: "delete",
      execute: () => {
        this.cutManager!.removeObject(object);
        this.interaction!.resetSelection();
        this._refreshOutliner();
      },
      undo: () => {
        this.cutManager!.insertObject(object, index);
        this.interaction!.selectMesh(object);
        this._refreshOutliner();
      },
    } satisfies HistoryCommand);
    this.ui.setStatus("Deleted object.");
  }
}
