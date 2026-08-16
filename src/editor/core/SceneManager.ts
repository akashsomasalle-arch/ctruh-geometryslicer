import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ViewHelper } from "three/addons/helpers/ViewHelper.js";
import type {
  SidebarSettings,
  ViewportStats,
  HelperKey,
  ShadingMode,
  CameraKind,
  RendererKind,
} from "./types";

type EditorCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type HelperKind = "camera" | "light" | "skeleton";
type UpdatableHelper = THREE.Object3D & { update?: () => void };
type FogMaterial = THREE.Material & { fog?: boolean };
type TexturedRecord = Record<string, THREE.Texture | undefined>;

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function isPoints(object: THREE.Object3D): object is THREE.Points {
  return (object as THREE.Points).isPoints === true;
}

function isCamera(object: THREE.Object3D): object is THREE.Camera {
  return (object as THREE.Camera).isCamera === true;
}

function isPerspectiveCamera(object: THREE.Object3D): object is THREE.PerspectiveCamera {
  return (object as THREE.PerspectiveCamera).isPerspectiveCamera === true;
}

function isOrthographicCamera(object: THREE.Object3D): object is THREE.OrthographicCamera {
  return (object as THREE.OrthographicCamera).isOrthographicCamera === true;
}

function isPointLight(object: THREE.Object3D): object is THREE.PointLight {
  return (object as THREE.PointLight).isPointLight === true;
}

function isDirectionalLight(object: THREE.Object3D): object is THREE.DirectionalLight {
  return (object as THREE.DirectionalLight).isDirectionalLight === true;
}

function isSpotLight(object: THREE.Object3D): object is THREE.SpotLight {
  return (object as THREE.SpotLight).isSpotLight === true;
}

function isHemisphereLight(object: THREE.Object3D): object is THREE.HemisphereLight {
  return (object as THREE.HemisphereLight).isHemisphereLight === true;
}

function isSkinnedMesh(object: THREE.Object3D): object is THREE.SkinnedMesh {
  return (object as THREE.SkinnedMesh).isSkinnedMesh === true;
}

function isBone(object: THREE.Object3D): object is THREE.Bone {
  return (object as THREE.Bone).isBone === true;
}

function isCameraHelper(object: THREE.Object3D): object is THREE.CameraHelper {
  return object.type === "CameraHelper";
}

function isSkeletonHelper(object: THREE.Object3D): object is THREE.SkeletonHelper {
  return (object as THREE.SkeletonHelper).isSkeletonHelper === true;
}

/**
 * Owns the Three.js scene, camera, renderer, lights, grid, and render loop.
 * No cutting or interaction logic lives here.
 */
export class SceneManager {
  canvas: HTMLCanvasElement;
  viewport: HTMLElement | null;
  sizes: { width: number; height: number };
  scene: THREE.Scene;
  camera: EditorCamera;
  viewportCamera: EditorCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  piecesRoot: THREE.Group;
  previewRoot: THREE.Group;
  helpersRoot: THREE.Group;
  helperStates: {
    gridHelper: boolean;
    cameraHelpers: boolean;
    lightHelpers: boolean;
    skeletonHelpers: boolean;
  };
  _helpers: Map<THREE.Object3D, THREE.Object3D>;
  _pickerGeometry: THREE.SphereGeometry;
  _pickerMaterial: THREE.MeshBasicMaterial;
  backgroundType: string;
  environmentType: string;
  fogType: string;
  backgroundColor: string;
  backgroundColorSpace: string;
  backgroundBlurriness: number;
  backgroundIntensity: number;
  backgroundRotation: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  fogDensity: number;
  shading: ShadingMode;
  cameraType: CameraKind;
  rendererType: RendererKind;
  antialias: boolean;
  playing: boolean;
  _hdrTexture: THREE.Texture | null;
  _backgroundMap: THREE.Texture | null;
  _environmentMap: THREE.Texture | null;
  _normalMaterial: THREE.MeshNormalMaterial;
  _wireframeMaterial: THREE.MeshBasicMaterial;
  _pmrem: THREE.PMREMGenerator;
  _roomEnv: THREE.Texture;
  viewHelper: ViewHelper;
  _timer: THREE.Timer;
  grid!: THREE.GridHelper;
  _running: boolean;
  _raf: number;
  _onRender: ((stats: ViewportStats) => void) | null;
  _needsRender: boolean;
  _resizeObserver: ResizeObserver;
  _tick: (timestamp?: number) => void;
  _onResize: () => void;

