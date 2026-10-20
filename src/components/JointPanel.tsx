import type { HumanController } from "../human/HumanController";
const deg = (x: number) => (x * 180) / Math.PI;
export function JointPanel({ controller }: { controller: HumanController }) {
  return (
    <section>
      <div className="section-heading">
        <h2>关节遥测</h2>
        <span>DEG / DEG·S⁻¹</span>
      </div>
      <p className="hint">目标 → 平滑轨迹 → 位置驱动器 → 实际响应</p>
      <div className="joint-list">
        {controller.snapshot().map((j) => (
          <div className="joint" key={j.name} data-joint={j.name}>
            <div className="joint-title">
              <label htmlFor={j.name}>{j.name}</label>
              <b>{deg(j.actual).toFixed(1)}°</b>
            </div>
            <input
              id={j.name}
              aria-label={j.name}
              type="range"
              disabled={j.managed}
              title={j.managed ? "由自由站立 / 步行控制器管理" : undefined}
              min={deg(j.min)}
              max={deg(j.max)}
              step="1"
              value={deg(j.target)}
              onChange={(e) =>
                controller.setJoint(
                  j.name,
                  (Number(e.target.value) / 180) * Math.PI,
                )
              }
            />
            <div className="metrics">
              <span>
                目标 <b>{deg(j.target).toFixed(0)}°</b>
              </span>
              <span>
                速度 <b>{deg(j.velocity).toFixed(1)}</b>
              </span>
              <span>
                ctrl <b>{j.control.toFixed(2)} rad</b>
              </span>
              <span>
                力矩 <b>{j.force.toFixed(1)} N·m</b>
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
