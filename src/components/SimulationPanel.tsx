import type { SimulationLoop } from "../physics/SimulationLoop";
export function SimulationPanel({
  loop,
  mode,
  setMode,
  skin,
  setSkin,
  avatar,
  setAvatar,
  skinStatus,
  refresh,
  joints,
  axes,
  skeleton,
  setJoints,
  setAxes,
  setSkeleton,
}: {
  skin: boolean;
  setSkin: (v: boolean) => void;
  avatar: File | null;
  setAvatar: (f: File | null) => void;
  skinStatus: string;
  loop: SimulationLoop;
  mode: "free" | "fixed";
  setMode: (m: "free" | "fixed") => void;
  refresh: () => void;
  joints: boolean;
  axes: boolean;
  skeleton: boolean;
  setJoints: (v: boolean) => void;
  setAxes: (v: boolean) => void;
  setSkeleton: (v: boolean) => void;
}) {
  const m = loop.engine.model;
  return (
    <>
      <section>
        <div className="section-heading">
          <h2>人体模型</h2>
          <span>01</span>
        </div>
        <div className="model-icon">◎</div>
        <h3>Human / 16</h3>
        <label className="speed">
          基座模式
          <select
            aria-label="基座模式"
            value={mode}
            onChange={(e) => setMode(e.target.value as "free" | "fixed")}
          >
            <option value="free">自由站立 / 行走</option>
            <option value="fixed">固定动作演示</option>
          </select>
        </label>
        <p className="hint">
          {mode === "free"
            ? "6 自由度骨盆 · 足底接触支撑"
            : "固定骨盆 · 单关节动作演示"}
        </p>
        <dl>
          <dt>人体刚体</dt>
          <dd>{m.nbody - 1}</dd>
          <dt>驱动关节</dt>
          <dd>
            {m.nu} {mode === "free" ? "+ 自由根关节" : ""}
          </dd>
          <dt>驱动器</dt>
          <dd>{m.nu}</dd>
          <dt>重力</dt>
          <dd>−9.81 m/s²</dd>
          <dt>固定步长</dt>
          <dd>{loop.engine.dt * 1000} ms</dd>
          <dt>引擎版本</dt>
          <dd>{loop.engine.mj.mj_versionString()}</dd>
        </dl>
      </section>
      <section>
        <div className="section-heading">
          <h2>仿真控制</h2>
          <span>02</span>
        </div>
        <button
          className="primary full"
          onClick={() => {
            loop.paused = !loop.paused;
            refresh();
          }}
        >
          {loop.paused ? "▶ 继续仿真" : "Ⅱ 暂停仿真"}
        </button>
        <button
          className="full"
          onClick={() => {
            loop.reset();
            refresh();
          }}
        >
          ↺ 重置物理状态
        </button>
        <label className="speed">
          仿真速度
          <select
            value={loop.speed}
            onChange={(e) => {
              loop.speed = Number(e.target.value);
              refresh();
            }}
          >
            {[0.25, 0.5, 1, 2].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
      </section>
      {loop.controller.locomotion && (
        <section>
          <div className="section-heading">
            <h2>平衡与步行</h2>
            <span>CONTACT</span>
          </div>
          <button
            className="primary full"
            onClick={() => {
              loop.controller.executeAction({ action: "walk_forward" });
              refresh();
            }}
          >
            ▶ 向前行走
          </button>
          <button
            className="full"
            onClick={() => {
              loop.controller.executeAction({ action: "stop_walk" });
              refresh();
            }}
          >
            ■ 停步并站稳
          </button>
          <dl>
            <dt>步态</dt>
            <dd data-testid="gait-mode">{loop.controller.locomotion.mode}</dd>
            <dt>阶段</dt>
            <dd>{loop.controller.locomotion.phase}</dd>
            <dt>已落脚</dt>
            <dd>{loop.controller.locomotion.steps}</dd>
            <dt>骨盆高度</dt>
            <dd>{loop.engine.data.qpos[2].toFixed(3)} m</dd>
            <dt>接触点</dt>
            <dd>{loop.engine.data.ncon}</dd>
            <dt>前进距离</dt>
            <dd data-testid="distance">
              {(-loop.engine.data.qpos[1]).toFixed(3)} m
            </dd>
          </dl>
          <p className="hint">
            慢速平地步态。腿部由平衡控制器管理，停止时先落脚再回到双脚支撑。跌倒需重置。
          </p>
        </section>
      )}
      <section>
        <div className="section-heading">
          <h2>显示设置</h2>
          <span>03</span>
        </div>
        {[
          ["GLB 蒙皮外观", skin, setSkin],
          ["关节标记", joints, setJoints],
          ["世界坐标轴", axes, setAxes],
          ["骨骼连线", skeleton, setSkeleton],
        ].map(([label, value, set]) => (
          <label className="toggle" key={String(label)}>
            {String(label)}
            <input
              type="checkbox"
              checked={value as boolean}
              onChange={(e) => (set as (v: boolean) => void)(e.target.checked)}
            />
          </label>
        ))}
      </section>
      <section>
        <div className="section-heading">
          <h2>蒙皮模型</h2>
          <span>GLB</span>
        </div>
        <p className="hint" data-testid="skin-status">
          {skinStatus}
        </p>
        <label className="file-input">
          载入兼容 GLB
          <input
            aria-label="载入兼容 GLB"
            type="file"
            accept=".glb"
            onChange={(e) => {
              setAvatar(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        {avatar && (
          <button className="full" onClick={() => setAvatar(null)}>
            恢复内置蒙皮
          </button>
        )}
        <p className="hint">
          内置模型为项目生成的 16
          骨骼蒙皮。导入模型需匹配相同骨骼名称、层级、米单位及绑定姿态；不自动重定向任意骨架。
        </p>
      </section>
      <div className="note">
        <i /> 真实动力学
        <br />
        <span>
          {mode === "free"
            ? "骨盆可自由移动；关节电机与真实足底接触共同支撑身体。"
            : "重力、惯性、关节限位及碰撞由 MuJoCo 计算；骨盆固定。"}
        </span>
      </div>
    </>
  );
}
