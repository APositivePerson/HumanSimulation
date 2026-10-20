// Reproducible, project-owned GLB. No downloaded model or third-party asset license.
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import load from "@mujoco/mujoco";
import { readFile, writeFile } from "node:fs/promises";
import { MuJoCoEngine } from "../src/physics/MuJoCoEngine.ts";
import { worldPose } from "../src/rendering/CoordinateMapper.ts";
// GLTFExporter uses the standard browser FileReader for its binary Blob output.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`;
      this.onloadend?.();
    });
  }
}
Object.assign(globalThis, { FileReader: NodeFileReader });
const mj = await load(),
  engine = new MuJoCoEngine(
    mj,
    await readFile("public/models/human.xml", "utf8"),
  );
const m = engine.model,
  d = engine.data,
  C = new T.Matrix4().makeRotationX(-Math.PI / 2),
  scene = new T.Scene();
const bones: T.Bone[] = [],
  world: T.Matrix4[] = [],
  geometries: T.BufferGeometry[] = [];
for (let b = 1; b < m.nbody; b++) {
  const bone = new T.Bone();
  bone.name = mj.mj_id2name(m, 1, b);
  bone.userData.mujocoBody = bone.name;
  const q = new T.Quaternion(
    d.xquat[b * 4 + 1],
    d.xquat[b * 4 + 2],
    d.xquat[b * 4 + 3],
    d.xquat[b * 4],
  );
  const W = new T.Matrix4()
    .compose(
      new T.Vector3().fromArray(d.xpos, b * 3),
      q,
      new T.Vector3(1, 1, 1),
    )
    .premultiply(C);
  world[b] = W;
  const p = m.body_parentid[b];
  const local = p ? world[p].clone().invert().multiply(W) : W;
  local.decompose(bone.position, bone.quaternion, bone.scale);
  bones[b - 1] = bone;
  if (p) bones[p - 1].add(bone);
  else scene.add(bone);
}
for (let g = 0; g < m.ngeom; g++) {
  const type = m.geom_type[g];
  if (type === 0) continue;
  const b = m.geom_bodyid[g],
    s = g * 3,
    a = m.geom_size[s],
    v = m.geom_size[s + 1],
    c = m.geom_size[s + 2];
  let geo: T.BufferGeometry;
  if (type === 2) geo = new T.SphereGeometry(a, 20, 12);
  else if (type === 3) {
    geo = new T.CapsuleGeometry(a * 1.1, v * 2, 8, 20);
    geo.rotateX(Math.PI / 2);
  } else if (type === 4) {
    geo = new T.SphereGeometry(1, 24, 16);
    geo.scale(a, v, c);
  } else {
    geo = new T.BoxGeometry(a * 2, v * 2, c * 2, 2, 2, 2);
  }
  const pos = new T.Vector3(),
    quat = new T.Quaternion();
  worldPose(d.geom_xpos, d.geom_xmat, g, pos, quat);
  geo.applyMatrix4(
    new T.Matrix4().compose(pos, quat, new T.Vector3(1, 1, 1)).premultiply(C),
  );
  const count = geo.attributes.position.count,
    indices = new Uint16Array(count * 4),
    weights = new Float32Array(count * 4),
    colors = new Float32Array(count * 3);
  const name = mj.mj_id2name(m, 1, b),
    parent = m.body_parentid[b],
    anchor = new T.Vector3().fromArray(d.xpos, b * 3).applyMatrix4(C);
  const color = new T.Color(
    /hand|forearm|head|neck/.test(name)
      ? "#d6af91"
      : /foot/.test(name)
        ? "#253d50"
        : /thigh|shin|pelvis/.test(name)
          ? "#3d5369"
          : "#438d91",
  );
  if (g === 4) color.set("#b17c5c");
  const point = new T.Vector3();
  for (let i = 0; i < count; i++) {
    point.fromBufferAttribute(geo.attributes.position, i);
    const blend = parent
      ? Math.max(0, 0.18 * (1 - point.distanceTo(anchor) / 0.1))
      : 0;
    indices[i * 4] = b - 1;
    indices[i * 4 + 1] = parent ? parent - 1 : b - 1;
    weights[i * 4] = 1 - blend;
    weights[i * 4 + 1] = blend;
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geo.setAttribute("skinIndex", new T.Uint16BufferAttribute(indices, 4));
  geo.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
  geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometries.push(geo);
}
const geometry = mergeGeometries(geometries),
  material = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.02,
  });
const mesh = new T.SkinnedMesh(geometry, material);
mesh.name = "HumanSkin";
scene.add(mesh);
scene.updateMatrixWorld(true);
mesh.bind(new T.Skeleton(bones));
scene.userData = {
  upAxis: "Y",
  physicsSource: "human.xml",
  license: "CC0-1.0",
  boneContract:
    "16 MuJoCo body names; meters; original standing bind pose; no animation clips",
};
const bytes = await new GLTFExporter().parseAsync(scene, { binary: true });
if (!(bytes instanceof ArrayBuffer)) throw new Error("Expected binary GLB");
await writeFile("public/models/human-skinned.glb", new Uint8Array(bytes));
console.log(
  `Generated GLB: ${bytes.byteLength} bytes, ${bones.length} bones, ${geometry.attributes.position.count} vertices`,
);
mesh.skeleton.dispose();
geometry.dispose();
material.dispose();
geometries.forEach((g) => g.dispose());
engine.dispose();
