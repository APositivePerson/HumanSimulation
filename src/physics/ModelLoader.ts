import loadMujoco from "@mujoco/mujoco";
import wasmUrl from "@mujoco/mujoco/mujoco.wasm?url";
import { MuJoCoEngine } from "./MuJoCoEngine";
let modulePromise: ReturnType<typeof loadMujoco> | undefined;
export async function loadHuman(mode: "free" | "fixed" = "free") {
  modulePromise ??= loadMujoco({
    locateFile: (path: string) => (path.endsWith(".wasm") ? wasmUrl : path),
  });
  const [mj, response] = await Promise.all([
    modulePromise,
    fetch(
      `${import.meta.env.BASE_URL}models/${mode === "free" ? "human-free.xml" : "human.xml"}`,
    ),
  ]);
  if (!response.ok) throw new Error(`MJCF HTTP ${response.status}`);
  return new MuJoCoEngine(mj, await response.text());
}
