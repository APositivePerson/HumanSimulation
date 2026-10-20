import type { MuJoCoEngine } from "../physics/MuJoCoEngine";
export class BalanceController {
  private jp;
  private jr;
  private feet: number[];
  private mass: number;
  constructor(readonly engine: MuJoCoEngine) {
    const { mj, model: m } = engine;
    this.jp = new mj.DoubleBuffer(3 * m.nv);
    this.jr = new mj.DoubleBuffer(3 * m.nv);
    this.feet = ["left", "right"].map((s) => mj.mj_name2id(m, 1, s + "_foot"));
    this.mass = Array.from(m.body_mass as Float64Array).reduce(
      (a, b) => a + b,
      0,
    );
  }
  apply(
    targets: Record<string, number>,
    root: { x: number; y: number },
    swing: number,
    lift: number,
  ) {
    const { mj, model: m, data: d } = this.engine;
    const [w, x, y, z] = Array.from(d.qpos.slice(3, 7)) as number[];
    const angles = [
      Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
      Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))),
      Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
    ];
    const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));
    const F = [
      this.mass * clamp(30 * (root.x - d.qpos[0]) - 10 * d.qvel[0], 3),
      this.mass * clamp(30 * (root.y - d.qpos[1]) - 10 * d.qvel[1], 3),
      this.mass * (9.81 + clamp(100 * (0.925 - d.qpos[2]) - 20 * d.qvel[2], 5)),
    ];
    const com = d.subtree_com;
    const moments = angles.map((a, i) => -600 * a - 80 * d.qvel[3 + i]);
    moments[0] += (com[4] - d.qpos[1]) * F[2] - (com[5] - d.qpos[2]) * F[1];
    moments[1] += (com[5] - d.qpos[2]) * F[0] - (com[3] - d.qpos[0]) * F[2];
    moments[2] += (com[3] - d.qpos[0]) * F[1] - (com[4] - d.qpos[1]) * F[0];
    let weights = [Math.max(0, Math.min(1, 0.5 + root.x / 0.2)), 0];
    weights[1] = 1 - weights[0];
    if (lift > 0.001) {
      weights[swing] = 0;
      weights[1 - swing] = 1;
    }
    this.feet.forEach((foot, i) => {
      mj.mj_jacBody(m, d, this.jp, this.jr, foot);
      const jp = this.jp.GetView(),
        jr = this.jr.GetView(),
        nv = m.nv;
      const force = F.map((v) => v * weights[i]),
        r = [
          d.xpos[foot * 3] - d.qpos[0],
          d.xpos[foot * 3 + 1] - d.qpos[1],
          d.xpos[foot * 3 + 2] - d.qpos[2],
        ];
      const cross = [
        r[1] * force[2] - r[2] * force[1],
        r[2] * force[0] - r[0] * force[2],
        r[0] * force[1] - r[1] * force[0],
      ];
      const torque = moments.map((v, k) =>
        clamp(
          v * weights[i] - cross[k],
          force[2] * (k === 0 ? 0.12 : k === 1 ? 0.06 : 0.05),
        ),
      );
      const side = i === 0 ? "left" : "right";
      for (const j of this.engine.joints) {
        if (!j.name.startsWith(side + "_") || !/(hip|knee|ankle)/.test(j.name))
          continue;
        let tau = d.qfrc_bias[j.v];
        for (let k = 0; k < 3; k++)
          tau -= jp[k * nv + j.v] * force[k] + jr[k * nv + j.v] * torque[k];
        targets[j.name] += tau / 1200;
      }
    });
  }
  dispose() {
    this.jp.delete();
    this.jr.delete();
  }
}
