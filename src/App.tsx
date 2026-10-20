import { useCallback, useEffect, useState } from "react";
import { loadHuman } from "./physics/ModelLoader";
import type { LocomotionController } from "./human/LocomotionController";
import { HumanController } from "./human/HumanController";
import { SimulationLoop } from "./physics/SimulationLoop";
import { HumanViewer } from "./components/HumanViewer";
import { SimulationPanel } from "./components/SimulationPanel";
import { ActionPanel } from "./components/ActionPanel";
import { JointPanel } from "./components/JointPanel";
import type { ActionCommand } from "./human/ActionDefinitions";
declare global {
  interface Window {
    human?: {
      executeAction: (c: ActionCommand) => boolean;
      getState: () => {
        status: string;
        time: number;
        locomotion: ReturnType<LocomotionController["getState"]> | null;
        joints: ReturnType<HumanController["snapshot"]>;
      };
    };
  }
}
export default function App() {
  const [mode, setMode] = useState<"free" | "fixed">("free");
  return <SimulationApp key={mode} mode={mode} setMode={setMode} />;
}
function SimulationApp({
  mode,
  setMode,
}: {
  mode: "free" | "fixed";
  setMode: (m: "free" | "fixed") => void;
}) {
  const [loop, setLoop] = useState<SimulationLoop | null>(null),
    [error, setError] = useState(""),
    [, rerender] = useState(0);
  const [skin, setSkin] = useState(true),
    [avatar, setAvatar] = useState<File | null>(null),
    [skinStatus, setSkinStatus] = useState("GLB 加载中…");
  const [joints, setJoints] = useState(true),
    [axes, setAxes] = useState(true),
    [skeleton, setSkeleton] = useState(false),
    [home, setHome] = useState(0);
  const refresh = useCallback(() => rerender((n) => n + 1), []);
  const onError = useCallback((e: unknown) => setError(String(e)), []);
  useEffect(() => {
    let cancelled = false;
    let cleanup: undefined | (() => void);
    loadHuman(mode)
      .then((engine) => {
        if (cancelled) {
          engine.dispose();
          return;
        }
        const controller = new HumanController(engine);
        const simulation = new SimulationLoop(engine, controller);
        setLoop(simulation);
        window.human = {
          executeAction: (c) => controller.executeAction(c),
          getState: () => ({
            status: controller.status,
            time: engine.data.time,
            joints: controller.snapshot(),
            locomotion: controller.locomotion?.getState() ?? null,
          }),
        };
        cleanup = () => {
          delete window.human;
          controller.dispose();
          engine.dispose();
        };
      })
      .catch(onError);
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [onError]);
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark">H</span>
          <div>
            HUMAN DYNAMICS <small>交互式人体动力学实验室</small>
          </div>
        </div>
        <div className="header-meta">
          MUJOCO × THREE.JS{" "}
          <span className={error ? "badge error" : "badge"}>
            {error ? "初始化 / 运行错误" : loop ? "● 引擎在线" : "加载 WASM…"}
          </span>
        </div>
      </header>
      {error ? (
        <div role="alert" className="error-box">
          {error}
          <p>请查看浏览器控制台，确认 WASM 与 models/human.xml 可访问。</p>
        </div>
      ) : !loop ? (
        <div className="loading">正在初始化 MuJoCo WebAssembly 与人体模型…</div>
      ) : (
        <main>
          <aside className="left">
            <SimulationPanel
              {...{
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
              }}
            />
          </aside>
          <article className="stage">
            <div className="stage-title">
              <div>
                <span className="eyebrow">LIVE SIMULATION</span>
                <h1>人体动力学</h1>
              </div>
              <button onClick={() => setHome((n) => n + 1)}>⌖ 默认视角</button>
            </div>
            <HumanViewer
              {...{
                loop,
                skin,
                avatar,
                onSkinStatus: setSkinStatus,
                joints,
                axes,
                skeleton,
                home,
                onTick: refresh,
                onError,
              }}
            />
            <div className="view-caption">
              <span>拖拽旋转 · 滚轮缩放 · 右键平移</span>
              <span>Z ↑ · 米 / 弧度 / 秒</span>
            </div>
            <div className="telemetry">
              <div>
                <span>仿真时间</span>
                <b data-testid="sim-time">
                  {loop.engine.data.time.toFixed(2)} <small>s</small>
                </b>
              </div>
              <div>
                <span>运行状态</span>
                <b>{loop.paused ? "已暂停" : "运行中"}</b>
              </div>
              <div>
                <span>动作状态</span>
                <b data-testid="action-status">{loop.controller.status}</b>
              </div>
              <div>
                <span>当前指令</span>
                <b className="command">{loop.controller.action}</b>
              </div>
            </div>
            {loop.controller.error && (
              <p role="alert">{loop.controller.error}</p>
            )}
            <p className="stage-foot">
              {mode === "free" ? "自由基座 · 反馈平衡" : "固定基座"} · 500 Hz
              物理步进 · 丢弃延迟 {loop.dropped.toFixed(2)} s
            </p>
          </article>
          <aside className="right">
            <ActionPanel
              free={mode === "free"}
              execute={(action) => {
                loop.controller.executeAction({
                  action,
                  duration: 2,
                  source: "ui",
                });
                refresh();
              }}
            />
            <JointPanel controller={loop.controller} />
          </aside>
        </main>
      )}
      <footer>
        <span>HUMAN SIMULATION / MVP 01</span>
        <span>物理驱动 · 浏览器原生 · 单线程 WASM</span>
      </footer>
    </div>
  );
}
