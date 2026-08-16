import type * as THREE from "three";
import { EditorMode, EditorState } from "./EditorState";
import { MODELS } from "./ModelManager";
import type {
  EditorModeName,
  HelperKey,
  ObjectEdit,
  OutlinerEntry,
  OutlinerMeta,
  PropertyTab,
  ResourceKind,
  SelectOptions,
  ShadingMode,
  SidebarSettings,
  ViewportStats,
} from "./types";

const MESH_MATERIAL_TYPES: string[] = [
  "MeshBasicMaterial",
  "MeshDepthMaterial",
  "MeshNormalMaterial",
  "MeshLambertMaterial",
  "MeshMatcapMaterial",
  "MeshPhongMaterial",
  "MeshToonMaterial",
  "MeshStandardMaterial",
  "MeshPhysicalMaterial",
  "ShadowMaterial",
];

const SPRITE_MATERIAL_TYPES: string[] = ["SpriteMaterial"];
const POINTS_MATERIAL_TYPES: string[] = ["PointsMaterial"];
const LINE_MATERIAL_TYPES: string[] = ["LineBasicMaterial", "LineDashedMaterial"];

type SceneObj = THREE.Object3D & {
  isMesh?: boolean;
  isLight?: boolean;
  isCamera?: boolean;
  isSprite?: boolean;
  isScene?: boolean;
  isGroup?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isPerspectiveCamera?: boolean;
  isOrthographicCamera?: boolean;
  isAmbientLight?: boolean;
  isDirectionalLight?: boolean;
  isHemisphereLight?: boolean;
  isPointLight?: boolean;
  isSpotLight?: boolean;
  isSkinnedMesh?: boolean;
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
  intensity?: number;
  color?: THREE.Color;
  shadow?: { intensity?: number; bias?: number; normalBias?: number; radius?: number };
  fov?: number;
  near?: number;
  far?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
};

type MaterialProps = THREE.Material & Record<string, any>;
type CatalogItem = { id: string; name: string; type?: string };
type HistoryItem = { label?: string };
type ResourceBag = {
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
};

/**
 * DOM layer only. Talks to the app through callbacks — no geometry code.
 */
export class UI {
  editorState: EditorState;
  home: HTMLElement | null;
  editor: HTMLElement | null;
  viewport: HTMLElement | null;
  sidebar: HTMLElement | null;
  resizer: HTMLElement | null;
  menubar: HTMLElement | null;
  modeLabel: HTMLElement | null;
  settingMode: HTMLSelectElement | null;
  hint: HTMLElement | null;
  status: HTMLElement | null;
  modelSelect: HTMLSelectElement | null;
  btnNavigate: HTMLButtonElement | null;
  btnCut: HTMLButtonElement | null;
  btnStart: HTMLButtonElement | null;
  btnUpload: HTMLButtonElement | null;
  modelUpload: HTMLInputElement | null;
  projectOpen: HTMLInputElement | null;
  dropOverlay: HTMLElement | null;
  loading: HTMLElement | null;
  screenLine: HTMLElement | null;
  outliner: HTMLElement | null;
  menuGrid: HTMLElement | null;
  menuCameraHelpers: HTMLElement | null;
  menuLightHelpers: HTMLElement | null;
  menuSkeletonHelpers: HTMLElement | null;
  menuUndo: HTMLElement | null;
  menuRedo: HTMLElement | null;
  menuNavigate: HTMLElement | null;
  menuCut: HTMLElement | null;
  settingGrid: HTMLInputElement | null;
  settingCameraHelpers: HTMLInputElement | null;
  settingLightHelpers: HTMLInputElement | null;
  settingSkeletonHelpers: HTMLInputElement | null;
  properties: HTMLElement | null;
  propertiesTabs: HTMLElement | null;
  tabGeometry: HTMLElement | null;
  tabMaterial: HTMLElement | null;
  propType: HTMLElement | null;
  propUuid: HTMLInputElement | null;
  propUuidNew: HTMLButtonElement | null;
  propName: HTMLInputElement | null;
  propVisible: HTMLInputElement | null;
  propFrustumCulled: HTMLInputElement | null;
  propRenderOrder: HTMLInputElement | null;
  propCastShadow: HTMLInputElement | null;
  propReceiveShadow: HTMLInputElement | null;
  propReceiveShadowLabel: HTMLElement | null;
  propCamera: HTMLElement | null;
  propMatSlotRow: HTMLElement | null;
  propMatSlot: HTMLSelectElement | null;
  propMatType: HTMLSelectElement | null;
  propMatUuid: HTMLInputElement | null;
  propMatUuidNew: HTMLButtonElement | null;
  propMatName: HTMLInputElement | null;
  propMatMapFile: HTMLInputElement | null;
  matTexSettings: HTMLElement | null;
  matTexSettingsTitle: HTMLElement | null;
  sceneBackgroundType: HTMLSelectElement | null;
  sceneBackground: HTMLInputElement | null;
  sceneBackgroundMap: HTMLButtonElement | null;
  sceneBackgroundMapFile: HTMLInputElement | null;
  sceneBackgroundColorSpace: HTMLSelectElement | null;
  sceneBackgroundColorSpaceRow: HTMLElement | null;
  sceneBackgroundEquirectRow: HTMLElement | null;
  sceneBackgroundBlur: HTMLInputElement | null;
  sceneBackgroundIntensity: HTMLInputElement | null;
  sceneBackgroundRotation: HTMLInputElement | null;
  sceneEnvironmentType: HTMLSelectElement | null;
  sceneEnvironmentMap: HTMLButtonElement | null;
  sceneEnvironmentMapFile: HTMLInputElement | null;
  sceneFogType: HTMLSelectElement | null;
  sceneFogFields: HTMLElement | null;
  sceneFogColor: HTMLInputElement | null;
  sceneFogNear: HTMLInputElement | null;
  sceneFogFar: HTMLInputElement | null;
  sceneFogDensity: HTMLInputElement | null;
  viewportCamera: HTMLSelectElement | null;
  viewportShading: HTMLSelectElement | null;
  viewHelper: HTMLElement | null;
  projectCamera: HTMLSelectElement | null;
  projectAntialias: HTMLInputElement | null;
  projectShadows: HTMLInputElement | null;
  projectShadowType: HTMLSelectElement | null;
  projectToneMapping: HTMLSelectElement | null;
  projectExposure: HTMLInputElement | null;
  projectTitle: HTMLInputElement | null;
  projectEditable: HTMLInputElement | null;
  projectPlay: HTMLButtonElement | null;
  projectPublish: HTMLButtonElement | null;
  playerStop: HTMLButtonElement | null;
  resourceTabs: HTMLElement | null;
  resourceList: HTMLElement | null;
  resourceAssign: HTMLButtonElement | null;
  resourceCount: HTMLElement | null;
  historyList: HTMLElement | null;
  btnClearHistory: HTMLButtonElement | null;
  infoObjects: HTMLElement | null;
  infoVertices: HTMLElement | null;
  infoTriangles: HTMLElement | null;
  infoFrametime: HTMLElement | null;
  infoObjectsLabel: HTMLElement | null;
  infoVerticesLabel: HTMLElement | null;
  infoTrianglesLabel: HTMLElement | null;
  sidebarWidth: number;
  _parts: THREE.Object3D[];
  _selected: THREE.Object3D | null;
  _onStart: (() => void) | null;
  _onMode: ((mode: EditorModeName) => void) | null;
  _onModel: ((id: string) => void) | null;
  _onUpload: ((files: File[]) => void) | null;
  _onAdd: ((id: string) => void) | null;
  _onLayout: (() => void) | null;
  _onFrame: (() => void) | null;
  _onToggleGrid: ((visible: boolean) => void) | null;
  _onToggleHelpers: ((key: HelperKey, visible: boolean) => void) | null;
  _onSelectPart: ((mesh: THREE.Object3D | null, options?: SelectOptions) => void) | null;
  _onNewEmpty: (() => void) | null;
  _onSave: (() => void) | null;
  _onExport: ((format: string) => void) | null;
  _onOpen: (() => void) | null;
  _onOpenProject: ((file: File) => void) | null;
  _onUndo: (() => void) | null;
  _onRedo: (() => void) | null;
  _onCenter: (() => void) | null;
  _onClone: (() => void) | null;
  _onDelete: (() => void) | null;
  _onObjectEdit: ((object: THREE.Object3D, change: ObjectEdit) => void) | null;
  _onSceneEdit: ((settings: SidebarSettings) => void) | null;
  _onProjectEdit: ((settings: SidebarSettings) => void) | null;
  _onProjectPlay: ((playing: boolean) => void) | null;
  _onProjectPublish: (() => void) | null;
  _onAssignResource: ((kind: ResourceKind, uuid: string) => void) | null;
  _onClearHistory: (() => void) | null;
  _onViewportCamera: ((uuid: string) => void) | null;
  _onViewportShading: ((mode: ShadingMode) => void) | null;
  _onViewHelperClick: ((event: PointerEvent) => void) | null;
  _onSceneMap: ((target: string, file: File) => void) | null;
  _fillingProperties: boolean;
  _materialSlot: number;
  _pendingMapProperty: string | null;
  _textureSettingsProperty: string | null;
  _mapCache: WeakMap<object, Record<string, THREE.Texture>>;
  _resourceKind: ResourceKind;
  _resourceSelected: string | null;
  _resources: ResourceBag;
  _outlinerEntries: OutlinerEntry[];
  _outlinerMeta: OutlinerMeta;
  _outlinerFocus: PropertyTab;
  _sceneOpen: boolean;

