import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { USDLoader } from "three/addons/loaders/USDLoader.js";
import type { ModelDef } from "./types";
import type { SceneManager } from "./SceneManager";

type ShadowLight = THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;
type TargetedLight = THREE.DirectionalLight | THREE.SpotLight;
type KeptObject = { object: THREE.Object3D; meshes: THREE.Mesh[] };
type AddableResult = { object: THREE.Object3D; snap?: boolean };

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function isLight(object: THREE.Object3D): object is THREE.Light {
  return (object as THREE.Light).isLight === true;
}

function isCamera(object: THREE.Object3D): object is THREE.Camera {
  return (object as THREE.Camera).isCamera === true;
}

function isAmbientLight(object: THREE.Object3D): object is THREE.AmbientLight {
  return (object as THREE.AmbientLight).isAmbientLight === true;
}

function isDirectionalLight(object: THREE.Object3D): object is THREE.DirectionalLight {
  return (object as THREE.DirectionalLight).isDirectionalLight === true;
}

function isSprite(object: THREE.Object3D): object is THREE.Sprite {
  return (object as THREE.Sprite).isSprite === true;
}

function isGroup(object: THREE.Object3D): object is THREE.Group {
  return (object as THREE.Group).isGroup === true;
}

function isScene(object: THREE.Object3D): object is THREE.Scene {
  return (object as THREE.Scene).isScene === true;
}

function isGridHelper(object: THREE.Object3D): object is THREE.GridHelper {
  return object.type === "GridHelper";
}

const MODEL_ALIASES: Record<string, string> = { cube: "box" };

export const MODELS: readonly ModelDef[] = [
  { id: "box", name: "Box", meshName: "Box", type: "primitive", shape: "box" },
  { id: "capsule", name: "Capsule", meshName: "Capsule", type: "primitive", shape: "capsule" },
  { id: "circle", name: "Circle", meshName: "Circle", type: "primitive", shape: "circle" },
  { id: "cylinder", name: "Cylinder", meshName: "Cylinder", type: "primitive", shape: "cylinder" },
  { id: "dodecahedron", name: "Dodecahedron", meshName: "Dodecahedron", type: "primitive", shape: "dodecahedron" },
  { id: "icosahedron", name: "Icosahedron", meshName: "Icosahedron", type: "primitive", shape: "icosahedron" },
  { id: "lathe", name: "Lathe", meshName: "Lathe", type: "primitive", shape: "lathe" },
  { id: "octahedron", name: "Octahedron", meshName: "Octahedron", type: "primitive", shape: "octahedron" },
  { id: "plane", name: "Plane", meshName: "Plane", type: "primitive", shape: "plane" },
  { id: "ring", name: "Ring", meshName: "Ring", type: "primitive", shape: "ring" },
  { id: "sphere", name: "Sphere", meshName: "Sphere", type: "primitive", shape: "sphere" },
  { id: "sprite", name: "Sprite", meshName: "Sprite", type: "sprite" },
  { id: "tetrahedron", name: "Tetrahedron", meshName: "Tetrahedron", type: "primitive", shape: "tetrahedron" },
  { id: "text", name: "Text", meshName: "Text", type: "text" },
  { id: "torus", name: "Torus", meshName: "Torus", type: "primitive", shape: "torus" },
  { id: "torusknot", name: "TorusKnot", meshName: "TorusKnot", type: "primitive", shape: "torusknot" },
  { id: "tube", name: "Tube", meshName: "Tube", type: "primitive", shape: "tube" },
  { id: "tshirt", name: "T-Shirt", meshName: "T-Shirt", type: "gltf", url: "./models/tshirt.glb" },
];

const PRIMITIVE_COLORS: Record<string, number> = {
  box: 0x4c8dff,
  capsule: 0xf4a261,
  circle: 0x90be6d,
  cylinder: 0xe9c46a,
  dodecahedron: 0x9b5de5,
  icosahedron: 0x00bbf9,
  lathe: 0xf15bb5,
  octahedron: 0x00f5d4,
  plane: 0x8d99ae,
  ring: 0xef476f,
  sphere: 0xe07a5f,
  tetrahedron: 0x118ab2,
  torus: 0x81b29a,
  torusknot: 0x577590,
  tube: 0xf77f00,
};

