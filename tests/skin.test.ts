import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as T from "three";
import load from "@mujoco/mujoco";
import { MuJoCoEngine } from "../src/physics/MuJoCoEngine.ts";
import { HumanController } from "../src/human/HumanController.ts";
import { SkinnedHuman } from "../src/rendering/SkinnedHuman.ts";
const mj = await load();
const xml = await readFile(
  new URL("../public/models/human-free.xml", import.meta.url),
  "utf8",
);
const file = await readFile(
  new URL("../public/models/human-skinned.glb", import.meta.url),
);
const bytes = file.buffer.slice(
  file.byteOffset,
  file.byteOffset + file.byteLength,
) as ArrayBuffer;
test("real GLB contains skin weights and 16 bones; world-space bones follow free-base physics after motion and reset", async () => {
  const e = new MuJoCoEngine(mj, xml),
    c = new HumanController(e);
  const skin = await SkinnedHuman.load(e, bytes);
  assert.ok(skin);
  try {
    assert.equal(skin.bindings.length, 16);
    let mesh: T.SkinnedMesh | undefined;
    skin.scene.traverse((o) => {
      if (o instanceof T.SkinnedMesh) mesh = o;
    });
    assert.ok(mesh);
    assert.ok(mesh.geometry.attributes.skinWeight.count > 1000);
    const shoulder = e.mj.mj_name2id(e.model, 1, "right_upper_arm") - 1;
    const indices = mesh.geometry.attributes.skinIndex;
    let vertex = 0;
    while (vertex < indices.count && indices.getX(vertex) !== shoulder)
      vertex++;
    assert.ok(vertex < indices.count);
    const before = mesh
      .localToWorld(mesh.getVertexPosition(vertex, new T.Vector3()))
      .clone();
    c.execute({ action: "raise_right_arm" });
    for (let i = 0; i < 2000; i++) {
      c.update(e.dt);
      e.step();
    }
    skin.sync();
    for (const { bone, body } of skin.bindings) {
      const p = bone.getWorldPosition(new T.Vector3());
      assert.ok(
        p.distanceTo(new T.Vector3().fromArray(e.data.xpos, body * 3)) < 1e-7,
        bone.name,
      );
    }
    const after = mesh.localToWorld(
      mesh.getVertexPosition(vertex, new T.Vector3()),
    );
    assert.ok(
      after.distanceTo(before) > 0.05,
      "vertices must deform via physics-driven skinning",
    );
    c.reset();
    skin.sync();
    for (const { bone, body } of skin.bindings) {
      assert.ok(
        bone
          .getWorldPosition(new T.Vector3())
          .distanceTo(new T.Vector3().fromArray(e.data.xpos, body * 3)) < 1e-7,
      );
    }
  } finally {
    skin.dispose();
    c.dispose();
    e.dispose();
  }
});
test("GLB load cancellation skips binding to an already disposed engine", async () => {
  const e = new MuJoCoEngine(mj, xml);
  e.dispose();
  assert.equal(await SkinnedHuman.load(e, bytes, () => true), null);
});