  constructor(editorState: EditorState) {
    this.editorState = editorState;

    const root = document.querySelector("#editor");
    const $ = (sel: string): any => root?.querySelector(sel);

    this.home = document.querySelector("#home") as HTMLElement | null;
    this.editor = root as HTMLElement | null;
    this.viewport = $("#viewport");
    this.sidebar = $("#sidebar");
    this.resizer = $("#resizer");
    this.menubar = $("#menubar");
    this.modeLabel = $("#mode-label");
    this.settingMode = $("#setting-mode");
    this.hint = $("#hint");
    this.status = $("#status");
    this.modelSelect = $("#model-select");
    this.btnNavigate = $("#btn-navigate");
    this.btnCut = $("#btn-cut");
    this.btnStart = $("#btn-start");
    this.btnUpload = $("#btn-upload");
    this.modelUpload = $("#model-upload");
    this.projectOpen = $("#project-open");
    this.dropOverlay = $("#drop-overlay");
    this.loading = $("#loading");
    this.screenLine = $("#cut-line");
    this.outliner = $("#outliner");
    this.menuGrid = $("#menu-grid");
    this.menuCameraHelpers = $("#menu-camera-helpers");
    this.menuLightHelpers = $("#menu-light-helpers");
    this.menuSkeletonHelpers = $("#menu-skeleton-helpers");
    this.menuUndo = $("#menu-undo");
    this.menuRedo = $("#menu-redo");
    this.menuNavigate = $("#menu-navigate");
    this.menuCut = $("#menu-cut");
    this.settingGrid = $("#setting-grid");
    this.settingCameraHelpers = $("#setting-camera-helpers");
    this.settingLightHelpers = $("#setting-light-helpers");
    this.settingSkeletonHelpers = $("#setting-skeleton-helpers");
    this.properties = $("#properties");
    this.propertiesTabs = $("#properties-tabs");
    this.tabGeometry = $("#tab-geometry");
    this.tabMaterial = $("#tab-material");
    this.propType = $("#prop-type");
    this.propUuid = $("#prop-uuid");
    this.propUuidNew = $("#prop-uuid-new");
    this.propName = $("#prop-name");
    this.propVisible = $("#prop-visible");
    this.propFrustumCulled = $("#prop-frustum-culled");
    this.propRenderOrder = $("#prop-render-order");
    this.propCastShadow = $("#prop-cast-shadow");
    this.propReceiveShadow = $("#prop-receive-shadow");
    this.propReceiveShadowLabel = $("#prop-receive-shadow-label");
    this.propCamera = $("#prop-camera");
    this.propMatSlotRow = $("#prop-mat-slot-row");
    this.propMatSlot = $("#prop-mat-slot");
    this.propMatType = $("#prop-mat-type");
    this.propMatUuid = $("#prop-mat-uuid");
    this.propMatUuidNew = $("#prop-mat-uuid-new");
    this.propMatName = $("#prop-mat-name");
    this.propMatMapFile = $("#prop-mat-map-file");
    this.matTexSettings = $("#mat-tex-settings");
    this.matTexSettingsTitle = $("#mat-tex-settings-title");
    this.sceneBackgroundType = $("#scene-background-type");
    this.sceneBackground = $("#scene-background");
    this.sceneBackgroundMap = $("#scene-background-map");
    this.sceneBackgroundMapFile = $("#scene-background-map-file");
    this.sceneBackgroundColorSpace = $("#scene-background-colorspace");
    this.sceneBackgroundColorSpaceRow = $("#scene-background-colorspace-row");
    this.sceneBackgroundEquirectRow = $("#scene-background-equirect-row");
    this.sceneBackgroundBlur = $("#scene-background-blur");
    this.sceneBackgroundIntensity = $("#scene-background-intensity");
    this.sceneBackgroundRotation = $("#scene-background-rotation");
    this.sceneEnvironmentType = $("#scene-environment-type");
    this.sceneEnvironmentMap = $("#scene-environment-map");
    this.sceneEnvironmentMapFile = $("#scene-environment-map-file");
    this.sceneFogType = $("#scene-fog-type");
    this.sceneFogFields = $("#scene-fog-fields");
    this.sceneFogColor = $("#scene-fog-color");
    this.sceneFogNear = $("#scene-fog-near");
    this.sceneFogFar = $("#scene-fog-far");
    this.sceneFogDensity = $("#scene-fog-density");
    this.viewportCamera = $("#viewport-camera");
    this.viewportShading = $("#viewport-shading");
    this.viewHelper = $("#view-helper");
    this.projectCamera = $("#project-camera");
    this.projectAntialias = $("#project-antialias");
    this.projectShadows = $("#project-shadows");
    this.projectShadowType = $("#project-shadow-type");
    this.projectToneMapping = $("#project-tone-mapping");
    this.projectExposure = $("#project-exposure");
    this.projectTitle = $("#project-title");
    this.projectEditable = $("#project-editable");
    this.projectPlay = $("#project-play");
    this.projectPublish = $("#project-publish");
    this.playerStop = $("#player-stop");
    this.resourceTabs = $("#resource-tabs");
    this.resourceList = $("#resource-list");
    this.resourceAssign = $("#resource-assign");
    this.resourceCount = $("#resource-count");
    this.historyList = $("#history-list");
    this.btnClearHistory = $("#btn-clear-history");
    this.infoObjects = $("#info-objects");
    this.infoVertices = $("#info-vertices");
    this.infoTriangles = $("#info-triangles");
    this.infoFrametime = $("#info-frametime");
    this.infoObjectsLabel = $("#info-objects-label");
    this.infoVerticesLabel = $("#info-vertices-label");
    this.infoTrianglesLabel = $("#info-triangles-label");

    this.sidebarWidth = 350;
    this._parts = [];
    this._selected = null;

    this._onStart = null;
    this._onMode = null;
    this._onModel = null;
    this._onUpload = null;
    this._onAdd = null;
    this._onLayout = null;
    this._onFrame = null;
    this._onToggleGrid = null;
    this._onToggleHelpers = null;
    this._onSelectPart = null;
    this._onNewEmpty = null;
    this._onSave = null;
    this._onExport = null;
    this._onOpen = null;
    this._onOpenProject = null;
    this._onUndo = null;
    this._onRedo = null;
    this._onCenter = null;
    this._onClone = null;
    this._onDelete = null;
    this._onObjectEdit = null;
    this._onSceneEdit = null;
    this._onProjectEdit = null;
    this._onProjectPlay = null;
    this._onProjectPublish = null;
    this._onAssignResource = null;
    this._onClearHistory = null;
    this._onViewportCamera = null;
    this._onViewportShading = null;
    this._onViewHelperClick = null;
    this._onSceneMap = null;
    this._fillingProperties = false;
    this._materialSlot = 0;
    this._pendingMapProperty = null;
    this._textureSettingsProperty = null;
    this._mapCache = new WeakMap();
    this._resourceKind = "geometries";
    this._resourceSelected = null;
    this._resources = { geometries: [], materials: [], textures: [] };
    this._outlinerEntries = [];
    this._outlinerMeta = {};
    this._outlinerFocus = "object";
    this._sceneOpen = true;

    this._populateModels();
    this._bind();
    this.editorState.onChange(() => this._renderMode());
    this._renderMode();
    this.setOutliner([]);
  }

  onStart(fn: () => void): void {
    this._onStart = fn;
  }

  onModeChange(fn: (mode: EditorModeName) => void): void {
    this._onMode = fn;
  }

  onModelChange(fn: (id: string) => void): void {
    this._onModel = fn;
  }

  onUpload(fn: (files: File[]) => void): void {
    this._onUpload = fn;
  }

  onAdd(fn: (id: string) => void): void {
    this._onAdd = fn;
  }

  onLayout(fn: () => void): void {
    this._onLayout = fn;
  }

  onFrame(fn: () => void): void {
    this._onFrame = fn;
  }

  onToggleGrid(fn: (visible: boolean) => void): void {
    this._onToggleGrid = fn;
  }

  onToggleHelpers(fn: (key: HelperKey, visible: boolean) => void): void {
    this._onToggleHelpers = fn;
  }

  onSelectPart(fn: (mesh: THREE.Object3D | null, options?: SelectOptions) => void): void {
    this._onSelectPart = fn;
  }

  onNewEmpty(fn: () => void): void {
    this._onNewEmpty = fn;
  }

  onSave(fn: () => void): void {
    this._onSave = fn;
  }

  onExport(fn: (format: string) => void): void {
    this._onExport = fn;
  }

  onOpen(fn: () => void): void {
    this._onOpen = fn;
  }

  onOpenProject(fn: (file: File) => void): void {
    this._onOpenProject = fn;
  }

  onUndo(fn: () => void): void {
    this._onUndo = fn;
  }

  onRedo(fn: () => void): void {
    this._onRedo = fn;
  }

