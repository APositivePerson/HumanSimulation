import { LocomotionController } from "./LocomotionController";
import { actions, type ActionCommand } from "./ActionDefinitions";
import type { MuJoCoEngine } from "../physics/MuJoCoEngine";
export class HumanController {
  status: "idle" | "running" | "completed" | "failed" = "idle";
  action = "—";
  error = "";
  readonly locomotion: LocomotionController | null;
  targets: Float64Array;
  private starts: Float64Array;
  private ends: Float64Array;
  private elapsed = 0;
  private duration = 1;
  private settling = 0;
  constructor(readonly engine: MuJoCoEngine) {
    this.locomotion = engine.freeBase ? new LocomotionController(engine) : null;
    this.targets = new Float64Array(engine.joints.length);
    this.starts = this.targets.slice();
    this.ends = this.targets.slice();
  }
  execute(command: ActionCommand) {
    return this.executeAction(command);
  }
  executeAction(command: ActionCommand) {
    if (
      !command ||
      (!Object.hasOwn(actions, command.action) &&
        !["walk_forward", "stand", "stop_walk"].includes(command.action)) ||
      !Number.isFinite(command.duration ?? 2) ||
      (command.duration ?? 2) <= 0
    ) {
      this.status = "failed";
      this.error = "动作或时长无效";
      return false;
    }
    if (
      command.action === "walk_forward" ||
      command.action === "stand" ||
      command.action === "stop_walk"
    ) {
      if (!this.locomotion || this.locomotion.mode === "fallen") {
        this.status = "failed";
        this.error = "请切换到自由基座模式；跌倒后需重置";
        return false;
      }
      if (command.action === "walk_forward") this.locomotion.walk();
      else this.locomotion.stop();
      this.action = command.action;
      this.status = "running";
      this.error = "";
      return true;
    }
    if (this.locomotion && command.action === "bend_right_knee") {
      this.status = "failed";
      this.error = "自由模式下腿部由平衡器控制；单关节屈膝请切换固定演示模式";
      return false;
    }
    if (command.action === "reset_pose") this.locomotion?.stop();
    const pose: Record<string, number> =
      command.action === "reset_pose"
        ? Object.fromEntries(this.engine.joints.map((j) => [j.name, 0]))
        : actions[command.action];
    this.begin(pose, command.duration ?? 2);
    this.action = command.action;
    return true;
  }
  setJoint(name: string, value: number) {
    if (
      !Number.isFinite(value) ||
      (this.locomotion && /(hip|knee|ankle)/.test(name))
    )
      return;
    this.begin({ [name]: value }, 0.5);
    this.action = name;
  }
  private begin(pose: Record<string, number>, duration: number) {
    this.starts = this.targets.slice();
    this.ends = this.targets.slice();
    this.engine.joints.forEach((j, i) => {
      if (pose[j.name] !== undefined)
        this.ends[i] = Math.max(j.min, Math.min(j.max, pose[j.name]));
    });
    this.duration = duration;
    this.elapsed = 0;
    this.settling = 0;
    this.status = "running";
    this.error = "";
  }
  update(dt: number) {
    if (this.status === "running") {
      this.elapsed += dt;
      const t = Math.min(1, this.elapsed / this.duration),
        s = t * t * (3 - 2 * t);
      this.targets.forEach(
        (_, i) =>
          (this.targets[i] =
            this.starts[i] + (this.ends[i] - this.starts[i]) * s),
      );
      if (t === 1) {
        this.settling += dt;
        const settled = this.engine.joints.every(
          (j, i) =>
            (this.locomotion && /(hip|knee|ankle)/.test(j.name)) ||
            (Math.abs(this.engine.data.qpos[j.q] - this.ends[i]) < 0.14 &&
              Math.abs(this.engine.data.qvel[j.v]) < 0.12),
        );
        if (settled) this.status = "completed";
        else if (this.settling > 6) {
          this.status = "failed";
          this.error = "目标未在容差内稳定（可能受碰撞或负载影响）";
        }
      }
    }
    const locomotionTargets = this.locomotion?.update(dt);
    if (this.locomotion?.mode === "fallen") {
      this.status = "failed";
      this.error = "人体跌倒，请重置物理状态";
    }
    if (
      ["walk_forward", "stand", "stop_walk"].includes(this.action) &&
      this.locomotion?.mode === "stand"
    )
      this.status = this.locomotion.settled ? "completed" : "running";
    if (this.action === "walk_forward" && this.locomotion?.mode === "walk")
      this.status = "running";
    this.engine.joints.forEach((j, i) => {
      const ctrl = locomotionTargets?.[j.name] ?? this.targets[i];
      this.engine.data.ctrl[j.actuator] = Math.max(
        j.min,
        Math.min(j.max, ctrl),
      );
    });
  }
  reset() {
    this.targets.fill(0);
    this.starts.fill(0);
    this.ends.fill(0);
    this.status = "idle";
    this.action = "—";
    this.error = "";
    this.engine.reset();
    this.locomotion?.reset();
  }
  dispose() {
    this.locomotion?.dispose();
  }
  snapshot() {
    return this.engine.joints.map((j, i) => ({
      ...j,
      managed: !!this.locomotion && /(hip|knee|ankle)/.test(j.name),
      target:
        this.locomotion && /(hip|knee|ankle)/.test(j.name)
          ? (this.locomotion.getReference(j.name) ??
            this.engine.data.ctrl[j.actuator])
          : this.ends[i],
      trajectory:
        this.locomotion && /(hip|knee|ankle)/.test(j.name)
          ? (this.locomotion.getReference(j.name) ?? this.targets[i])
          : this.targets[i],
      actual: this.engine.data.qpos[j.q],
      velocity: this.engine.data.qvel[j.v],
      control: this.engine.data.ctrl[j.actuator],
      force: this.engine.data.actuator_force[j.actuator],
    }));
  }
}
