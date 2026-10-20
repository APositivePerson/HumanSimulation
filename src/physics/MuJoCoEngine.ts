import type { MainModule, MjModel, MjData } from "@mujoco/mujoco";
export interface Joint {
  name: string;
  id: number;
  actuator: number;
  q: number;
  v: number;
  min: number;
  max: number;
}
export class MuJoCoEngine {
  readonly model: MjModel;
  readonly data: MjData;
  readonly joints: Joint[] = [];
  constructor(
    readonly mj: MainModule,
    xml: string,
  ) {
    this.model = mj.MjModel.from_xml_string(xml);
    try {
      this.data = new mj.MjData(this.model);
    } catch (e) {
      this.model.delete();
      throw e;
    }
    const m = this.model;
    for (let a = 0; a < m.nu; a++) {
      const j = m.actuator_trnid[a * 2];
      this.joints.push({
        name: mj.mj_id2name(m, 3, j),
        id: j,
        actuator: a,
        q: m.jnt_qposadr[j],
        v: m.jnt_dofadr[j],
        min: m.jnt_range[j * 2],
        max: m.jnt_range[j * 2 + 1],
      });
    }
    this.reset();
  }
  get dt() {
    return this.model.opt.timestep;
  }
  get freeBase() {
    return this.model.njnt > 0 && this.model.jnt_type[0] === 0;
  }
  reset() {
    if (this.model.nkey > 0)
      this.mj.mj_resetDataKeyframe(this.model, this.data, 0);
    else this.mj.mj_resetData(this.model, this.data);
    this.mj.mj_forward(this.model, this.data);
  }
  step() {
    this.mj.mj_step(this.model, this.data);
    this.mj.mj_forward(this.model, this.data);
  }
  dispose() {
    this.data.delete();
    this.model.delete();
  }
}