  onCenter(fn: () => void): void {
    this._onCenter = fn;
  }

  onClone(fn: () => void): void {
    this._onClone = fn;
  }

  onDelete(fn: () => void): void {
    this._onDelete = fn;
  }

  onObjectEdit(fn: (object: THREE.Object3D, change: ObjectEdit) => void): void {
    this._onObjectEdit = fn;
  }

  onSceneEdit(fn: (settings: SidebarSettings) => void): void {
    this._onSceneEdit = fn;
  }

  onProjectEdit(fn: (settings: SidebarSettings) => void): void {
    this._onProjectEdit = fn;
  }

  onProjectPlay(fn: (playing: boolean) => void): void {
    this._onProjectPlay = fn;
  }

  onProjectPublish(fn: () => void): void {
    this._onProjectPublish = fn;
  }

  onAssignResource(fn: (kind: ResourceKind, uuid: string) => void): void {
    this._onAssignResource = fn;
  }

  onClearHistory(fn: () => void): void {
    this._onClearHistory = fn;
  }

  onViewportCamera(fn: (uuid: string) => void): void {
    this._onViewportCamera = fn;
  }

  onViewportShading(fn: (mode: ShadingMode) => void): void {
    this._onViewportShading = fn;
  }

  onViewHelperClick(fn: (event: PointerEvent) => void): void {
    this._onViewHelperClick = fn;
  }

  onSceneMap(fn: (target: string, file: File) => void): void {
    this._onSceneMap = fn;
  }

  undo(): void {
    this._onUndo?.();
  }

  redo(): void {
    this._onRedo?.();
  }

  deleteSelected(): void {
    this._onDelete?.();
  }

  setHistoryState({
    canUndo,
    canRedo,
    undos = [],
    redos = [],
  }: {
    canUndo: boolean;
    canRedo: boolean;
    undos?: HistoryItem[];
    redos?: HistoryItem[];
  }): void {
    this.menuUndo?.classList.toggle("inactive", !canUndo);
    this.menuRedo?.classList.toggle("inactive", !canRedo);
    if (!this.historyList) return;

    const items = [
      ...undos.map((command) => ({ label: command.label || "Change", redo: false })),
      ...[...redos].reverse().map((command) => ({ label: command.label || "Change", redo: true })),
    ];

    if (!items.length) {
      this.historyList.innerHTML = `<div class="empty">Empty</div>`;
      return;
    }

    this.historyList.innerHTML = items
      .map(
        (item) =>
          `<div class="option${item.redo ? " redo" : ""}">${this._escape(item.label)}</div>`
      )
      .join("");
  }

  openProjectPicker(): void {
    this.projectOpen?.click();
  }

  setGridChecked(visible: boolean): void {
    this.menuGrid?.classList.toggle("toggle-on", visible);
    if (this.settingGrid) this.settingGrid.checked = visible;
  }

  setCatalog(catalog: readonly CatalogItem[], selectedId?: string): void {
    if (!this.modelSelect) return;
    const shapes = catalog.filter((m) => m.type === "primitive" || m.type === "text" || m.type === "sprite");
    const models = catalog.filter((m) => m.type === "gltf");
    const uploads = catalog.filter((m) => m.type === "upload");
    const options = (items: CatalogItem[]) =>
      items.map((m) => `<option value="${m.id}">${this._escape(m.name)}</option>`).join("");

    this.modelSelect.innerHTML = [
      shapes.length ? `<optgroup label="Shapes">${options(shapes)}</optgroup>` : "",
      models.length ? `<optgroup label="Models">${options(models)}</optgroup>` : "",
      uploads.length ? `<optgroup label="Uploaded">${options(uploads)}</optgroup>` : "",
    ].join("");

    const resolved = selectedId === "cube" ? "box" : selectedId;
    if (resolved && this.modelSelect.querySelector(`[value="${resolved}"]`)) {
      this.modelSelect.value = resolved;
    }
  }

  setMode(mode: EditorModeName): void {
    this.editorState.setMode(mode);
    this._onMode?.(mode);
  }

  setHint(text: string): void {
    if (this.hint) this.hint.textContent = text;
  }

  setStatus(text: string): void {
    if (this.status) this.status.textContent = text;
  }

  setViewportInfo({ objects, vertices, triangles, frametime }: ViewportStats): void {
    const format = (n: number) => Number(n).toLocaleString();
    if (this.infoObjects) this.infoObjects.textContent = format(objects);
    if (this.infoVertices) this.infoVertices.textContent = format(vertices);
    if (this.infoTriangles) this.infoTriangles.textContent = format(triangles);
    if (this.infoFrametime) this.infoFrametime.textContent = Number(frametime).toFixed(2);
    if (this.infoObjectsLabel) this.infoObjectsLabel.textContent = objects === 1 ? "object" : "objects";
    if (this.infoVerticesLabel) this.infoVerticesLabel.textContent = vertices === 1 ? "vertex" : "vertices";
    if (this.infoTrianglesLabel) this.infoTrianglesLabel.textContent = triangles === 1 ? "triangle" : "triangles";
  }

  setLoading(visible: boolean, text = "Loading model…"): void {
    if (!this.loading) return;
    this.loading.classList.toggle("visible", visible);
    const label = this.loading.querySelector("span");
    if (label) label.textContent = text;
  }

  setOutliner(parts: THREE.Object3D[], selected: THREE.Object3D | null = this._selected, meta: OutlinerMeta = this._outlinerMeta || {}): void {
    this._parts = parts || [];
    this._selected = selected;
    this._outlinerMeta = meta;
    if (!this.outliner) return;

    const entries: OutlinerEntry[] = [];
    if (meta.camera) entries.push({ object: meta.camera, depth: 0, kind: "camera" });
    if (meta.scene) entries.push({ object: meta.scene, depth: 0, kind: "scene" });
    const walk = (object: THREE.Object3D, depth: number): void => {
      entries.push({ object, depth, kind: "object" });
      const obj = object as SceneObj;
      if (obj.isLight || obj.isCamera || obj.isSprite) return;
      for (const child of object.children) {
        if (child.userData?.ignorePick || child.userData?.isHelper) continue;
        walk(child, depth + 1);
      }
    };
    if (this._sceneOpen) {
      for (const object of this._parts) walk(object, 1);
    }
    this._outlinerEntries = entries;

    if (!entries.length) {
      this.outliner.innerHTML = `<div class="empty">No objects</div>`;
      this.refreshProperties(null);
      return;
    }

    this.outliner.innerHTML = entries
      .map((entry, i) => {
        const type = this._outlinerType(entry);
        const name = this._escape(this._outlinerName(entry));
        const extras = this._outlinerExtras(entry, selected);
        const opener = this._outlinerOpener(entry);
        const active = this._isOutlinerActive(entry, selected) ? " active" : "";
        return `<div class="option${active}" data-index="${i}" style="padding-left:${entry.depth * 18}px">${opener}<span class="type ${type}"></span> ${name}${extras}</div>`;
      })
      .join("");
    this.refreshProperties(selected);
    this._applyPropertyTab();
    this.setViewportCameras(meta.cameras || (meta.camera ? [meta.camera] : []), meta.viewportCamera);
  }

  setViewportCameras(cameras: THREE.Camera[] | undefined, selected?: THREE.Camera | null): void {
    if (!this.viewportCamera) return;
    const list = cameras?.length ? cameras : [];
    this.viewportCamera.innerHTML = list
      .map((camera) => `<option value="${camera.uuid}">${this._escape(camera.name || "Camera")}</option>`)
      .join("");
    if (selected) this.viewportCamera.value = selected.uuid;
  }

  setSelection(mesh: THREE.Object3D | null, options?: SelectOptions): void {
    if (options?.slot != null) this._materialSlot = options.slot;
    else if (options?.prop !== "material") this._materialSlot = 0;
    this._outlinerFocus = options?.prop ?? "object";
    this.setOutliner(this._parts, mesh);
    this.setResources(this._resources, mesh);
  }

