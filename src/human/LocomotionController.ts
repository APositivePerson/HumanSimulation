import { BalanceController } from "./BalanceController";
import { LegIK } from "./LegIK";
import type { MuJoCoEngine } from "../physics/MuJoCoEngine";
const smooth = (x: number) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * x * (10 + x * (-15 + 6 * x));
};
export class LocomotionController {
  mode: "stand" | "walk" | "fallen" = "stand";
  phase = "双脚支撑";
  steps = 0;
  private stopRequested = false;
  private time = 0;
  private swing = 1;
  private stage: "shift" | "swing" = "shift";
  private feet = [
    { x: 0.1, y: 0 },
    { x: -0.1, y: 0 },
  ];
  private root = { x: 0, y: 0 };
  private start = { x: 0, y: 0 };
  private swingStart = 0;
  private swingEnd = 0;
  private balance: BalanceController;
  private ik: LegIK;
  private last: Record<string, number> = {};
  private counter = 0;
  constructor(readonly engine: MuJoCoEngine) {
    this.ik = new LegIK(engine);
    this.balance = new BalanceController(engine);
  }
  dispose() {
    this.ik.dispose();
    this.balance.dispose();
  }
  walk() {
    if (this.mode === "fallen" || this.mode === "walk") return;
    this.stopRequested = false;
    this.mode = "walk";
    this.time = 0;
    this.stage = "shift";
    this.start = { ...this.root };
  }
  stop() {
    if (this.mode === "walk") this.stopRequested = true;
  }
  reset() {
    this.stopRequested = false;
    this.last = {};
    this.counter = 0;
    this.mode = "stand";
    this.phase = "双脚支撑";
    this.steps = 0;
    this.time = 0;
    this.swing = 1;
    this.stage = "shift";
    this.feet = [
      { x: 0.1, y: 0 },
      { x: -0.1, y: 0 },
    ];
    this.root = { x: 0, y: 0 };
    this.start = { ...this.root };
  }
  get settled() {
    const d = this.engine.data;
    return (
      this.mode === "stand" &&
      d.ncon >= 4 &&
      Math.hypot(d.qvel[0], d.qvel[1], d.qvel[2]) < 0.03 &&
      Math.abs(d.qpos[0] - this.root.x) < 0.015 &&
      Math.abs(d.qpos[1] - this.root.y) < 0.015
    );
  }
  getReference(name: string) {
    return this.last[name];
  }
  getState() {
    const d = this.engine.data,
      m = this.engine.model;
    const ids = ["left", "right"].map((s) =>
      this.engine.mj.mj_name2id(m, 1, s + "_foot"),
    );
    return {
      mode: this.mode,
      phase: this.phase,
      steps: this.steps,
      pelvis: Array.from(d.qpos.slice(0, 3)) as number[],
      contacts: d.ncon,
      footHeight: ids.map((b) => {
        const k = b * 9,
          r = d.xmat;
        return (
          d.xpos[b * 3 + 2] -
          0.055 * r[k + 7] -
          0.055 * r[k + 8] -
          0.07 * Math.abs(r[k + 6]) -
          0.15 * Math.abs(r[k + 7]) -
          0.045 * Math.abs(r[k + 8])
        );
      }),
      stopping: this.stopRequested,
      settled: this.settled,
    };
  }
  update(dt: number): Record<string, number> {
    const d = this.engine.data;
    if (d.qpos[2] < 0.65) {
      this.mode = "fallen";
      this.phase = "跌倒：请重置";
      return {};
    }
    let lift = 0;
    if (this.mode === "walk") {
      this.time += dt;
      const support = 1 - this.swing;
      const foot = this.feet[support];
      if (this.stage === "shift") {
        this.phase = "重心转移";
        const s = smooth(this.time / 2);
        this.root.x = this.start.x + (foot.x * 0.65 - this.start.x) * s;
        this.root.y = this.start.y + (foot.y - 0.025 - this.start.y) * s;
        if (this.time >= 2) {
          if (this.stopRequested) {
            this.mode = "stand";
            this.stopRequested = false;
          } else {
            this.stage = "swing";
            this.time = 0;
            this.swingStart = this.feet[this.swing].y;
            this.swingEnd = foot.y - 0.06;
          }
        }
      } else {
        this.phase = this.swing === 0 ? "左脚摆动" : "右脚摆动";
        const u = Math.min(1, this.time / 2),
          s = smooth(u);
        this.feet[this.swing].y =
          this.swingStart + (this.swingEnd - this.swingStart) * s;
        lift = 0.025 * Math.sin(Math.PI * u) ** 2;
        if (this.time >= 2) {
          this.steps++;
          this.swing = 1 - this.swing;
          this.stage = "shift";
          this.time = 0;
          this.start = { ...this.root };
          if (this.stopRequested) {
            this.mode = "stand";
            this.stopRequested = false;
          }
        }
      }
    } else if (this.mode === "stand") {
      this.phase = "双脚支撑";
      const alpha = 1 - Math.exp(-dt * 2);
      this.root.x +=
        ((this.feet[0].x + this.feet[1].x) / 2 - this.root.x) * alpha;
      this.root.y +=
        ((this.feet[0].y + this.feet[1].y) / 2 - this.root.y) * alpha;
    }
    this.counter++;
    if (this.counter % 10 === 1 || Object.keys(this.last).length === 0) {
      this.last = this.ik.solve(
        this.root,
        this.feet.map((f, i) => ({
          ...f,
          z: 0.1 + (this.stage === "swing" && i === this.swing ? lift : 0),
        })),
        this.last,
      );
    }
    const targets = { ...this.last };
    this.balance.apply(targets, this.root, this.swing, lift);
    return targets;
  }
}
