import * as THREE from "three";
import type { CutVert } from "./types";

const EPS = 1e-6;
const SNAP = 1e5;

interface CapSegment {
  a: THREE.Vector3;
  b: THREE.Vector3;
}

interface UvBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Generic mesh slicer. Accepts any THREE.Mesh whose geometry has a position
 * attribute. No shape- or model-specific branches.
 *
 * Pipeline:
 *   1. Early-out if the world-space AABB misses the plane
 *   2. Transform the plane into the mesh's local space
 *   3. Convert to non-indexed triangles
 *   4. Classify / split each triangle
 *   5. Stitch intersection segments into cap polygons
 *   6. Ear-clip caps and append them to both pieces
 */
export class MeshCutter {
  private _invMatrix = new THREE.Matrix4();
  private _localPlane = new THREE.Plane();
  private _box = new THREE.Box3();
  private _v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private _n = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private _uv = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
  private _ab = new THREE.Vector3();
  private _ac = new THREE.Vector3();
  private _origin = new THREE.Vector3();
  private _basisU = new THREE.Vector3();
  private _basisV = new THREE.Vector3();
  private _tmp = new THREE.Vector3();

  cut(
    mesh: THREE.Mesh,
    worldPlane: THREE.Plane
  ): { positive: THREE.BufferGeometry; negative: THREE.BufferGeometry } | null {
    const geometry = mesh.geometry;
    if (!geometry || !geometry.attributes?.position) return null;

    mesh.updateWorldMatrix(true, false);

    this._box.setFromObject(mesh);
    if (this._box.isEmpty() || !this._box.intersectsPlane(worldPlane)) {
      return null;
    }

    this._invMatrix.copy(mesh.matrixWorld).invert();
    this._localPlane.copy(worldPlane).applyMatrix4(this._invMatrix).normalize();

    const src = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const posAttr = src.getAttribute("position");
    const nrmAttr = src.getAttribute("normal");
    const uvAttr = src.getAttribute("uv");
    const triCount = ((posAttr?.count ?? 0) / 3) | 0;
    if (!posAttr) return null;

    const posA: number[] = [];
    const nrmA: number[] = [];
    const uvA: number[] = [];
    const posB: number[] = [];
    const nrmB: number[] = [];
    const uvB: number[] = [];
    const capSegments: CapSegment[] = [];

    for (let t = 0; t < triCount; t++) {
      for (let i = 0; i < 3; i++) {
        const idx = t * 3 + i;
        this._v[i].fromBufferAttribute(posAttr, idx);
        if (nrmAttr) this._n[i].fromBufferAttribute(nrmAttr, idx);
        else this._n[i].set(0, 1, 0);
        if (uvAttr) this._uv[i].fromBufferAttribute(uvAttr as THREE.BufferAttribute, idx);
        else this._uv[i].set(0, 0);
      }

      const d0 = this._localPlane.distanceToPoint(this._v[0]);
      const d1 = this._localPlane.distanceToPoint(this._v[1]);
      const d2 = this._localPlane.distanceToPoint(this._v[2]);

      this._processTriangle(d0, d1, d2, posA, nrmA, uvA, posB, nrmB, uvB, capSegments);
    }

    if (src !== geometry) src.dispose();

    if (posA.length === 0 || posB.length === 0) return null;

    const capCountA = posA.length;
    const capCountB = posB.length;

    const loops = this._buildCapPolygons(capSegments);
    this._appendCaps(loops, this._localPlane, posA, nrmA, uvA, posB, nrmB, uvB);

    return {
      positive: this._buildGeometry(posA, nrmA, uvA, capCountA),
      negative: this._buildGeometry(posB, nrmB, uvB, capCountB),
    };
  }