  refreshProperties(object: THREE.Object3D | null = this._selected): void {
    if (this._selected !== object) {
      this._materialSlot = 0;
      this._textureSettingsProperty = null;
      if (this.matTexSettings) this.matTexSettings.hidden = true;
    }
    this._selected = object ?? null;
    if (!this.properties) return;

    if (!object) {
      this.properties.hidden = true;
      return;
    }

    this.properties.hidden = false;
    const obj = object as SceneObj;
    const hasGeometry = Boolean(obj.geometry);
    const hasMaterial = Boolean(obj.material);
    if (this.tabGeometry) this.tabGeometry.hidden = !hasGeometry;
    if (this.tabMaterial) this.tabMaterial.hidden = !hasMaterial;

    const current = (this.propertiesTabs?.querySelector("span.selected") as HTMLElement | null)?.dataset.prop;
    if ((current === "geometry" && !hasGeometry) || (current === "material" && !hasMaterial)) {
      this._selectPropTab("object");
    }

    this._fillingProperties = true;
    if (this.propType) this.propType.textContent = this._objectType(object);
    if (this.propUuid) this.propUuid.value = object.uuid || "";
    if (this.propName) this.propName.value = object.name || "";
    if (this.propVisible) this.propVisible.checked = object.visible !== false;
    if (this.propFrustumCulled) this.propFrustumCulled.checked = object.frustumCulled !== false;
    if (this.propRenderOrder) this.propRenderOrder.value = String(object.renderOrder ?? 0);
    this._setVec("position", object.position, 3);
    this._setVec("rotation", {
      x: (object.rotation.x * 180) / Math.PI,
      y: (object.rotation.y * 180) / Math.PI,
      z: (object.rotation.z * 180) / Math.PI,
    }, 2);
    this._setVec("scale", object.scale, 3);

    const isLight = Boolean(obj.isLight);
    this._row("#prop-rotation-row", !isLight);
    this._row("#prop-scale-row", !isLight);

    const hasIntensity = obj.intensity !== undefined;
    const hasColor = Boolean(obj.color) && isLight;
    const hasLightShadow = Boolean(obj.shadow) && !obj.isAmbientLight && !obj.isHemisphereLight;
    const showShadowRow = (obj.isMesh || obj.isGroup || hasLightShadow) && !obj.isScene && !obj.isCamera;
    this._row("#prop-intensity-row", hasIntensity);
    this._row("#prop-color-row", hasColor);
    this._row("#prop-shadow-row", showShadowRow);
    this._row("#prop-shadow-intensity-row", hasLightShadow);
    this._row("#prop-shadow-bias-row", hasLightShadow);
    this._row("#prop-shadow-normal-bias-row", hasLightShadow);
    this._row("#prop-shadow-radius-row", hasLightShadow);
    if (this.propReceiveShadowLabel) this.propReceiveShadowLabel.hidden = isLight;
    if (hasColor) this._set("#prop-light-color", `#${obj.color!.getHexString()}`);
    if (hasIntensity) this._set("#prop-light-intensity", obj.intensity ?? 1);
    if (showShadowRow) {
      if (this.propCastShadow) this.propCastShadow.checked = Boolean(obj.castShadow);
      if (this.propReceiveShadow) this.propReceiveShadow.checked = Boolean(obj.receiveShadow);
    }
    if (hasLightShadow) {
      const shadow = (object as THREE.DirectionalLight).shadow as THREE.LightShadow & {
        intensity?: number;
        bias?: number;
        normalBias?: number;
        radius?: number;
      };
      this._set("#prop-shadow-intensity", shadow.intensity ?? 1);
      this._set("#prop-shadow-bias", shadow.bias ?? 0);
      this._set("#prop-shadow-normal-bias", shadow.normalBias ?? 0);
      this._set("#prop-shadow-radius", shadow.radius ?? 1);
    }

    const isCamera = Boolean(obj.isPerspectiveCamera);
    if (this.propCamera) this.propCamera.hidden = !isCamera;
    if (isCamera) {
      const camera = object as THREE.PerspectiveCamera;
      this._set("#prop-camera-fov", camera.fov);
      this._set("#prop-camera-near", camera.near);
      this._set("#prop-camera-far", camera.far);
    }

    if (hasGeometry) {
      const geometry = (object as THREE.Mesh).geometry;
      const position = geometry.attributes?.position;
      const vertices = position?.count ?? 0;
      const triangles = geometry.index ? geometry.index.count / 3 : vertices / 3;
      this._text("#prop-geo-type", geometry.type || "BufferGeometry");
      this._text("#prop-geo-vertices", String(Math.round(vertices)));
      this._text("#prop-geo-triangles", String(Math.round(triangles)));
    }

    this._refreshMaterial(object);
    this._fillingProperties = false;
  }

  syncSidebarSettings(settings: SidebarSettings | null | undefined): void {
    if (!settings) return;
    if (this.sceneBackgroundType) this.sceneBackgroundType.value = settings.backgroundType || "default";
    if (this.sceneEnvironmentType) this.sceneEnvironmentType.value = settings.environmentType || "default";
    this._set("#scene-background", settings.background);
    if (this.sceneBackgroundColorSpace) {
      this.sceneBackgroundColorSpace.value = settings.backgroundColorSpace ?? "";
    }
    this._set("#scene-background-blur", settings.backgroundBlurriness);
    this._set("#scene-background-intensity", settings.backgroundIntensity);
    this._set("#scene-background-rotation", settings.backgroundRotation);
    if (this.sceneFogType) this.sceneFogType.value = settings.fogType || "none";
    this._set("#scene-fog-color", settings.fogColor);
    this._set("#scene-fog-near", settings.fogNear);
    this._set("#scene-fog-far", settings.fogFar);
    this._set("#scene-fog-density", settings.fogDensity);
    this._refreshSceneFields();
    if (this.projectCamera) this.projectCamera.value = settings.cameraType || "perspective";
    if (this.projectAntialias) this.projectAntialias.checked = settings.antialias !== false;
    if (this.projectShadows) this.projectShadows.checked = Boolean(settings.shadows);
    if (this.projectShadowType) {
      const shadowType = Number(settings.shadowType) === 2 ? 1 : settings.shadowType;
      this.projectShadowType.value = String(shadowType);
    }
    if (this.projectToneMapping) this.projectToneMapping.value = String(settings.toneMapping);
    this._set("#project-exposure", settings.exposure);
    if (this.projectTitle && settings.title != null) this.projectTitle.value = settings.title;
    if (this.projectEditable) this.projectEditable.checked = Boolean(settings.editable);
    this._refreshToneMappingRow();
  }

  updateScreenLine(x1: number, y1: number, x2: number, y2: number): void {
    const line = this.screenLine;
    if (!line) return;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    line.style.display = "block";
    line.style.width = `${len}px`;
    line.style.transform = `translate(${x1}px, ${y1}px) rotate(${angle}rad)`;
  }

  hideScreenLine(): void {
    if (this.screenLine) this.screenLine.style.display = "none";
  }

  _escape(text: unknown): string {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  _populateModels(): void {
    this.setCatalog(MODELS, "box");
  }

  _bind(): void {
    this.btnStart?.addEventListener("click", () => {
      this.home?.classList.add("hidden");
      this.editor?.classList.add("active");
      this._onStart?.();
      requestAnimationFrame(() => this._onLayout?.());
    });

    this.btnNavigate?.addEventListener("click", () => this.setMode(EditorMode.NAVIGATE));
    this.btnCut?.addEventListener("click", () => this.setMode(EditorMode.CUT));

    this.modelSelect?.addEventListener("change", () => {
      this._onModel?.(this.modelSelect!.value);
    });

    this.btnUpload?.addEventListener("click", () => this.modelUpload?.click());
    this.modelUpload?.addEventListener("change", () => {
      const files = this.modelUpload!.files;
      if (files?.length) this._onUpload?.([...files]);
      this.modelUpload!.value = "";
    });

    this.projectOpen?.addEventListener("change", () => {
      const file = this.projectOpen!.files?.[0];
      this.projectOpen!.value = "";
      if (file) this._onOpenProject?.(file);
    });

    this.menubar?.addEventListener("click", (event) => this._onMenuClick(event));

    this.outliner?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const opener = target.closest(".opener");
      if (opener) {
        event.stopPropagation();
        this._sceneOpen = !this._sceneOpen;
        this.setOutliner(this._parts, this._selected);
        return;
      }
      const option = target.closest(".option") as HTMLElement | null;
      if (!option) return;
      const entry = this._outlinerEntries[Number(option.dataset.index)];
      if (!entry) return;
      const matSlot = target.closest("[data-mat-slot]") as HTMLElement | null;
      if (matSlot && option.contains(matSlot)) {
        this._onSelectPart?.(entry.object, {
          exact: true,
          prop: "material",
          slot: Number(matSlot.dataset.matSlot) || 0,
        });
        return;
      }
      if (target.closest("[data-geo]") && option.contains(target.closest("[data-geo]"))) {
        this._onSelectPart?.(entry.object, { exact: true, prop: "geometry" });
        return;
      }
      if (entry.kind === "scene") {
        this._outlinerFocus = "object";
        this._onSelectPart?.(null);
        return;
      }
      this._onSelectPart?.(entry.object, { exact: true, prop: "object" });
    });
    this.outliner?.addEventListener("dblclick", (event) => {
      const target = event.target as HTMLElement;
      const option = target.closest(".option") as HTMLElement | null;
      if (!option || target.closest(".opener")) return;
      const entry = this._outlinerEntries[Number(option.dataset.index)];
      if (entry?.kind === "object") this._onFrame?.();
    });

    this.viewportCamera?.addEventListener("change", () => {
      this._onViewportCamera?.(this.viewportCamera!.value);
    });
    this.viewportShading?.addEventListener("change", () => {
      this._onViewportShading?.(this.viewportShading!.value as ShadingMode);
    });
    this.viewHelper?.addEventListener("pointerup", (event) => {
      event.stopPropagation();
      this._onViewHelperClick?.(event);
    });
    this.viewHelper?.addEventListener("pointerdown", (event) => event.stopPropagation());

    this.editor?.querySelectorAll("#tabs > span").forEach((tab) => {
      const el = tab as HTMLElement;
      el.addEventListener("click", () => this._selectTab(el.dataset.tab));
    });

