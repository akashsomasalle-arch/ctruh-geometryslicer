import type * as THREE from "three";

export type EditorModeName = "navigate" | "cut";
export type PointerState = "idle" | "cutting" | "dragging";
export type HelperKey = "gridHelper" | "cameraHelpers" | "lightHelpers" | "skeletonHelpers";
export type ResourceKind = "geometries" | "materials" | "textures";
export type ShadingMode = "solid" | "normals" | "wireframe";
export type CameraKind = "perspective" | "orthographic";
export type RendererKind = "WebGLRenderer" | "WebGPURenderer";

export interface HistoryCommand {
  label?: string;
  execute: () => void;
  undo: () => void;
  dispose?: () => void;
}

export interface ModelDef {
  id: string;
  name: string;
  meshName?: string;
  type: "primitive" | "gltf" | "text" | "sprite" | "upload";
  shape?: string;
  url?: string;
}

export interface SidebarSettings {
  backgroundType?: string;
  environmentType?: string;
  background?: string;
  backgroundColorSpace?: string;
  backgroundBlurriness?: number;
  backgroundIntensity?: number;
  backgroundRotation?: number;
  fogType?: string;
  fogColor?: string;
  fogNear?: number;
  fogFar?: number;
  fogDensity?: number;
  shadows?: boolean;
  shadowType?: number;
  toneMapping?: number;
  exposure?: number;
  cameraType?: CameraKind;
  rendererType?: RendererKind;
  antialias?: boolean;
  title?: string;
  editable?: boolean;
}

export interface ViewportStats {
  objects: number;
  vertices: number;
  triangles: number;
  frametime: number;
}

export interface ObjectEdit {
  kind: string;
  axis?: "x" | "y" | "z";
  value?: unknown;
  action?: string;
  property?: string;
  slot?: number;
  file?: File;
  enabled?: boolean;
  needsUpdate?: boolean;
  repeatX?: number;
  repeatY?: number;
  offsetX?: number;
  offsetY?: number;
  wrap?: number;
  flipY?: boolean;
  colorSpace?: string;
}

export interface CutRecord {
  before: THREE.Mesh[];
  after: THREE.Mesh[];
  parents: Map<THREE.Object3D, THREE.Object3D | null>;
}

export interface OutlinerEntry {
  object: THREE.Object3D;
  depth: number;
  kind: string;
}

export interface OutlinerMeta {
  camera?: THREE.Camera;
  scene?: THREE.Scene;
  cameras?: THREE.Camera[];
  viewportCamera?: THREE.Camera;
}

export interface CutVert {
  p: THREE.Vector3;
  n: THREE.Vector3;
  uv: THREE.Vector2;
  d: number;
  onPlane: boolean;
}