  constructor(canvas: HTMLCanvasElement, viewport: HTMLElement | null = canvas.parentElement) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.sizes = this._readViewportSize();

    this.scene = new THREE.Scene();
    this.scene.name = "Scene";
    this.scene.background = null;
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(
      50,
      this.sizes.width / this.sizes.height,
      0.01,
      10000
    );
    this.camera.name = "Camera";
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera);
    this.viewportCamera = this.camera;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x333333);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.minDistance = 0.01;
    this.controls.maxDistance = 10000;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    this.piecesRoot = new THREE.Group();
    this.piecesRoot.name = "piecesRoot";
    this.scene.add(this.piecesRoot);

    this.previewRoot = new THREE.Group();
    this.previewRoot.name = "previewRoot";
    this.scene.add(this.previewRoot);

    this.helpersRoot = new THREE.Group();
    this.helpersRoot.name = "helpersRoot";
    this.scene.add(this.helpersRoot);

    this.helperStates = {
      gridHelper: true,
      cameraHelpers: true,
      lightHelpers: true,
      skeletonHelpers: true,
    };
    this._helpers = new Map();
    this._pickerGeometry = new THREE.SphereGeometry(0.35, 4, 2);
    this._pickerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, visible: false });

    this.backgroundType = "color";
    this.environmentType = "default";
    this.fogType = "none";
    this.backgroundColor = "#12151c";
    this.backgroundColorSpace = "";
    this.backgroundBlurriness = 0;
    this.backgroundIntensity = 1;
    this.backgroundRotation = 0;
    this.fogColor = "#aaaaaa";
    this.fogNear = 0.1;
    this.fogFar = 50;
    this.fogDensity = 0.05;
    this.shading = "solid";
    this.cameraType = "perspective";
    this.rendererType = "WebGLRenderer";
    this.antialias = true;
    this.playing = false;
    this._hdrTexture = null;
    this._backgroundMap = null;
    this._environmentMap = null;
    this.scene.background = new THREE.Color(0x12151c);
    this._normalMaterial = new THREE.MeshNormalMaterial();
    this._wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    this._pmrem = new THREE.PMREMGenerator(this.renderer);
    this._roomEnv = this._pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this._roomEnv;

    this.viewHelper = new ViewHelper(this.camera, this.viewport ?? this.canvas);
    this.viewHelper.location.top = 30;
    this.viewHelper.location.right = 0;
    this._timer = new THREE.Timer();
    this._timer.connect(document);

    this._addLights();
    this._addGrid();
    this._loadEnvironment();

    this._running = false;
    this._raf = 0;
    this._onRender = null;
    this._needsRender = true;
    this._tick = this._onTick.bind(this);
    this._onResize = this._handleResize.bind(this);

    this.controls.addEventListener("change", () => this.requestRender());
    window.addEventListener("resize", this._onResize);
    this._resizeObserver = new ResizeObserver(() => this.resize());
    if (this.viewport) this._resizeObserver.observe(this.viewport);
  }

  _addLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.28));

    const hemi = new THREE.HemisphereLight(0xd8e6ff, 0x2a2e38, 0.55);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 0.55);
    key.position.set(5, 10, 6);
    key.castShadow = false;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xb8c8e8, 0.35);
    fill.position.set(-6, 4, 2);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.4);
    rim.position.set(0, 6, -8);
    this.scene.add(rim);
  }

  _addGrid(): void {
    this.grid = new THREE.GridHelper(24, 24, 0x3a4254, 0x232833);
    this.grid.position.y = 0;
    this.grid.userData.ignorePick = true;
    this.scene.add(this.grid);
  }

  _loadEnvironment(): void {
    const loader = new HDRLoader();
    loader.load(
      "./hdr/panorama.hdr",
      (texture: THREE.Texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this._hdrTexture = texture;
        if (!this._backgroundMap) this._backgroundMap = texture;
        if (!this._environmentMap) this._environmentMap = texture;
        this._applyAppearance();
      },
      undefined,
      () => {
        // HDR is optional; Default uses RoomEnvironment.
      }
    );
  }

  resetCamera(): void {
    (this.camera as THREE.PerspectiveCamera).fov = 50;
    this.camera.near = 0.01;
    this.camera.far = 10000;
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 0.01;
    this.controls.maxDistance = 10000;
    this.controls.update();
    this.requestRender();
  }

  fitCameraTo(object: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    let distance = 0.1;

    if (!box.isEmpty()) {
      box.getCenter(center);
      distance = box.getBoundingSphere(new THREE.Sphere()).radius;
    } else if (object) {
      center.setFromMatrixPosition(object.matrixWorld);
    }

    const offset = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.camera.quaternion)
      .multiplyScalar(distance * 4);

    this.controls.target.copy(center);
    this.camera.position.copy(center).add(offset);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }

  setOrbitEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  setGridVisible(visible: boolean): void {
    this.helperStates.gridHelper = visible;
    if (this.grid) this.grid.visible = visible;
    this.requestRender();
  }

  setSceneAppearance(settings: SidebarSettings = {}): void {
    if (settings.backgroundType != null) this.backgroundType = settings.backgroundType;
    if (settings.environmentType != null) this.environmentType = settings.environmentType;
    if (settings.fogType != null) this.fogType = settings.fogType;
    if (settings.background != null) this.backgroundColor = settings.background;
    if (settings.backgroundColorSpace != null) this.backgroundColorSpace = settings.backgroundColorSpace;
    if (settings.backgroundBlurriness != null) this.backgroundBlurriness = settings.backgroundBlurriness;
    if (settings.backgroundIntensity != null) this.backgroundIntensity = settings.backgroundIntensity;
    if (settings.backgroundRotation != null) this.backgroundRotation = settings.backgroundRotation;
    if (settings.fogColor != null) this.fogColor = settings.fogColor;
    if (settings.fogNear != null) this.fogNear = settings.fogNear;
    if (settings.fogFar != null) this.fogFar = settings.fogFar;
    if (settings.fogDensity != null) this.fogDensity = settings.fogDensity;
    this._applyAppearance();
  }

  async loadEquirect(file: File, target = "background"): Promise<THREE.Texture> {
    const url = URL.createObjectURL(file);
    const name = file.name.toLowerCase();
    try {
      const texture = name.endsWith(".hdr")
        ? await new HDRLoader().loadAsync(url)
        : await new THREE.TextureLoader().loadAsync(url);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.needsUpdate = true;
      if (target === "environment") this._environmentMap = texture;
      else this._backgroundMap = texture;
      this._applyAppearance();
      return texture;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  setShading(mode: ShadingMode): void {
    this.shading = mode;
    this._applyShading();
    this.requestRender();
  }

  setViewportCamera(camera?: EditorCamera | null): void {
    this.viewportCamera = camera || this.camera;
    this.controls.object = this.viewportCamera;
    this.controls.update();
    this.requestRender();
  }

  getViewportCameras(): EditorCamera[] {
    const cameras: EditorCamera[] = [this.camera];
    this.piecesRoot.traverse((object: THREE.Object3D) => {
      if (isCamera(object) && !cameras.includes(object as EditorCamera)) {
        cameras.push(object as EditorCamera);
      }
    });
    return cameras;
  }

  handleViewHelperClick(event: PointerEvent): boolean {
    if (!this.viewHelper) return false;
    this.viewHelper.center.copy(this.controls.target);
    const clicked = this.viewHelper.handleClick(event);
    if (clicked) this.requestRender();
    return clicked;
  }

  _applyAppearance(): void {
    const backgroundMap = this._backgroundMap || this._hdrTexture;
    const environmentMap = this._environmentMap || this._hdrTexture;

    if (this.backgroundType === "equirect" && backgroundMap) {
      backgroundMap.mapping = THREE.EquirectangularReflectionMapping;
      backgroundMap.colorSpace = (this.backgroundColorSpace || THREE.NoColorSpace) as THREE.ColorSpace;
      backgroundMap.needsUpdate = true;
      this.scene.background = backgroundMap;
      this.scene.backgroundBlurriness = this.backgroundBlurriness;
      this.scene.backgroundIntensity = this.backgroundIntensity;
      this.scene.backgroundRotation.y = THREE.MathUtils.degToRad(this.backgroundRotation);
    } else if (this.backgroundType === "texture" && backgroundMap) {
      backgroundMap.mapping = THREE.UVMapping;
      backgroundMap.colorSpace = (this.backgroundColorSpace || THREE.NoColorSpace) as THREE.ColorSpace;
      backgroundMap.needsUpdate = true;
      this.scene.background = backgroundMap;
      this.scene.backgroundBlurriness = 0;
      this.scene.backgroundIntensity = 1;
      this.scene.backgroundRotation.y = 0;
    } else if (this.backgroundType === "color") {
      this.scene.background = new THREE.Color(this.backgroundColor);
      this.scene.backgroundBlurriness = 0;
      this.scene.backgroundIntensity = 1;
      this.scene.backgroundRotation.y = 0;
    } else {
      this.scene.background = null;
      this.scene.backgroundBlurriness = 0;
      this.scene.backgroundIntensity = 1;
      this.scene.backgroundRotation.y = 0;
    }

    if (this.environmentType === "none") {
      this.scene.environment = null;
    } else if (this.environmentType === "equirect" && environmentMap) {
      environmentMap.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = environmentMap;
    } else {
      this.scene.environment = this._roomEnv;
    }

    if (this.fogType === "linear") {
      this.scene.fog = new THREE.Fog(this.fogColor, this.fogNear, this.fogFar);
    } else if (this.fogType === "exponential") {
      this.scene.fog = new THREE.FogExp2(this.fogColor, this.fogDensity);
    } else {
      this.scene.fog = null;
    }

    this.requestRender();
  }

  _applyShading(): void {
    this.piecesRoot.traverse((object: THREE.Object3D) => {
      if (!isMesh(object)) return;
      if (!object.userData._originalMaterial) {
        object.userData._originalMaterial = object.material;
      }
      if (this.shading === "normals") object.material = this._normalMaterial;
      else if (this.shading === "wireframe") object.material = this._wireframeMaterial;
      else object.material = object.userData._originalMaterial;
    });
  }

  setCameraType(type: CameraKind): EditorCamera {
    const nextType: CameraKind = type === "orthographic" ? "orthographic" : "perspective";
    if (nextType === this.cameraType && (
      (nextType === "orthographic" && isOrthographicCamera(this.camera)) ||
      (nextType === "perspective" && isPerspectiveCamera(this.camera))
    )) {
      return this.camera;
    }

    const old = this.camera;
    const { width, height } = this.sizes;
    const aspect = width / height;
    const distance = Math.max(0.01, old.position.distanceTo(this.controls.target));
    const fov = isPerspectiveCamera(old) ? old.fov : 50;
    const frustum = 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov * 0.5));

    let next: EditorCamera;
    if (nextType === "orthographic") {
      next = new THREE.OrthographicCamera(
        (frustum * aspect) / -2,
        (frustum * aspect) / 2,
        frustum / 2,
        frustum / -2,
        0.01,
        10000
      );
      next.userData.frustumSize = frustum;
    } else {
      next = new THREE.PerspectiveCamera(50, aspect, 0.01, 10000);
    }

    next.name = "Camera";
    next.position.copy(old.position);
    next.quaternion.copy(old.quaternion);
    next.updateProjectionMatrix();

    old.removeFromParent();
    this.scene.add(next);
    this.camera = next;
    this.cameraType = nextType;
    if (this.viewportCamera === old) this.viewportCamera = next;
    this.controls.object = next;
    this.controls.update();

    this.viewHelper = new ViewHelper(next, this.viewport ?? this.canvas);
    this.viewHelper.location.top = 30;
    this.viewHelper.location.right = 0;
    this.requestRender();
    return next;
  }

  async recreateRenderer({
    antialias = this.antialias,
  }: { antialias?: boolean } = {}): Promise<void> {
    const nextAntialias = Boolean(antialias);
    const snapshot = {
      shadows: this.renderer.shadowMap.enabled,
      shadowType: this.renderer.shadowMap.type,
      toneMapping: this.renderer.toneMapping,
      exposure: this.renderer.toneMappingExposure,
    };

    const next = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: nextAntialias,
      alpha: false,
    });

    this.renderer.dispose();
    this.renderer = next;
    this.rendererType = "WebGLRenderer";
    this.antialias = nextAntialias;
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x333333);
    this.renderer.shadowMap.enabled = snapshot.shadows;
    this.renderer.shadowMap.type = snapshot.shadowType;
    this.renderer.toneMapping = snapshot.toneMapping;
    this.renderer.toneMappingExposure = snapshot.exposure;

    this._pmrem.dispose();
    this._pmrem = new THREE.PMREMGenerator(this.renderer);
    this._roomEnv = this._pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this._applyAppearance();
    this.requestRender();
  }

  setPlaying(playing: boolean): void {
    this.playing = Boolean(playing);
    if (this.playing) this.requestRender();
  }

  collectResources(): {
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
    textures: THREE.Texture[];
  } {
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const seenGeo = new Set<string>();
    const seenMat = new Set<string>();
    const seenTex = new Set<string>();

    this.piecesRoot.traverse((object: THREE.Object3D) => {
      const geometry = (object as THREE.Mesh).geometry;
      if (geometry && !seenGeo.has(geometry.uuid)) {
        seenGeo.add(geometry.uuid);
        geometries.push(geometry);
      }

      const objectMaterial = (object as THREE.Mesh).material;
      const list = Array.isArray(objectMaterial) ? objectMaterial : objectMaterial ? [objectMaterial] : [];
      for (const material of list) {
        if (!material || seenMat.has(material.uuid)) continue;
        seenMat.add(material.uuid);
        materials.push(material);
        const slots = material as unknown as TexturedRecord;
        for (const key of Object.keys(material)) {
          const value = slots[key];
          if (value?.isTexture && !seenTex.has(value.uuid)) {
            seenTex.add(value.uuid);
            textures.push(value);
          }
        }
      }
    });

    return { geometries, materials, textures };
  }

  setShadows(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  setShadowType(type: number | string): void {
    const resolved = Number(type) === THREE.PCFSoftShadowMap ? THREE.PCFShadowMap : Number(type);
    this.renderer.shadowMap.type = resolved as THREE.ShadowMapType;
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender();
  }

  setToneMapping(type: number | string): void {
    this.renderer.toneMapping = Number(type) as THREE.ToneMapping;
    this.requestRender();
  }

  setToneMappingExposure(value: number | string): void {
    this.renderer.toneMappingExposure = Number(value);
    this.requestRender();
  }

  getSidebarSettings(): SidebarSettings {
    return {
      backgroundType: this.backgroundType,
      environmentType: this.environmentType,
      background: this.backgroundColor,
      backgroundColorSpace: this.backgroundColorSpace,
      backgroundBlurriness: this.backgroundBlurriness,
      backgroundIntensity: this.backgroundIntensity,
      backgroundRotation: this.backgroundRotation,
      fogType: this.fogType,
      fogColor: this.fogColor,
      fogNear: this.fogNear,
      fogFar: this.fogFar,
      fogDensity: this.fogDensity,
      shadows: this.renderer.shadowMap.enabled,
      shadowType: this.renderer.shadowMap.type,
      toneMapping: this.renderer.toneMapping,
      exposure: this.renderer.toneMappingExposure,
      cameraType: this.cameraType,
      rendererType: this.rendererType,
      antialias: this.antialias,
    };
  }

  setHelperState(key: HelperKey, visible: boolean): void {
    if (key === "gridHelper") {
      this.setGridVisible(visible);
      return;
    }
    this.helperStates[key] = visible;
    this._applyHelperVisibility();
    this.requestRender();
  }

  syncHelpers(): void {
    const wanted = new Set<THREE.Object3D>();
    this.piecesRoot.traverse((object: THREE.Object3D) => {
      if (object === this.piecesRoot) return;
      if (object.userData?.isHelper || object.userData?.ignorePick) return;
      if (!this._helperKind(object)) return;
      wanted.add(object);
      if (!this._helpers.has(object)) this._addHelper(object);
    });

    for (const object of [...this._helpers.keys()]) {
      if (!wanted.has(object)) this._removeHelper(object);
    }

    this._applyHelperVisibility();
  }

  updateObjectHelpers(): void {
    for (const helper of this._helpers.values()) {
      (helper as UpdatableHelper).update?.();
    }
  }

  _helperKind(object: THREE.Object3D): HelperKind | null {
    if (isCamera(object)) return "camera";
    if (
      isPointLight(object) ||
      isDirectionalLight(object) ||
      isSpotLight(object) ||
      isHemisphereLight(object)
    ) {
      return "light";
    }
    if (isSkinnedMesh(object) && object.skeleton?.bones?.[0]) return "skeleton";
    if (isBone(object) && object.parent && !isBone(object.parent)) return "skeleton";
    return null;
  }

  _addHelper(object: THREE.Object3D): void {
    const helper = this._createHelper(object);
    if (!helper) return;

    helper.userData.isHelper = true;
    helper.traverse((child: THREE.Object3D) => {
      child.userData.isHelper = true;
      const mesh = child as THREE.Mesh;
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat) (mat as FogMaterial).fog = false;
        }
      }
    });

    const picker = new THREE.Mesh(this._pickerGeometry, this._pickerMaterial);
    picker.name = "picker";
    picker.userData.object = object;
    picker.userData.isHelper = true;
    helper.add(picker);

    this.helpersRoot.add(helper);
    this._helpers.set(object, helper);
  }

  _createHelper(object: THREE.Object3D): THREE.Object3D | null {
    if (isCamera(object)) return new THREE.CameraHelper(object);
    if (isPointLight(object)) return new THREE.PointLightHelper(object, 0.25);
    if (isDirectionalLight(object)) return new THREE.DirectionalLightHelper(object, 0.5);
    if (isSpotLight(object)) return new THREE.SpotLightHelper(object);
    if (isHemisphereLight(object)) return new THREE.HemisphereLightHelper(object, 0.5);
    if (isSkinnedMesh(object) && object.skeleton?.bones?.[0]) {
      return new THREE.SkeletonHelper(object.skeleton.bones[0]);
    }
    if (isBone(object)) return new THREE.SkeletonHelper(object);
    return null;
  }

  _removeHelper(object: THREE.Object3D): void {
    const helper = this._helpers.get(object);
    if (!helper) return;
    helper.removeFromParent();
    helper.traverse((child: THREE.Object3D) => {
      const geometry = (child as THREE.Mesh).geometry;
      if (geometry && geometry !== this._pickerGeometry) geometry.dispose?.();
    });
    this._helpers.delete(object);
  }

  _applyHelperVisibility(): void {
    for (const helper of this._helpers.values()) {
      if (isCameraHelper(helper)) helper.visible = this.helperStates.cameraHelpers;
      else if (isSkeletonHelper(helper)) helper.visible = this.helperStates.skeletonHelpers;
      else helper.visible = this.helperStates.lightHelpers;
    }
  }

  toJSON(): {
    camera: ReturnType<EditorCamera["toJSON"]>;
    controls: { target: number[]; minDistance: number; maxDistance: number };
    renderer: { shadows: boolean; toneMapping: number; toneMappingExposure: number };
    gridVisible: boolean;
    scene: ReturnType<THREE.Group["toJSON"]>;
  } {
    return {
      camera: this.camera.toJSON(),
      controls: {
        target: this.controls.target.toArray(),
        minDistance: this.controls.minDistance,
        maxDistance: this.controls.maxDistance,
      },
      renderer: {
        shadows: this.renderer.shadowMap.enabled,
        toneMapping: this.renderer.toneMapping,
        toneMappingExposure: this.renderer.toneMappingExposure,
      },
      gridVisible: this.grid?.visible !== false,
      scene: this.piecesRoot.toJSON(),
    };
  }

  async fromJSON(json: any): Promise<THREE.Object3D | null> {
    const loader = new THREE.ObjectLoader();

    if (json.camera) {
      const camera = await loader.parseAsync(json.camera);
      this.camera.copy(camera as THREE.PerspectiveCamera & THREE.OrthographicCamera);
      this.resize();
    }

    if (json.controls) {
      if (json.controls.target) this.controls.target.fromArray(json.controls.target);
      if (json.controls.minDistance != null) this.controls.minDistance = json.controls.minDistance;
      if (json.controls.maxDistance != null) this.controls.maxDistance = json.controls.maxDistance;
      this.controls.update();
    }

    if (json.renderer) {
      if (json.renderer.shadows != null) this.renderer.shadowMap.enabled = json.renderer.shadows;
      if (json.renderer.toneMapping != null) this.renderer.toneMapping = json.renderer.toneMapping;
      if (json.renderer.toneMappingExposure != null) {
        this.renderer.toneMappingExposure = json.renderer.toneMappingExposure;
      }
    }

    if (json.gridVisible != null) this.setGridVisible(json.gridVisible);

    this.requestRender();
    const sceneJson = json.scene || json.pieces;
    return sceneJson ? loader.parseAsync(sceneJson) : null;
  }

  resize(): void {
    if (this._syncSize()) this.requestRender();
  }

  requestRender(): void {
    this._needsRender = true;
  }

  onRender(fn: (stats: ViewportStats) => void): void {
    this._onRender = fn;
  }

  getGeometryStats(): { objects: number; vertices: number; triangles: number } {
    let objects = 0;
    let vertices = 0;
    let triangles = 0;

    this.piecesRoot.traverseVisible((object: THREE.Object3D) => {
      if (object === this.piecesRoot) return;
      objects++;

      if (!isMesh(object) && !isPoints(object)) return;
      const geometry = (object as THREE.Mesh | THREE.Points).geometry;
      const position = geometry?.attributes?.position;
      if (!position) return;

      vertices += position.count;
      if (!isMesh(object)) return;
      triangles += geometry.index ? geometry.index.count / 3 : position.count / 3;
    });

    return { objects, vertices, triangles };
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this._tick();
  }

  stop(): void {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  _onTick(timestamp?: number): void {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._tick);

    // Same as the three.js editor: only draw when something changed.
    // Calling controls.update() every idle frame recomputes lookAt and
    // makes GPU time jitter even when the camera is still.
    this._timer.update(timestamp);
    const delta = this._timer.getDelta();
    if (this.viewHelper?.animating || this.playing) {
      this.viewHelper?.update(delta);
      this._needsRender = true;
    }

    if (!this._needsRender) return;

    this.syncHelpers();
    this.updateObjectHelpers();

    const damping = this.controls.update();
    this._needsRender = Boolean(damping) || Boolean(this.viewHelper?.animating);

    const start = performance.now();
    const camera = this.viewportCamera || this.camera;
    this.renderer.render(this.scene, camera);
    if (this.viewHelper && camera === this.camera) {
      this.renderer.autoClear = false;
      this.viewHelper.center.copy(this.controls.target);
      this.viewHelper.render(this.renderer);
      this.renderer.autoClear = true;
    }
    const frametime = performance.now() - start;
    this._onRender?.({ ...this.getGeometryStats(), frametime });
  }

  _handleResize(): void {
    this.resize();
  }

  _readViewportSize(): { width: number; height: number } {
    const width = Math.max(1, Math.round(this.viewport?.clientWidth || 1));
    const height = Math.max(1, Math.round(this.viewport?.clientHeight || 1));
    return { width, height };
  }

  _syncSize(): boolean {
    const { width, height } = this._readViewportSize();
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    if (
      width === this.sizes.width &&
      height === this.sizes.height &&
      pixelRatio === this.renderer.getPixelRatio()
    ) {
      return false;
    }

    this.sizes.width = width;
    this.sizes.height = height;
    const aspect = width / height;
    if (isOrthographicCamera(this.camera)) {
      const frustum = this.camera.userData.frustumSize || 10;
      this.camera.left = (frustum * aspect) / -2;
      this.camera.right = (frustum * aspect) / 2;
      this.camera.top = frustum / 2;
      this.camera.bottom = frustum / -2;
    } else {
      this.camera.aspect = aspect;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(pixelRatio);
    return true;
  }

  dispose(): void {
    this.stop();
    window.removeEventListener("resize", this._onResize);
    this._resizeObserver?.disconnect();
    this.controls.dispose();
    this._timer.dispose();
    this.renderer.dispose();
  }
}