    this.propertiesTabs?.querySelectorAll("span").forEach((tab) => {
      const el = tab as HTMLElement;
      el.addEventListener("click", () => this._selectPropTab(el.dataset.prop));
    });

    this.properties?.addEventListener("change", (event) => this._onPropertyField(event));
    this.properties?.addEventListener("input", (event) => {
      if ((event.target as HTMLElement).matches?.(".Number, .Color")) this._onPropertyField(event);
    });
    this.properties?.addEventListener("click", (event) => this._onMaterialClick(event));
    this.propUuidNew?.addEventListener("click", () => {
      if (!this._selected) return;
      this._onObjectEdit?.(this._selected, { kind: "uuid" });
    });
    this.propMatUuidNew?.addEventListener("click", () => {
      if (!this._selected) return;
      this._emitMaterial({ action: "uuid" });
    });
    this.propMatMapFile?.addEventListener("change", () => {
      const file = this.propMatMapFile!.files?.[0];
      this.propMatMapFile!.value = "";
      if (!file || !this._pendingMapProperty || !this._selected) return;
      this._emitMaterial({ action: "loadMap", property: this._pendingMapProperty, file });
    });

    this.sceneBackgroundType?.addEventListener("change", () => {
      this._refreshSceneFields();
      this._emitSceneEdit();
    });
    this.sceneBackground?.addEventListener("input", () => this._emitSceneEdit());
    this.sceneBackgroundColorSpace?.addEventListener("change", () => this._emitSceneEdit());
    this.sceneBackgroundBlur?.addEventListener("change", () => this._emitSceneEdit());
    this.sceneBackgroundIntensity?.addEventListener("change", () => this._emitSceneEdit());
    this.sceneBackgroundRotation?.addEventListener("change", () => this._emitSceneEdit());
    this.sceneEnvironmentType?.addEventListener("change", () => {
      this._refreshSceneFields();
      this._emitSceneEdit();
    });
    this.sceneBackgroundMap?.addEventListener("click", () => this.sceneBackgroundMapFile?.click());
    this.sceneEnvironmentMap?.addEventListener("click", () => this.sceneEnvironmentMapFile?.click());
    this.sceneBackgroundMapFile?.addEventListener("change", () => {
      const file = this.sceneBackgroundMapFile!.files?.[0];
      this.sceneBackgroundMapFile!.value = "";
      if (file) this._onSceneMap?.("background", file);
    });
    this.sceneEnvironmentMapFile?.addEventListener("change", () => {
      const file = this.sceneEnvironmentMapFile!.files?.[0];
      this.sceneEnvironmentMapFile!.value = "";
      if (file) this._onSceneMap?.("environment", file);
    });
    this.sceneFogType?.addEventListener("change", () => {
      this._refreshSceneFields();
      this._emitSceneEdit();
    });
    this.sceneFogColor?.addEventListener("input", () => this._emitSceneEdit());
    this.sceneFogNear?.addEventListener("change", () => this._emitSceneEdit());
    this.sceneFogFar?.addEventListener("change", () => this._emitSceneEdit());
    this.sceneFogDensity?.addEventListener("change", () => this._emitSceneEdit());

    this.projectCamera?.addEventListener("change", () => this._emitProjectEdit());
    this.projectAntialias?.addEventListener("change", () => this._emitProjectEdit());
    this.projectShadows?.addEventListener("change", () => this._emitProjectEdit());
    this.projectShadowType?.addEventListener("change", () => this._emitProjectEdit());
    this.projectToneMapping?.addEventListener("change", () => {
      this._refreshToneMappingRow();
      this._emitProjectEdit();
    });
    this.projectExposure?.addEventListener("change", () => this._emitProjectEdit());
    this.projectTitle?.addEventListener("change", () => this._emitProjectEdit());
    this.projectEditable?.addEventListener("change", () => this._emitProjectEdit());
    this.projectPlay?.addEventListener("click", () => {
      this._onProjectPlay?.(!this.editor?.classList.contains("playing"));
    });
    this.projectPublish?.addEventListener("click", () => this._onProjectPublish?.());
    this.playerStop?.addEventListener("click", () => this._onProjectPlay?.(false));
    this.resourceTabs?.querySelectorAll("span").forEach((tab) => {
      const el = tab as HTMLElement;
      el.addEventListener("click", () => this._selectResourceTab(el.dataset.resource));
    });
    this.resourceList?.addEventListener("click", (event) => {
      const option = (event.target as HTMLElement).closest?.(".option") as HTMLElement | null;
      if (!option) return;
      this._resourceSelected = option.dataset.uuid || null;
      this._renderResourceList();
    });
    this.resourceAssign?.addEventListener("click", () => {
      if (!this._resourceSelected) return;
      this._onAssignResource?.(this._resourceKind, this._resourceSelected);
    });
    this.btnClearHistory?.addEventListener("click", () => this._onClearHistory?.());

    this.settingGrid?.addEventListener("change", () => {
      const visible = this.settingGrid!.checked;
      this.menuGrid?.classList.toggle("toggle-on", visible);
      this._onToggleGrid?.(visible);
    });