const MESH_NAMES: Record<string, string> = {
  box: "Box",
  capsule: "Capsule",
  circle: "Circle",
  cylinder: "Cylinder",
  dodecahedron: "Dodecahedron",
  icosahedron: "Icosahedron",
  lathe: "Lathe",
  octahedron: "Octahedron",
  plane: "Plane",
  ring: "Ring",
  sphere: "Sphere",
  tetrahedron: "Tetrahedron",
  torus: "Torus",
  torusknot: "TorusKnot",
  tube: "Tube",
};

/**
 * Loads GLTF models or builds primitive meshes, then frames them on the grid.
 * Switching models disposes the previous graph. Cutting is not handled here.
 */
export class ModelManager {
  sceneManager: SceneManager;
  currentId: string | null;
  root: THREE.Object3D | null;
  _onLoad: ((root: THREE.Object3D, meshes: THREE.Mesh[]) => void) | null;
  gltfLoader: GLTFLoader;
  fbxLoader: FBXLoader;
  usdLoader: USDLoader;
  uploads: { id: string; name: string; files: File[] }[];
  _objectUrls: string[];

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
    this.currentId = null;
    this.root = null;
    this._onLoad = null;

    const draco = new DRACOLoader();
    draco.setDecoderPath("./draco/gltf/");

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(draco);
    this.fbxLoader = new FBXLoader();
    this.usdLoader = new USDLoader();
    this.uploads = [];
    this._objectUrls = [];
  }

  getCatalog(): ModelDef[] {
    return [
      ...MODELS,
      ...this.uploads.map((u) => ({ id: u.id, name: u.name, type: "upload" as const })),
    ];
  }

  onLoad(fn: (root: THREE.Object3D, meshes: THREE.Mesh[]) => void): void {
    this._onLoad = fn;
  }

  clear(): THREE.Mesh[] {
    this._disposeRoot();
    this._revokeObjectUrls();
    this.currentId = null;
    const root = this.sceneManager.piecesRoot;
    this.root = root;
    this._onLoad?.(root, []);
    return [];
  }

  /**
   * Restore meshes from a parsed Object3D without re-centering or scaling.
   * Used when opening a saved project JSON.
   */
  replaceFromObject(object: THREE.Object3D, id = "project"): THREE.Mesh[] {
    this._disposeRoot();
    this._revokeObjectUrls();

    const piecesRoot = this.sceneManager.piecesRoot;
    const skip = (child: THREE.Object3D) =>
      isGridHelper(child) ||
      child.userData?.isHelper ||
      child.userData?.ignorePick;

    if (isGroup(object) || isScene(object)) {
      for (const child of [...object.children]) {
        if (skip(child)) continue;
        piecesRoot.add(child);
      }
    } else if (!skip(object)) {
      piecesRoot.add(object);
    }

    const meshes = this.collectMeshes(piecesRoot);
    this.root = piecesRoot;
    this.currentId = id;
    this._onLoad?.(piecesRoot, meshes);
    return meshes;
  }

  async load(id: string): Promise<THREE.Mesh[]> {
    id = MODEL_ALIASES[id] || id;
    const upload = this.uploads.find((u) => u.id === id);
    if (upload) {
      return this._loadFiles(upload.files, upload.id);
    }

    const def = MODELS.find((m) => m.id === id);
    if (!def) throw new Error(`Unknown model: ${id}`);

    this._disposeRoot();
    this._revokeObjectUrls();

    let root: THREE.Object3D;
    if (def.type === "gltf") {
      root = await this._loadGltf(def.url!);
    } else if (def.type === "text") {
      root = await this._createText();
    } else if (def.type === "sprite") {
      root = new THREE.Sprite(new THREE.SpriteMaterial());
      root.name = "Sprite";
    } else {
      root = this._createPrimitive(def.shape!);
    }

    return this._commitRoot(root, id, def.type === "gltf", def.meshName || def.name);
  }

  /**
   * Create or load an object and append it to the scene without replacing existing parts.
   */
  async add(id: string): Promise<KeptObject> {
    id = MODEL_ALIASES[id] || id;

    const def = MODELS.find((m) => m.id === id);
    if (def?.type === "gltf") {
      const root = await this._loadGltf(def.url!);
      return this._appendRoot(root, def.meshName || def.name, true);
    }

    const built = await this._buildAddable(id);
    if (built.snap === false) {
      built.object.name = this._uniqueName(built.object.name || id);
      if (isLight(built.object)) {
        if (!built.object.parent) this._addLightToRoot(built.object);
      } else {
        this.sceneManager.piecesRoot.add(built.object);
      }
      this._prepareShading(built.object);
      this.sceneManager.requestRender();
      return { object: built.object, meshes: this.collectMeshes(built.object) };
    }

    return this._appendRoot(built.object, built.object.name || id, false);
  }

  cloneObject(source: THREE.Object3D): THREE.Object3D {
    const cloned = source.clone(true);
    cloned.traverse((child: THREE.Object3D) => {
      if (!isMesh(child) || !child.material) return;
      child.material = Array.isArray(child.material)
        ? child.material.map((mat: THREE.Material) => mat.clone())
        : child.material.clone();
    });
    cloned.name = this._uniqueName(source.name ? `${source.name} clone` : "clone");
    return cloned;
  }

  /**
   * @param {FileList | File[]} fileList
   * @returns {Promise<{ id: string, name: string }>}
   */
  async addUpload(fileList: FileList | File[]): Promise<{ id: string; name: string }> {
    const files = [...fileList];
    if (!files.length) throw new Error("No file selected.");
    if (!files.some((f) => /\.(glb|gltf|obj|fbx|usdz|usd|usda|usdc)$/i.test(f.name))) {
      throw new Error("Upload a .glb, .gltf, .obj, .fbx, or .usdz file.");
    }

    const id = `upload-${Date.now()}`;
    const name = this._displayName(files);
    await this._loadFiles(files, id);
    this.uploads.push({ id, name, files });
    return { id, name };
  }

  async _loadFiles(files: File[], id: string): Promise<THREE.Mesh[]> {
    const previousUrls = this._objectUrls;
    this._objectUrls = [];
    try {
      const root = await this._parseUserFiles(files);
      if (!this.collectMeshes(root).length) {
        throw new Error("That file has no meshes to cut.");
      }
      this._disposeRoot();
      this._revokeUrls(previousUrls);
      return this._commitRoot(root, id, true);
    } catch (err) {
      this._revokeUrls(this._objectUrls);
      this._objectUrls = previousUrls;
      throw err;
    }
  }

  _commitRoot(root: THREE.Object3D, id: string, normalize = true, displayName = ""): THREE.Mesh[] {
    const { meshes } = this._keepObject(root, displayName || root.name || id, normalize);
    this.currentId = id;
    this.sceneManager.requestRender();
    this._onLoad?.(this.sceneManager.piecesRoot, meshes);
    return meshes;
  }

  _appendRoot(root: THREE.Object3D, name: string, normalize = false): KeptObject {
    const result = this._keepObject(root, name, normalize);
    this.sceneManager.requestRender();
    return result;
  }

  /**
   * Add a prepared object to the scene without flattening multi-mesh models.
   * A single mesh is stored as itself; a GLTF stays a group so the gizmo moves all of it.
   */
  _keepObject(root: THREE.Object3D, name: string, normalize: boolean): KeptObject {
    if (normalize) this._prepareRoot(root);
    else this._centerAtOrigin(root);

    const piecesRoot = this.sceneManager.piecesRoot;
    piecesRoot.add(root);
    root.updateMatrixWorld(true);

    const meshes = this.collectMeshes(root);
    if (!meshes.length && !isGroup(root) && !isSprite(root)) {
      piecesRoot.remove(root);
      throw new Error("That file has no meshes to cut.");
    }

    let object = root;
    if (meshes.length === 1 && root !== meshes[0]) {
      const mesh = meshes[0];
      mesh.name = this._uniqueName(name || mesh.name || "Mesh");
      piecesRoot.attach(mesh);
      piecesRoot.remove(root);
      object = mesh;
    } else {
      root.name = this._uniqueName(name || root.name || "Object");
    }

    this._snapToOrigin(object);
    this.root = piecesRoot;
    return { object, meshes };
  }

  _snapToOrigin(object: THREE.Object3D): void {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    object.position.sub(box.getCenter(new THREE.Vector3()));
    object.updateWorldMatrix(true, true);
  }

  standardName(name: string): string {
    const raw = String(name || "Mesh").trim() || "Mesh";
    const base = raw
      .replace(/(?:[-\s]*cut)+$/i, "")
      .replace(/[\s_-]*\d+$/, "")
      .trim() || "Mesh";
    const key = base.toLowerCase();
    if (MESH_NAMES[key]) return MESH_NAMES[key];
    const model = MODELS.find((item) => item.id === key || item.name.toLowerCase() === key);
    if (model) return model.meshName || model.name;
    if (base === key) return base.charAt(0).toUpperCase() + base.slice(1);
    return base;
  }

  _uniqueName(base: string): string {
    const stem = this.standardName(base);
    const names = new Set<string>();
    this.sceneManager.piecesRoot.traverse((object: THREE.Object3D) => {
      if (object.name) names.add(object.name);
    });
    let name = stem;
    let index = 1;
    while (names.has(name)) {
      name = `${stem}${index}`;
      index++;
    }
    return name;
  }

  _displayName(files: File[]): string {
    const preferred = files.find((f) =>
      /\.(glb|gltf|obj|fbx|usdz|usd|usda|usdc)$/i.test(f.name)
    );
    return preferred?.name || files[0].name;
  }

  async _parseUserFiles(files: File[]): Promise<THREE.Object3D> {
    const match = (ext: string) =>
      files.find((f) => f.name.toLowerCase().endsWith(ext));

    const glb = match(".glb");
    const gltf = match(".gltf");
    const obj = match(".obj");
    const fbx = match(".fbx");
    const usdz = files.find((f) =>
      /\.(usdz|usd|usda|usdc)$/i.test(f.name)
    );

    if (glb) return this._parseGlb(glb);
    if (gltf) return this._parseGltfFiles(gltf, files);
    if (obj) return this._parseObj(obj, files);
    if (fbx) return this._parseFbx(fbx);
    if (usdz) return this._parseUsdz(usdz);

    throw new Error("Upload a .glb, .gltf, .obj, .fbx, or .usdz file.");
  }

  _blobUrl(file: File): string {
    const url = URL.createObjectURL(file);
    this._objectUrls.push(url);
    return url;
  }

  _revokeObjectUrls(): void {
    this._revokeUrls(this._objectUrls);
    this._objectUrls = [];
  }

  _revokeUrls(urls: string[]): void {
    for (const url of urls) URL.revokeObjectURL(url);
  }

  _fileMap(files: File[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const file of files) {
      const url = this._blobUrl(file);
      map.set(file.name, url);
      map.set(file.name.toLowerCase(), url);
    }
    return map;
  }

  _urlModifier(map: Map<string, string>): (url: string) => string {
    return (url: string) => {
      const name = url.split("/").pop()!.split("?")[0];
      return map.get(name) || map.get(name.toLowerCase()) || url;
    };
  }

  async _parseGlb(file: File): Promise<THREE.Group> {
    const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      this.gltfLoader.parse(
        buffer,
        "",
        (gltf: { scene: THREE.Group }) => resolve(gltf.scene),
        reject
      );
    });
  }

  _parseGltfFiles(gltfFile: File, files: File[]): Promise<THREE.Group> {
    const map = this._fileMap(files);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(this._urlModifier(map));
    const loader = new GLTFLoader(manager);
    if (this.gltfLoader.dracoLoader) loader.setDRACOLoader(this.gltfLoader.dracoLoader);

    const url = map.get(gltfFile.name) || map.get(gltfFile.name.toLowerCase());
    return new Promise((resolve, reject) => {
      loader.load(url!, (gltf: { scene: THREE.Group }) => resolve(gltf.scene), undefined, reject);
    });
  }

  async _parseObj(objFile: File, files: File[]): Promise<THREE.Group> {
    const map = this._fileMap(files);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(this._urlModifier(map));

    const objLoader = new OBJLoader(manager);
    const mtlFile = files.find((f) => f.name.toLowerCase().endsWith(".mtl"));
    if (mtlFile) {
      const mtlLoader = new MTLLoader(manager);
      const materials = mtlLoader.parse(await mtlFile.text(), "");
      materials.preload();
      objLoader.setMaterials(materials);
    }

    return objLoader.parse(await objFile.text());
  }

  async _parseFbx(file: File): Promise<THREE.Group> {
    const buffer = await file.arrayBuffer();
    return this.fbxLoader.parse(buffer, "");
  }

  async _parseUsdz(file: File): Promise<THREE.Group> {
    const buffer = await file.arrayBuffer();
    return this.usdLoader.parse(buffer);
  }

  collectMeshes(root?: THREE.Object3D | null): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    if (root === undefined) root = this.root;
    if (!root) return meshes;
    root.traverse((child: THREE.Object3D) => {
      if (isMesh(child) && !child.userData.ignorePick && !child.userData.isHelper) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  async _buildAddable(id: string): Promise<AddableResult> {
    if (id === "group") {
      const group = new THREE.Group();
      group.name = "Group";
      return { object: group };
    }
    if (id === "sprite") {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
      sprite.name = "Sprite";
      return { object: sprite };
    }
    if (id === "text") return { object: await this._createText() };
    if (id === "ambient" || id === "directional" || id === "hemisphere" || id === "point" || id === "spot") {
      const light = this._createLight(id);
      this._addLightToRoot(light);
      return { object: light, snap: false };
    }
    if (id === "orthographic" || id === "perspective") {
      return { object: this._createCamera(id), snap: false };
    }

    const mesh = this._createMesh(id);
    if (!mesh) throw new Error(`Unknown addable: ${id}`);
    return { object: mesh };
  }

  _createMesh(shape: string): THREE.Mesh | null {
    const geometry = this._geometryFor(shape);
    if (!geometry) return null;

    const flat = shape === "circle" || shape === "plane" || shape === "ring" || shape === "lathe";
    const material = new THREE.MeshStandardMaterial({
      color: PRIMITIVE_COLORS[shape] ?? 0xcccccc,
      metalness: 0.15,
      roughness: 0.45,
      side: flat ? THREE.DoubleSide : THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = MESH_NAMES[shape] || shape;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _geometryFor(shape: string): THREE.BufferGeometry | null {
    switch (shape) {
      case "box":
        return new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
      case "capsule":
        return new THREE.CapsuleGeometry(1, 1, 4, 8, 1);
      case "circle":
        return new THREE.CircleGeometry(1, 32, 0, Math.PI * 2);
      case "cylinder":
        return new THREE.CylinderGeometry(1, 1, 1, 32, 1, false, 0, Math.PI * 2);
      case "dodecahedron":
        return new THREE.DodecahedronGeometry(1, 0);
      case "icosahedron":
        return new THREE.IcosahedronGeometry(1, 0);
      case "lathe":
        return new THREE.LatheGeometry();
      case "octahedron":
        return new THREE.OctahedronGeometry(1, 0);
      case "plane":
        return new THREE.PlaneGeometry(1, 1, 1, 1);
      case "ring":
        return new THREE.RingGeometry(0.5, 1, 32, 1, 0, Math.PI * 2);
      case "sphere":
        return new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI);
      case "tetrahedron":
        return new THREE.TetrahedronGeometry(1, 0);
      case "torus":
        return new THREE.TorusGeometry(1, 0.4, 12, 48, Math.PI * 2);
      case "torusknot":
        return new THREE.TorusKnotGeometry(1, 0.4, 64, 8, 2, 3);
      case "tube":
        return new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(2, 2, -2),
            new THREE.Vector3(2, -2, -0.6666666666666667),
            new THREE.Vector3(-2, -2, 0.6666666666666667),
            new THREE.Vector3(-2, 2, 2),
          ]),
          64,
          1,
          8,
          false
        );
      default:
        return null;
    }
  }

  async _createText(): Promise<THREE.Mesh> {
    const { FontLoader } = await import("three/addons/loaders/FontLoader.js");
    const { TextGeometry } = await import("three/addons/geometries/TextGeometry.js");
    const fontJson = (await import("three/examples/fonts/helvetiker_bold.typeface.json")) as {
      default?: import("three/addons/loaders/FontLoader.js").FontData;
    } & import("three/addons/loaders/FontLoader.js").FontData;
    const font = new FontLoader().parse(fontJson.default ?? fontJson);
    const geometry = new TextGeometry("THREE.JS", {
      font,
      size: 1,
      depth: 0.5,
      curveSegments: 4,
      bevelEnabled: false,
    });
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = "Text";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  _createLight(type: string): THREE.Light {
    let light: THREE.Light;
    if (type === "ambient") {
      light = new THREE.AmbientLight(0x222222);
      light.name = "AmbientLight";
    } else if (type === "directional") {
      light = new THREE.DirectionalLight(0xffffff, 1);
      light.name = "DirectionalLight";
      light.position.set(5, 10, 7.5);
      this._setupLightShadow(light);
      light.castShadow = true;
    } else if (type === "hemisphere") {
      light = new THREE.HemisphereLight(0x00aaff, 0xffaa00, 1);
      light.name = "HemisphereLight";
      light.position.set(0, 10, 0);
    } else if (type === "point") {
      light = new THREE.PointLight(0xffffff, 1, 0);
      light.name = "PointLight";
      this._setupLightShadow(light);
    } else {
      light = new THREE.SpotLight(0xffffff, 1, 0, Math.PI * 0.1, 0);
      light.name = "SpotLight";
      light.position.set(5, 10, 7.5);
      this._setupLightShadow(light);
    }
    return light;
  }

  _setupLightShadow(light: THREE.Light): void {
    const shadow = (light as ShadowLight).shadow;
    shadow.mapSize.set(2048, 2048);
    shadow.bias = -0.0004;
    shadow.normalBias = 0.03;
    shadow.intensity = 1;
    if (isDirectionalLight(light)) {
      const camera = light.shadow.camera;
      camera.near = 0.5;
      camera.far = 60;
      camera.left = -16;
      camera.right = 16;
      camera.top = 16;
      camera.bottom = -16;
      camera.updateProjectionMatrix();
    } else if (shadow?.camera) {
      shadow.camera.near = 0.1;
      shadow.camera.far = 60;
      shadow.camera.updateProjectionMatrix();
    }
    const target = (light as TargetedLight).target;
    if (target) {
      target.userData.ignorePick = true;
      target.userData.isLightTarget = true;
    }
  }

  _addLightToRoot(light: THREE.Light, root: THREE.Object3D = this.sceneManager.piecesRoot): THREE.Light {
    root.add(light);
    const target = (light as TargetedLight).target;
    if (target && target.parent !== root) root.add(target);
    return light;
  }

  _createCamera(type: string): THREE.Camera {
    if (type === "orthographic") {
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
      camera.name = "OrthographicCamera";
      return camera;
    }
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.name = "PerspectiveCamera";
    return camera;
  }

  _createPrimitive(shape: string): THREE.Group {
    const mesh = this._createMesh(shape === "cube" ? "box" : shape) || this._createMesh("box")!;
    const group = new THREE.Group();
    group.name = MESH_NAMES[shape] || mesh.name || shape;
    group.add(mesh);
    return group;
  }

  _loadGltf(url: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, (gltf: { scene: THREE.Group }) => resolve(gltf.scene), undefined, reject);
    });
  }

  _centerAtOrigin(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (!box.isEmpty()) root.position.sub(box.getCenter(new THREE.Vector3()));
    this._prepareShading(root);
  }

  _prepareShading(root: THREE.Object3D): void {
    root.traverse((child: THREE.Object3D) => {
      if (!isMesh(child)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.geometry && !child.geometry.attributes.normal) {
        child.geometry.computeVertexNormals();
      }
    });
  }

  _prepareRoot(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const target = 2.4;
    const scale = target / maxDim;

    root.position.sub(center);
    root.scale.multiplyScalar(scale);
    root.updateMatrixWorld(true);
    this._prepareShading(root);
  }

  ensureDefaultLights(): THREE.Light[] {
    const root = this.sceneManager.piecesRoot;
    const added: THREE.Light[] = [];
    if (!root.children.some((child: THREE.Object3D) => isAmbientLight(child))) {
      added.push(this._addLightToRoot(this._createLight("ambient"), root));
    }
    if (!root.children.some((child: THREE.Object3D) => isDirectionalLight(child))) {
      added.push(this._addLightToRoot(this._createLight("directional"), root));
    }
    if (added.length) this.sceneManager.requestRender();
    return added;
  }

  _disposeRoot(): void {
    const parent = this.sceneManager.piecesRoot;
    for (const child of [...parent.children]) {
      if (isLight(child) || isCamera(child) || child.userData?.isLightTarget) continue;
      parent.remove(child);
      this._disposeObject(child);
    }
    this.root = null;
  }

  _disposeObject(object: THREE.Object3D): void {
    object.traverse((child: THREE.Object3D) => {
      if (!isMesh(child)) return;
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) mat?.dispose?.();
    });
  }
}