  private _processTriangle(
    d0: number,
    d1: number,
    d2: number,
    posA: number[],
    nrmA: number[],
    uvA: number[],
    posB: number[],
    nrmB: number[],
    uvB: number[],
    capSegments: CapSegment[]
  ): void {
    const verts = [this._makeVert(0, d0), this._makeVert(1, d1), this._makeVert(2, d2)];

    if (this._isDegenerate(verts[0], verts[1], verts[2])) return;

    const sides = verts.map((v) => (v.d > EPS ? 1 : v.d < -EPS ? -1 : 0));
    const hasPos = sides[0] > 0 || sides[1] > 0 || sides[2] > 0;
    const hasNeg = sides[0] < 0 || sides[1] < 0 || sides[2] < 0;

    if (!hasPos && !hasNeg) {
      this._fan(verts, posA, nrmA, uvA);
      return;
    }

    if (!hasNeg) {
      this._fan(verts, posA, nrmA, uvA);
      this._maybeOnPlaneEdge(verts, sides, capSegments);
      return;
    }

    if (!hasPos) {
      this._fan(verts, posB, nrmB, uvB);
      this._maybeOnPlaneEdge(verts, sides, capSegments);
      return;
    }

    const polyPos: CutVert[] = [];
    const polyNeg: CutVert[] = [];

    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const vi = verts[i];
      const vj = verts[j];
      const si = sides[i];
      const sj = sides[j];

      if (si >= 0) polyPos.push(vi);
      if (si <= 0) polyNeg.push(vi);

      if ((si > 0 && sj < 0) || (si < 0 && sj > 0)) {
        const x = this._lerpVert(vi, vj);
        polyPos.push(x);
        polyNeg.push(x);
      }
    }

