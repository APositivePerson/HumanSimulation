import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MuJoCoEngine } from "../physics/MuJoCoEngine";
export class SkinnedHuman {
  readonly group = new T.Group();
  readonly bindings: { body: number; bone: T.Bone; parent: number }[] = [];
  private matrices: T.Matrix4[] = [];
  private conversion = new T.Matrix4().makeRotationX(-Math.PI / 2);
  private p = new T.Vector3();
  private q = new T.Quaternion();
  private unit = new T.Vector3(1, 1, 1);
  private local = new T.Matrix4();
  private constructor(
    readonly engine: MuJoCoEngine,
    readonly scene: T.Group,
  ) {
    // glTF is Y-up, the physics scene is Z-up. Skeleton matrices below are in Y-up.
    this.group.rotation.x = Math.PI / 2;
    this.group.add(scene);
    for (let b = 1; b < engine.model.nbody; b++) {
      const name = engine.mj.mj_id2name(engine.model, 1, b),
        node = scene.getObjectByName(name);
      if (!(node instanceof T.Bone))
        throw new Error(`GLB 缺少物理骨骼 ${name}`);
      const parent = engine.model.body_parentid[b];
      if (
        parent &&
        node.parent?.name !== engine.mj.mj_id2name(engine.model, 1, parent)
      )
        throw new Error(`GLB 骨骼层级不匹配：${name}`);
      this.bindings.push({ body: b, bone: node, parent });
      this.matrices[b] = new T.Matrix4();
    }
    let skins = 0;
    scene.traverse((o) => {
      if (o instanceof T.SkinnedMesh) {
        skins++;
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    if (!skins) throw new Error("GLB 不含 SkinnedMesh");
    this.sync();
  }
  static async load(
    engine: MuJoCoEngine,
    source: string | ArrayBuffer,
    cancelled: () => boolean = () => false,
  ) {
    const loader = new GLTFLoader();
    const gltf =
      typeof source === "string"
        ? await loader.loadAsync(source)
        : await loader.parseAsync(source, "");
    if (cancelled()) {
      disposeScene(gltf.scene);
      return null;
    }
    try {
      return new SkinnedHuman(engine, gltf.scene);
    } catch (e) {
      disposeScene(gltf.scene);
      throw e;
    }
  }
  sync() {
    const d = this.engine.data;
    for (const { body: b, bone, parent } of this.bindings) {
      this.p.fromArray(d.xpos, b * 3);
      this.q.set(
        d.xquat[b * 4 + 1],
        d.xquat[b * 4 + 2],
        d.xquat[b * 4 + 3],
        d.xquat[b * 4],
      );
      const world = this.matrices[b]
        .compose(this.p, this.q, this.unit)
        .premultiply(this.conversion);
      if (parent)
        this.local.copy(this.matrices[parent]).invert().multiply(world);
      else this.local.copy(world);
      this.local.decompose(bone.position, bone.quaternion, bone.scale);
    }
    this.group.updateMatrixWorld(true);
  }
  dispose() {
    disposeScene(this.scene);
    this.group.removeFromParent();
  }
}
function disposeScene(scene: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>(),
    skeletons = new Set<T.Skeleton>();
  scene.traverse((o) => {
    if (o instanceof T.Mesh) {
      geometries.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        materials.add(m);
        Object.values(m).forEach((v) => {
          if (v instanceof T.Texture) textures.add(v);
        });
      });
      if (o instanceof T.SkinnedMesh) skeletons.add(o.skeleton);
    }
  });
  skeletons.forEach((s) => s.dispose());
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
  geometries.forEach((g) => g.dispose());
}
