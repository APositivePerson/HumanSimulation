import { useEffect, useRef } from "react";
import { SceneManager } from "../rendering/SceneManager";
import type { SimulationLoop } from "../physics/SimulationLoop";
export function HumanViewer({
  loop,
  skin,
  avatar,
  onSkinStatus,
  joints,
  axes,
  skeleton,
  home,
  onTick,
  onError,
}: {
  loop: SimulationLoop;
  skin: boolean;
  avatar: File | null;
  onSkinStatus: (s: string) => void;
  joints: boolean;
  axes: boolean;
  skeleton: boolean;
  home: number;
  onTick: () => void;
  onError: (e: unknown) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<SceneManager | null>(null),
    tick = useRef(onTick);
  tick.current = onTick;
  useEffect(() => {
    let frame = 0;
    let previous = performance.now(),
      lastUI = 0;
    let manager: SceneManager;
    try {
      manager = new SceneManager(host.current!, loop.engine);
      scene.current = manager;
    } catch (e) {
      onError(e);
      return;
    }
    function animate(now: number) {
      try {
        loop.advance((now - previous) / 1000);
        previous = now;
        manager.render();
        if (now - lastUI > 100) {
          tick.current();
          lastUI = now;
        }
        frame = requestAnimationFrame(animate);
      } catch (e) {
        onError(e);
      }
    }
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      manager.dispose();
      scene.current = null;
    };
  }, [loop, onError]);
  useEffect(() => {
    if (scene.current) {
      scene.current.human.joints.visible = joints;
      scene.current.axes.visible = axes;
      scene.current.human.skeleton.visible = skeleton;
    }
  }, [joints, axes, skeleton, loop]);
  useEffect(() => {
    scene.current?.human.setSkinVisible(skin);
  }, [skin, loop]);
  useEffect(() => {
    let cancelled = false;
    const current = scene.current;
    if (!current) return;
    onSkinStatus("GLB 加载中…");
    (async () => {
      if (avatar && avatar.size > 20 * 1024 * 1024)
        throw new Error("GLB 超过 20 MB 限制");
      const source = avatar
        ? await avatar.arrayBuffer()
        : `${import.meta.env.BASE_URL}models/human-skinned.glb`;
      if (cancelled) return;
      await current.human.loadSkin(source);
      if (!cancelled)
        onSkinStatus(
          `GLB 已绑定 · 16 骨骼${avatar ? " · " + avatar.name : ""}`,
        );
    })().catch((e) => {
      if (!cancelled) onSkinStatus(`GLB 加载失败：${String(e)}`);
    });
    return () => {
      cancelled = true;
    };
  }, [avatar, loop, onSkinStatus]);
  useEffect(() => {
    scene.current?.home();
  }, [home]);
  return (
    <div className="viewport" ref={host} aria-label="三维人体动力学视图" />
  );
}