    this._fan(polyPos, posA, nrmA, uvA);
    this._fan(polyNeg, posB, nrmB, uvB);
    this._collectCapSegment(polyPos, capSegments);
  }

  private _makeVert(i: number, d: number): CutVert {
    return {
      p: this._v[i].clone(),
      n: this._n[i].clone(),
      uv: this._uv[i].clone(),
      d,
      onPlane: Math.abs(d) <= EPS,
    };
  }

  private _lerpVert(a: CutVert, b: CutVert): CutVert {
    const denom = a.d - b.d;
    let t = Math.abs(denom) < EPS ? 0.5 : a.d / denom;
    t = THREE.MathUtils.clamp(t, 0, 1);
    return {
      p: a.p.clone().lerp(b.p, t),
      n: a.n.clone().lerp(b.n, t).normalize(),
      uv: a.uv.clone().lerp(b.uv, t),
      d: 0,
      onPlane: true,
    };
  }

  private _isDegenerate(a: CutVert, b: CutVert, c: CutVert): boolean {
    this._ab.subVectors(b.p, a.p);
    this._ac.subVectors(c.p, a.p);
    return this._ab.cross(this._ac).lengthSq() < 1e-16;
  }

  private _fan(poly: CutVert[], pos: number[], nrm: number[], uv: number[]): void {
    if (poly.length < 3) return;
    for (let i = 1; i < poly.length - 1; i++) {
      if (this._isDegenerate(poly[0], poly[i], poly[i + 1])) continue;
      this._pushVert(poly[0], pos, nrm, uv);
      this._pushVert(poly[i], pos, nrm, uv);
      this._pushVert(poly[i + 1], pos, nrm, uv);
    }
  }

  private _pushVert(v: CutVert, pos: number[], nrm: number[], uv: number[]): void {
    pos.push(v.p.x, v.p.y, v.p.z);
    nrm.push(v.n.x, v.n.y, v.n.z);
    uv.push(v.uv.x, v.uv.y);
  }

  private _maybeOnPlaneEdge(verts: CutVert[], sides: number[], capSegments: CapSegment[]): void {
    const on: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      if (sides[i] === 0) on.push(verts[i].p);
    }
    if (on.length === 2) {
      capSegments.push({ a: on[0].clone(), b: on[1].clone() });
    }
  }

  private _collectCapSegment(polyPos: CutVert[], capSegments: CapSegment[]): void {
    const on: THREE.Vector3[] = [];
    for (const v of polyPos) {
      if (v.onPlane) on.push(v.p);
    }
    if (on.length >= 2) {
      capSegments.push({
        a: on[0].clone(),
        b: on[on.length - 1].clone(),
      });
    }
  }

  private _key(p: THREE.Vector3): string {
    return `${Math.round(p.x * SNAP)},${Math.round(p.y * SNAP)},${Math.round(p.z * SNAP)}`;
  }

  private _edgeKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private _buildCapPolygons(segments: CapSegment[]): THREE.Vector3[][] {
    if (segments.length < 3) return [];

    const points = new Map<string, THREE.Vector3>();
    const adj = new Map<string, string[]>();

    const snap = (p: THREE.Vector3) => {
      const k = this._key(p);
      if (!points.has(k)) points.set(k, p.clone());
      return k;
    };

    for (const seg of segments) {
      const ka = snap(seg.a);
      const kb = snap(seg.b);
      if (ka === kb) continue;
      if (!adj.has(ka)) adj.set(ka, []);
      if (!adj.has(kb)) adj.set(kb, []);
      const aAdj = adj.get(ka)!;
      const bAdj = adj.get(kb)!;
      if (!aAdj.includes(kb)) aAdj.push(kb);
      if (!bAdj.includes(ka)) bAdj.push(ka);
    }

    const used = new Set<string>();
    const loops: THREE.Vector3[][] = [];

    for (const start of adj.keys()) {
      const neighbors = adj.get(start) ?? [];
      for (const first of neighbors) {
        const e0 = this._edgeKey(start, first);
        if (used.has(e0)) continue;

        const loopKeys = [start];
        let prev = start;
        let curr = first;
        used.add(e0);

        let closed = false;
        for (let guard = 0; guard < 10000; guard++) {
          if (curr === start) {
            closed = true;
            break;
          }
          loopKeys.push(curr);
          const nexts = adj.get(curr) || [];
          let next: string | null = null;
          for (const n of nexts) {
            if (n === prev) continue;
            const ek = this._edgeKey(curr, n);
            if (!used.has(ek)) {
              next = n;
              used.add(ek);
              break;
            }
          }
          if (next === null) break;
          prev = curr;
          curr = next;
        }

        if (closed && loopKeys.length >= 3) {
          loops.push(loopKeys.map((k) => points.get(k)!));
        }
      }
    }

    return loops;
  }

  private _appendCaps(
    loops: THREE.Vector3[][],
    plane: THREE.Plane,
    posA: number[],
    nrmA: number[],
    uvA: number[],
    posB: number[],
    nrmB: number[],
    uvB: number[]
  ): void {
    const n = plane.normal;
    plane.coplanarPoint(this._origin);

    if (Math.abs(n.y) < 0.9) {
      this._basisU.crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
    } else {
      this._basisU.crossVectors(n, new THREE.Vector3(1, 0, 0)).normalize();
    }
    this._basisV.crossVectors(n, this._basisU).normalize();

    const nPos = n.clone().negate();
    const nNeg = n.clone();

    for (const loop of loops) {
      const pts2 = loop.map((p) => {
        this._tmp.subVectors(p, this._origin);
        return new THREE.Vector2(this._tmp.dot(this._basisU), this._tmp.dot(this._basisV));
      });

      let area = 0;
      for (let i = 0; i < pts2.length; i++) {
        const a = pts2[i];
        const b = pts2[(i + 1) % pts2.length];
        area += a.x * b.y - b.x * a.y;
      }

      const ordered3 = area < 0 ? loop.slice().reverse() : loop;
      const ordered2 = area < 0 ? pts2.slice().reverse() : pts2;

      const tris = this._earClip(ordered2, ordered3);
      const uvScale = this._uvBounds(ordered2);

      for (const tri of tris) {
        const uvs = tri.map((p) => this._capUv(p, uvScale));
        this._pushCapTri(tri[0], tri[1], tri[2], nNeg, uvs[0], uvs[1], uvs[2], posB, nrmB, uvB);
        this._pushCapTri(tri[0], tri[2], tri[1], nPos, uvs[0], uvs[2], uvs[1], posA, nrmA, uvA);
      }
    }
  }

  private _uvBounds(pts2: THREE.Vector2[]): UvBounds {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts2) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  }

  private _capUv(p: THREE.Vector3, b: UvBounds): THREE.Vector2 {
    const dx = b.maxX - b.minX || 1;
    const dy = b.maxY - b.minY || 1;
    this._tmp.subVectors(p, this._origin);
    const x = this._tmp.dot(this._basisU);
    const y = this._tmp.dot(this._basisV);
    return new THREE.Vector2((x - b.minX) / dx, (y - b.minY) / dy);
  }

  private _pushCapTri(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    normal: THREE.Vector3,
    uvA: THREE.Vector2,
    uvB: THREE.Vector2,
    uvC: THREE.Vector2,
    pos: number[],
    nrm: number[],
    uv: number[]
  ): void {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    nrm.push(
      normal.x, normal.y, normal.z,
      normal.x, normal.y, normal.z,
      normal.x, normal.y, normal.z
    );
    uv.push(uvA.x, uvA.y, uvB.x, uvB.y, uvC.x, uvC.y);
  }

  private _earClip(pts2: THREE.Vector2[], pts3: THREE.Vector3[]): THREE.Vector3[][] {
    const n = pts2.length;
    if (n < 3) return [];
    if (n === 3) return [[pts3[0], pts3[1], pts3[2]]];

    const idx = pts2.map((_, i) => i);
    const triangles: THREE.Vector3[][] = [];
    let guard = 0;

    const area = (i: number, j: number, k: number) => {
      const a = pts2[i];
      const b = pts2[j];
      const c = pts2[k];
      return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    };

    const pointInTri = (p: THREE.Vector2, ia: number, ib: number, ic: number) => {
      const a = pts2[ia];
      const b = pts2[ib];
      const c = pts2[ic];
      const s1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      const s2 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
      const s3 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
      const pos = s1 >= -1e-10 && s2 >= -1e-10 && s3 >= -1e-10;
      const neg = s1 <= 1e-10 && s2 <= 1e-10 && s3 <= 1e-10;
      return pos || neg;
    };

    while (idx.length > 3 && guard++ < 10000) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const i0 = idx[(i + idx.length - 1) % idx.length];
        const i1 = idx[i];
        const i2 = idx[(i + 1) % idx.length];
        if (area(i0, i1, i2) <= 1e-12) continue;

        let ear = true;
        for (const j of idx) {
          if (j === i0 || j === i1 || j === i2) continue;
          if (pointInTri(pts2[j], i0, i1, i2)) {
            ear = false;
            break;
          }
        }
        if (!ear) continue;

        triangles.push([pts3[i0], pts3[i1], pts3[i2]]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;
    }

    if (idx.length === 3) {
      triangles.push([pts3[idx[0]], pts3[idx[1]], pts3[idx[2]]]);
    } else if (idx.length > 3) {
      for (let i = 1; i < idx.length - 1; i++) {
        triangles.push([pts3[idx[0]], pts3[idx[i]], pts3[idx[i + 1]]]);
      }
    }

    return triangles;
  }

  private _buildGeometry(
    pos: number[],
    nrm: number[],
    uv: number[],
    surfaceFloatCount: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));

    const surfaceVerts = (surfaceFloatCount / 3) | 0;
    const totalVerts = (pos.length / 3) | 0;
    const capVerts = totalVerts - surfaceVerts;

    geometry.addGroup(0, surfaceVerts, 0);
    if (capVerts > 0) {
      geometry.addGroup(surfaceVerts, capVerts, 1);
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