    this._bindHelperToggle("cameraHelpers", this.menuCameraHelpers, this.settingCameraHelpers);
    this._bindHelperToggle("lightHelpers", this.menuLightHelpers, this.settingLightHelpers);
    this._bindHelperToggle("skeletonHelpers", this.menuSkeletonHelpers, this.settingSkeletonHelpers);

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.editor?.classList.contains("playing")) {
        this._onProjectPlay?.(false);
      }
    });

    this._bindResizer();
    this._bindOutlinerResizer();
    this._bindDrop();
  }

  _onMenuClick(event: Event): void {
    const option = (event.target as HTMLElement).closest(".option") as HTMLElement | null;
    if (!option || option.classList.contains("submenu-title")) return;
    if (option.classList.contains("inactive")) return;

    const action = option.dataset.action;
    if (action === "new-empty") this._onNewEmpty?.();
    if (action === "open") this._onOpen?.();
    if (action === "import") this.modelUpload?.click();
    if (action === "save") this._onSave?.();
    if (action === "export") this._onExport?.(option.dataset.format as string);
    if (action === "add") this._onAdd?.(option.dataset.id as string);
    if (action === "load") this._onModel?.(option.dataset.id as string);
    if (action === "navigate") this.setMode(EditorMode.NAVIGATE);
    if (action === "cut") this.setMode(EditorMode.CUT);
    if (action === "undo") this._onUndo?.();
    if (action === "redo") this._onRedo?.();
    if (action === "center") this._onCenter?.();
    if (action === "clone") this._onClone?.();
    if (action === "delete") this._onDelete?.();
    if (action === "frame") this._onFrame?.();
    if (action === "toggle-grid") {
      const visible = !option.classList.contains("toggle-on");
      option.classList.toggle("toggle-on", visible);
      if (this.settingGrid) this.settingGrid.checked = visible;
      this._onToggleGrid?.(visible);
    }
    if (action === "toggle-camera-helpers") {
      this._setHelperToggle("cameraHelpers", this.menuCameraHelpers, this.settingCameraHelpers);
    }
    if (action === "toggle-light-helpers") {
      this._setHelperToggle("lightHelpers", this.menuLightHelpers, this.settingLightHelpers);
    }
    if (action === "toggle-skeleton-helpers") {
      this._setHelperToggle("skeletonHelpers", this.menuSkeletonHelpers, this.settingSkeletonHelpers);
    }
    if (action === "fullscreen") this._toggleFullscreen();
    if (action === "help-shortcuts") this._selectTab("settings");
    if (action === "help-about") {
      this.setStatus("Geometry Slicer — Three.js mesh cutting editor.");
    }
  }

  _bindHelperToggle(key: HelperKey, menu: HTMLElement | null, setting: HTMLInputElement | null): void {
    if (!setting) return;
    setting.addEventListener("change", () => {
      const visible = setting.checked;
      menu?.classList.toggle("toggle-on", visible);
      this._onToggleHelpers?.(key, visible);
    });
  }

  _setHelperToggle(key: HelperKey, menu: HTMLElement | null, setting: HTMLInputElement | null): void {
    const visible = !menu?.classList.contains("toggle-on");
    menu?.classList.toggle("toggle-on", visible);
    if (setting) setting.checked = visible;
    this._onToggleHelpers?.(key, visible);
  }

  _selectTab(id?: string): void {
    this.editor?.querySelectorAll("#tabs > span").forEach((tab) => {
      const el = tab as HTMLElement;
      el.classList.toggle("selected", el.dataset.tab === id);
    });
    this.editor?.querySelectorAll("#sidebar > .tab-panel").forEach((panel) => {
      const el = panel as HTMLElement;
      el.hidden = el.dataset.panel !== id;
    });
  }

  _selectPropTab(id?: string): void {
    this.propertiesTabs?.querySelectorAll("span").forEach((tab) => {
      const el = tab as HTMLElement;
      el.classList.toggle("selected", el.dataset.prop === id);
    });
    this.properties?.querySelectorAll(".prop-panel").forEach((panel) => {
      const el = panel as HTMLElement;
      el.hidden = el.dataset.prop !== id;
    });
    if (id === "object" || id === "geometry" || id === "material") {
      this._outlinerFocus = id;
      this._syncOutlinerActive();
    }
  }

  _applyPropertyTab(): void {
    const obj = this._selected as SceneObj | null;
    let tab = this._outlinerFocus;
    if (tab === "geometry" && !obj?.geometry) tab = "object";
    if (tab === "material" && !this._objectMaterials(this._selected).length) tab = "object";
    this._outlinerFocus = tab;
    this._selectPropTab(tab);
  }

  _syncOutlinerActive(): void {
    this.outliner?.querySelectorAll(".option[data-index]").forEach((node) => {
      const option = node as HTMLElement;
      const entry = this._outlinerEntries[Number(option.dataset.index)];
      const selectedHere = Boolean(entry && this._isOutlinerActive(entry, this._selected));
      option.classList.toggle("active", selectedHere);
      option.querySelectorAll("[data-geo]").forEach((geo) => {
        geo.classList.toggle("active", selectedHere && this._outlinerFocus === "geometry");
      });
      option.querySelectorAll("[data-mat-slot]").forEach((mat) => {
        const slot = Number((mat as HTMLElement).dataset.matSlot) || 0;
        mat.classList.toggle(
          "active",
          selectedHere && this._outlinerFocus === "material" && slot === this._materialSlot
        );
      });
    });
  }

  _onPropertyField(event: Event): void {
    if (this._fillingProperties) return;
    const target = event.target as HTMLInputElement | null;
    if (!target || !this._selected) return;

    const vec = target.dataset.vec;
    const axis = target.dataset.axis;
    if (vec && axis) {
      const value = Number(target.value);
      if (!Number.isFinite(value)) return;
      this._onObjectEdit?.(this._selected, {
        kind: vec,
        axis: axis as ObjectEdit["axis"],
        value: vec === "rotation" ? (value * Math.PI) / 180 : value,
      });
      return;
    }

    if (target === this.propName) {
      this._onObjectEdit?.(this._selected, { kind: "name", value: target.value });
      return;
    }
    if (target === this.propVisible) {
      this._onObjectEdit?.(this._selected, { kind: "visible", value: target.checked });
      return;
    }
    if (target === this.propFrustumCulled) {
      this._onObjectEdit?.(this._selected, { kind: "frustumCulled", value: target.checked });
      return;
    }
    if (target === this.propRenderOrder) {
      this._onObjectEdit?.(this._selected, { kind: "renderOrder", value: Number(target.value) });
      return;
    }
    if (target.id === "prop-light-color") {
      this._onObjectEdit?.(this._selected, { kind: "lightColor", value: target.value });
      return;
    }
    if (target.id === "prop-light-intensity") {
      this._onObjectEdit?.(this._selected, { kind: "lightIntensity", value: Number(target.value) });
      return;
    }
    if (target === this.propCastShadow) {
      this._onObjectEdit?.(this._selected, { kind: "castShadow", value: target.checked });
      return;
    }
    if (target === this.propReceiveShadow) {
      this._onObjectEdit?.(this._selected, { kind: "receiveShadow", value: target.checked });
      return;
    }
    if (target.id === "prop-shadow-intensity") {
      this._onObjectEdit?.(this._selected, { kind: "shadowIntensity", value: Number(target.value) });
      return;
    }
    if (target.id === "prop-shadow-bias") {
      this._onObjectEdit?.(this._selected, { kind: "shadowBias", value: Number(target.value) });
      return;
    }
    if (target.id === "prop-shadow-normal-bias") {
      this._onObjectEdit?.(this._selected, { kind: "shadowNormalBias", value: Number(target.value) });
      return;
    }
    if (target.id === "prop-shadow-radius") {
      this._onObjectEdit?.(this._selected, { kind: "shadowRadius", value: Number(target.value) });
      return;
    }
    if (target.id === "prop-camera-fov") {
      this._onObjectEdit?.(this._selected, { kind: "fov", value: Number(target.value) });
      return;
    }
    if (target.id === "prop-camera-near") {
      this._onObjectEdit?.(this._selected, { kind: "near", value: Number(target.value) });
      return;
    }
    if (target.id === "prop-camera-far") {
      this._onObjectEdit?.(this._selected, { kind: "far", value: Number(target.value) });
      return;
    }
    if (this._onMaterialField(target)) return;
  }

  _emitSceneEdit(): void {
    this._onSceneEdit?.({
      backgroundType: this.sceneBackgroundType?.value,
      environmentType: this.sceneEnvironmentType?.value,
      background: this.sceneBackground?.value,
      backgroundColorSpace: this.sceneBackgroundColorSpace?.value ?? "",
      backgroundBlurriness: Number(this.sceneBackgroundBlur?.value),
      backgroundIntensity: Number(this.sceneBackgroundIntensity?.value),
      backgroundRotation: Number(this.sceneBackgroundRotation?.value),
      fogType: this.sceneFogType?.value,
      fogColor: this.sceneFogColor?.value,
      fogNear: Number(this.sceneFogNear?.value),
      fogFar: Number(this.sceneFogFar?.value),
      fogDensity: Number(this.sceneFogDensity?.value),
    });
  }

  _refreshSceneFields(): void {
    const backgroundType = this.sceneBackgroundType?.value || "default";
    const environmentType = this.sceneEnvironmentType?.value || "default";
    const fogType = this.sceneFogType?.value || "none";
    const showMap = backgroundType === "texture" || backgroundType === "equirect";
    if (this.sceneBackground) this.sceneBackground.hidden = backgroundType !== "color";
    if (this.sceneBackgroundMap) this.sceneBackgroundMap.hidden = !showMap;
    if (this.sceneBackgroundColorSpaceRow) this.sceneBackgroundColorSpaceRow.hidden = !showMap;
    if (this.sceneBackgroundEquirectRow) {
      this.sceneBackgroundEquirectRow.hidden = backgroundType !== "equirect";
    }
    if (this.sceneEnvironmentMap) this.sceneEnvironmentMap.hidden = environmentType !== "equirect";
    if (this.sceneFogFields) this.sceneFogFields.hidden = fogType === "none";
    if (this.sceneFogNear) this.sceneFogNear.hidden = fogType !== "linear";
    if (this.sceneFogFar) this.sceneFogFar.hidden = fogType !== "linear";
    if (this.sceneFogDensity) this.sceneFogDensity.hidden = fogType !== "exponential";
  }

  markSceneMap(target: string, hasMap: boolean): void {
    const button = target === "environment" ? this.sceneEnvironmentMap : this.sceneBackgroundMap;
    button?.classList.toggle("has-map", Boolean(hasMap));
  }

  _refreshMaterial(object: THREE.Object3D | null): void {
    const materials = this._objectMaterials(object);
    if (this._materialSlot >= materials.length) this._materialSlot = 0;
    const material = materials[this._materialSlot] ?? materials[0];
    if (!material) {
      this.matTexSettings && (this.matTexSettings.hidden = true);
      return;
    }

    if (this.propMatSlotRow) this.propMatSlotRow.hidden = materials.length < 2;
    if (this.propMatSlot && materials.length > 1) {
      this.propMatSlot.innerHTML = materials
        .map((item, index) => `<option value="${index}">${index + 1}: ${this._escape(item.name || item.type)}</option>`)
        .join("");
      this.propMatSlot.value = String(this._materialSlot);
    }

    this._fillMaterialTypeOptions(object as THREE.Object3D, material);
    if (this.propMatUuid) this.propMatUuid.value = material.uuid || "";
    if (this.propMatName) this.propMatName.value = material.name || "";

    const mat = material as MaterialProps;
    this.editor?.querySelectorAll("#prop-material-panel [data-mat-prop]").forEach((node) => {
      const row = node as HTMLElement;
      const key = row.dataset.matProp as string;
      const visible = key in mat;
      row.hidden = !visible;
      if (!visible) return;

      const color = row.querySelector("[data-mat-color]") as HTMLInputElement | null;
      if (color && mat[color.dataset.matColor as string]?.getHexString) {
        color.value = `#${mat[color.dataset.matColor as string].getHexString()}`;
      }

      row.querySelectorAll("[data-mat-value]").forEach((node) => {
        const input = node as HTMLInputElement;
        const value = mat[input.dataset.matValue as string];
        if (value != null) input.value = value;
      });

      row.querySelectorAll("[data-mat-bool]").forEach((node) => {
        const input = node as HTMLInputElement;
        input.checked = Boolean(mat[input.dataset.matBool as string]);
      });

      row.querySelectorAll("[data-mat-vector]").forEach((node) => {
        const input = node as HTMLInputElement;
        const vec = mat[input.dataset.matVector as string];
        if (vec) input.value = vec[input.dataset.axis as string];
      });

      const mapKey = (row.querySelector("[data-mat-map]") as HTMLElement | null)?.dataset.matMap;
      if (mapKey) {
        const texture = mat[mapKey] as THREE.Texture | undefined;
        if (texture) this._cacheMap(material, mapKey, texture);
        const stored = texture || this._cachedMap(material, mapKey);
        const enabled = row.querySelector("[data-mat-map-enabled]") as HTMLInputElement | null;
        const settings = row.querySelector("[data-mat-map-settings]") as HTMLButtonElement | null;
        if (enabled) {
          enabled.checked = Boolean(texture);
          enabled.disabled = !stored;
        }
        if (settings) settings.disabled = !texture;
        this._setTextureThumb(row.querySelector("[data-mat-map]") as HTMLElement | null, stored);
      }
    });

    if (this._textureSettingsProperty) this._fillTextureSettings(material);
  }

  _fillMaterialTypeOptions(object: THREE.Object3D, material: THREE.Material): void {
    if (!this.propMatType) return;
    const obj = object as SceneObj;
    let types = MESH_MATERIAL_TYPES;
    if (obj.isSprite) types = SPRITE_MATERIAL_TYPES;
    else if (obj.isPoints) types = POINTS_MATERIAL_TYPES;
    else if (obj.isLine) types = LINE_MATERIAL_TYPES;
    if (!types.includes(material.type)) types = [...types, material.type];
    this.propMatType.innerHTML = types.map((type) => `<option value="${type}">${type}</option>`).join("");
    this.propMatType.value = material.type;
  }

  _onMaterialField(target: HTMLElement): boolean {
    const input = target as HTMLInputElement;
    if (target === this.propMatSlot) {
      this._materialSlot = Number(input.value) || 0;
      this._textureSettingsProperty = null;
      if (this.matTexSettings) this.matTexSettings.hidden = true;
      this._outlinerFocus = "material";
      this._refreshMaterial(this._selected);
      this._syncOutlinerActive();
      return true;
    }
    if (target === this.propMatType) {
      this._emitMaterial({ action: "type", value: input.value });
      return true;
    }
    if (target === this.propMatName) {
      this._emitMaterial({ action: "name", value: input.value });
      return true;
    }
    if (target.dataset.matColor) {
      this._emitMaterial({ action: "color", property: target.dataset.matColor, value: input.value });
      return true;
    }
    if (target.dataset.matValue) {
      const raw = input.value;
      const value = target.tagName === "SELECT" || input.type === "number" ? Number(raw) : raw;
      this._emitMaterial({ action: "value", property: target.dataset.matValue, value });
      return true;
    }
    if (target.dataset.matBool) {
      this._emitMaterial({ action: "value", property: target.dataset.matBool, value: input.checked, needsUpdate: true });
      return true;
    }
    if (target.dataset.matVector) {
      this._emitMaterial({
        action: "vector",
        property: target.dataset.matVector,
        axis: target.dataset.axis as ObjectEdit["axis"],
        value: Number(input.value),
      });
      return true;
    }
    if (target.dataset.matMapEnabled) {
      this._emitMaterial({ action: "toggleMap", property: target.dataset.matMapEnabled, enabled: input.checked });
      return true;
    }
    if (this._onTextureSettingsField(target)) return true;
    return false;
  }

  _onMaterialClick(event: Event): void {
    if (this._fillingProperties) return;
    const target = event.target as HTMLElement;
    const mapButton = target.closest?.("[data-mat-map]") as HTMLElement | null;
    if (mapButton) {
      this._pendingMapProperty = mapButton.dataset.matMap ?? null;
      this.propMatMapFile?.click();
      return;
    }
    const settingsButton = target.closest?.("[data-mat-map-settings]") as HTMLButtonElement | null;
    if (settingsButton && !settingsButton.disabled) {
      const property = settingsButton.dataset.matMapSettings ?? null;
      const same = this._textureSettingsProperty === property && !this.matTexSettings?.hidden;
      this._textureSettingsProperty = same ? null : property;
      if (this.matTexSettings) this.matTexSettings.hidden = !this._textureSettingsProperty;
      if (this._textureSettingsProperty) {
        this._fillTextureSettings(this._currentMaterial());
      }
    }
  }

  _onTextureSettingsField(target: HTMLElement): boolean {
    if (!this._textureSettingsProperty) return false;
    const ids = ["mat-tex-repeat-x", "mat-tex-repeat-y", "mat-tex-offset-x", "mat-tex-offset-y", "mat-tex-wrap", "mat-tex-flip", "mat-tex-colorspace"];
    if (!ids.includes(target.id)) return false;
    this._emitMaterial({
      action: "texture",
      property: this._textureSettingsProperty,
      repeatX: Number((this.editor?.querySelector("#mat-tex-repeat-x") as HTMLInputElement | null)?.value),
      repeatY: Number((this.editor?.querySelector("#mat-tex-repeat-y") as HTMLInputElement | null)?.value),
      offsetX: Number((this.editor?.querySelector("#mat-tex-offset-x") as HTMLInputElement | null)?.value),
      offsetY: Number((this.editor?.querySelector("#mat-tex-offset-y") as HTMLInputElement | null)?.value),
      wrap: Number((this.editor?.querySelector("#mat-tex-wrap") as HTMLInputElement | null)?.value),
      flipY: Boolean((this.editor?.querySelector("#mat-tex-flip") as HTMLInputElement | null)?.checked),
      colorSpace: (this.editor?.querySelector("#mat-tex-colorspace") as HTMLInputElement | null)?.value ?? "",
    });
    return true;
  }

  _fillTextureSettings(material: THREE.Material | null): void {
    const texture = (material as MaterialProps | null)?.[this._textureSettingsProperty as string] as THREE.Texture | undefined;
    if (!texture || !this.matTexSettings) {
      if (this.matTexSettings) this.matTexSettings.hidden = true;
      return;
    }
    this.matTexSettings.hidden = false;
    if (this.matTexSettingsTitle) this.matTexSettingsTitle.textContent = this._textureSettingsProperty;
    this._set("#mat-tex-repeat-x", texture.repeat?.x ?? 1);
    this._set("#mat-tex-repeat-y", texture.repeat?.y ?? 1);
    this._set("#mat-tex-offset-x", texture.offset?.x ?? 0);
    this._set("#mat-tex-offset-y", texture.offset?.y ?? 0);
    this._set("#mat-tex-wrap", texture.wrapS ?? 1000);
    const flip = this.editor?.querySelector("#mat-tex-flip") as HTMLInputElement | null;
    if (flip) flip.checked = texture.flipY !== false;
    const colorSpace = this.editor?.querySelector("#mat-tex-colorspace") as HTMLInputElement | null;
    if (colorSpace) colorSpace.value = texture.colorSpace ?? "";
  }

  _setTextureThumb(button: HTMLElement | null, texture: THREE.Texture | null | undefined): void {
    if (!button) return;
    button.classList.toggle("has-map", Boolean(texture));
    const url = this._texturePreview(texture);
    if (url) {
      button.style.backgroundImage = `url("${url}")`;
    } else {
      button.style.backgroundImage = "";
    }
  }

  _texturePreview(texture: THREE.Texture | null | undefined): string {
    const image = texture?.image as
      | (CanvasImageSource & { src?: string; width?: number; height?: number })
      | undefined;
    if (!image) return "";
    if (typeof image.src === "string" && image.src) return image.src;
    if (image instanceof HTMLCanvasElement) return image.toDataURL();
    if (image.width && image.height) {
      try {
        const canvas = document.createElement("canvas");
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        canvas.getContext("2d")!.drawImage(image as CanvasImageSource, 0, 0, size, size);
        return canvas.toDataURL();
      } catch {
        return "";
      }
    }
    return "";
  }

  _objectMaterials(object: THREE.Object3D | null): THREE.Material[] {
    if (!object) return [];
    const source = object.userData?._originalMaterial ?? (object as THREE.Mesh).material;
    if (!source) return [];
    return Array.isArray(source) ? source : [source];
  }

  _currentMaterial(): THREE.Material | null {
    if (!this._selected) return null;
    return this._objectMaterials(this._selected)[this._materialSlot] ?? null;
  }

  _cacheMap(material: THREE.Material, property: string, texture: THREE.Texture): void {
    if (!material || !texture) return;
    let maps = this._mapCache.get(material);
    if (!maps) {
      maps = {};
      this._mapCache.set(material, maps);
    }
    maps[property] = texture;
  }

  _cachedMap(material: THREE.Material, property: string): THREE.Texture | null {
    return this._mapCache.get(material)?.[property] ?? null;
  }

  _emitMaterial(change: Omit<ObjectEdit, "kind">): void {
    if (!this._selected) return;
    this._onObjectEdit?.(this._selected, { kind: "material", slot: this._materialSlot, ...change });
  }

  _outlinerType(entry: OutlinerEntry | THREE.Object3D, kind?: string): string {
    if (entry && typeof entry === "object" && "kind" in entry) {
      kind = entry.kind;
      entry = entry.object;
    }
    const obj = entry as SceneObj | undefined;
    if (kind === "scene" || obj?.isScene) return "Scene";
    if (obj?.isCamera) return "Camera";
    if (obj?.isLight) return "Light";
    if (obj?.isMesh) return "Mesh";
    if (obj?.isLine) return "Line";
    if (obj?.isPoints) return "Points";
    if (obj?.isSprite) return "Sprite";
    if (obj?.isGroup) return "Group";
    return "Object3D";
  }

  _outlinerName(entry: OutlinerEntry): string {
    return entry.object.name || this._outlinerType(entry);
  }

  _outlinerExtras(entry: OutlinerEntry, selected: THREE.Object3D | null): string {
    if (entry.kind !== "object") return "";
    const geometry = (entry.object as THREE.Mesh).geometry;
    const materials = this._objectMaterials(entry.object);
    if (!geometry && !materials.length) return "";

    const parts: string[] = [];
    if (geometry) {
      const geoName = this._escape(geometry.name || "");
      const active =
        entry.object === selected && this._outlinerFocus === "geometry" ? " active" : "";
      parts.push(
        `<span class="outliner-geo${active}" data-geo="1" title="${this._escape(geometry.name || geometry.type || "Geometry")}"><span class="type Geometry"></span>${geoName ? ` ${geoName}` : ""}</span>`
      );
    }
    for (let slot = 0; slot < materials.length; slot++) {
      const material = materials[slot];
      const matName = this._escape(material.name || material.type || "Material");
      const active =
        entry.object === selected &&
        this._outlinerFocus === "material" &&
        slot === this._materialSlot
          ? " active"
          : "";
      parts.push(
        `<span class="outliner-mat${active}" data-mat-slot="${slot}" title="${matName}"><span class="type Material"></span> ${matName}</span>`
      );
    }
    return ` ${parts.join(" ")}`;
  }

  _isOutlinerActive(entry: OutlinerEntry, selected: THREE.Object3D | null): boolean {
    return entry.object === selected;
  }

  _outlinerOpener(entry: OutlinerEntry): string {
    if (entry.kind !== "scene") return "";
    return `<span class="opener ${this._sceneOpen ? "open" : "closed"}"></span>`;
  }

  _emitProjectEdit(): void {
    this._onProjectEdit?.({
      cameraType: this.projectCamera?.value as SidebarSettings["cameraType"],
      antialias: this.projectAntialias?.checked,
      shadows: this.projectShadows?.checked,
      shadowType: Number(this.projectShadowType?.value),
      toneMapping: Number(this.projectToneMapping?.value),
      exposure: Number(this.projectExposure?.value),
      title: this.projectTitle?.value ?? "",
      editable: Boolean(this.projectEditable?.checked),
    });
  }

  _refreshToneMappingRow(): void {
    if (this.projectExposure) this.projectExposure.hidden = this.projectToneMapping?.value === "0";
  }

  setPlaying(playing: boolean): void {
    this.editor?.classList.toggle("playing", Boolean(playing));
    if (this.playerStop) this.playerStop.hidden = !playing;
    if (this.projectPlay) this.projectPlay.textContent = playing ? "Stop" : "Play";
  }

  setResources(
    resources: Partial<ResourceBag> | null | undefined,
    selectedObject: THREE.Object3D | null = this._selected
  ): void {
    this._resources = {
      geometries: resources?.geometries || [],
      materials: resources?.materials || [],
      textures: resources?.textures || [],
    };
    const mesh = selectedObject as SceneObj | null;
    if (mesh?.geometry) {
      this._resourceSelected = mesh.geometry.uuid;
      if (this._resourceKind === "materials" && mesh.material) {
        const material = Array.isArray(mesh.material)
          ? mesh.material[0]
          : mesh.material;
        this._resourceSelected = material?.uuid || this._resourceSelected;
      }
    }
    this._renderResourceList();
  }

  _selectResourceTab(kind?: string): void {
    this._resourceKind = (kind || "geometries") as ResourceKind;
    this._resourceSelected = null;
    this.resourceTabs?.querySelectorAll("span").forEach((tab) => {
      const el = tab as HTMLElement;
      el.classList.toggle("selected", el.dataset.resource === this._resourceKind);
    });
    if (this.resourceAssign) this.resourceAssign.hidden = this._resourceKind === "textures";
    this._renderResourceList();
  }

  _renderResourceList(): void {
    if (!this.resourceList) return;
    const items = this._resources[this._resourceKind] || [];
    const label = this._resourceKind;
    if (this.resourceCount) {
      this.resourceCount.textContent = `${items.length} ${label}`;
    }
    if (!items.length) {
      this.resourceList.innerHTML = `<div class="empty">No ${label}</div>`;
      return;
    }
    this.resourceList.innerHTML = items
      .map((item) => {
        const name = this._escape(item.name || item.type || "Item");
        const selected = item.uuid === this._resourceSelected ? " selected" : "";
        return `<div class="option${selected}" data-uuid="${item.uuid}">${name}</div>`;
      })
      .join("");
  }

  _setVec(name: string, vec: { x: number; y: number; z: number }, digits: number): void {
    for (const axis of ["x", "y", "z"] as const) {
      const input = this.properties?.querySelector(`[data-vec="${name}"][data-axis="${axis}"]`) as HTMLInputElement | null;
      if (input) input.value = Number(vec[axis]).toFixed(digits);
    }
  }

  _set(selector: string, value: string | number | null | undefined): void {
    const el = this.editor?.querySelector(selector) as HTMLInputElement | null;
    if (!el || value == null || value === "") return;
    if (typeof value === "number" && Number.isNaN(value)) return;
    el.value = String(value);
  }

  _text(selector: string, value: string): void {
    const el = this.editor?.querySelector(selector);
    if (el) el.textContent = value;
  }

  _row(selector: string, visible: boolean): void {
    const el = this.editor?.querySelector(selector) as HTMLElement | null;
    if (el) el.hidden = !visible;
  }

  _objectType(object: THREE.Object3D): string {
    const obj = object as SceneObj;
    if (obj.isPerspectiveCamera) return "PerspectiveCamera";
    if (obj.isOrthographicCamera) return "OrthographicCamera";
    if (obj.isAmbientLight) return "AmbientLight";
    if (obj.isDirectionalLight) return "DirectionalLight";
    if (obj.isHemisphereLight) return "HemisphereLight";
    if (obj.isPointLight) return "PointLight";
    if (obj.isSpotLight) return "SpotLight";
    if (obj.isSprite) return "Sprite";
    if (obj.isSkinnedMesh) return "SkinnedMesh";
    if (obj.isMesh) return "Mesh";
    if (obj.isGroup) return "Group";
    return object.type || "Object3D";
  }

  _objectTypeIcon(object: THREE.Object3D): string {
    const obj = object as SceneObj;
    if (obj.isCamera) return "C";
    if (obj.isLight) return "L";
    if (obj.isMesh) return "M";
    if (obj.isSprite) return "S";
    return "●";
  }

  _toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  _bindResizer(): void {
    const resizer = this.resizer;
    if (!resizer) return;

    const onMove = (event: PointerEvent): void => {
      if (event.isPrimary === false) return;
      const width = document.body.offsetWidth;
      const x = Math.max(260, Math.min(width - 240, width - event.clientX));
      this.sidebarWidth = x;
      resizer.style.right = `${x}px`;
      if (this.sidebar) this.sidebar.style.width = `${x}px`;
      if (this.viewport) this.viewport.style.right = `${x}px`;
      this._onLayout?.();
    };

    const onUp = (event: PointerEvent): void => {
      if (event.isPrimary === false) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };

    resizer.addEventListener("pointerdown", (event) => {
      if (event.isPrimary === false) return;
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  _bindOutlinerResizer(): void {
    const handle = this.editor?.querySelector("#outliner-resizer") as HTMLElement | null;
    const outliner = this.outliner;
    if (!handle || !outliner) return;

    const onMove = (event: PointerEvent): void => {
      if (event.isPrimary === false) return;
      const top = outliner.getBoundingClientRect().top;
      const height = Math.max(120, Math.min(window.innerHeight * 0.7, event.clientY - top));
      outliner.style.height = `${height}px`;
    };

    const onUp = (event: PointerEvent): void => {
      if (event.isPrimary === false) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };

    handle.addEventListener("pointerdown", (event) => {
      if (event.isPrimary === false) return;
      event.preventDefault();
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  _bindDrop(): void {
    const editor = this.editor;
    if (!editor) return;

    const isFileDrag = (event: DragEvent): boolean =>
      [...(event.dataTransfer?.types || [])].includes("Files");

    window.addEventListener("dragover", (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (editor.classList.contains("active")) {
        this.dropOverlay?.classList.add("visible");
      }
    });

    window.addEventListener("dragleave", (event) => {
      if (event.relatedTarget) return;
      this.dropOverlay?.classList.remove("visible");
    });

    window.addEventListener("drop", (event) => {
      this.dropOverlay?.classList.remove("visible");
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (!editor.classList.contains("active") || !event.dataTransfer?.files?.length) return;
      const files = [...event.dataTransfer.files];
      const project = files.find((f) => f.name.toLowerCase().endsWith(".json"));
      if (project) this._onOpenProject?.(project);
      else this._onUpload?.(files);
    });
  }

  _renderMode(): void {
    const cut = this.editorState.isCut();
    this.btnNavigate?.classList.toggle("selected", !cut);
    this.btnCut?.classList.toggle("selected", cut);
    this.menuNavigate?.classList.toggle("toggle-on", !cut);
    this.menuCut?.classList.toggle("toggle-on", cut);
    if (this.modeLabel) {
      this.modeLabel.textContent = cut ? "CUT" : "NAVIGATE";
      this.modeLabel.dataset.mode = cut ? "cut" : "navigate";
    }
    if (this.settingMode) this.settingMode.textContent = cut ? "Cut" : "Navigate";
    document.body.dataset.mode = cut ? "cut" : "navigate";
  }
}
