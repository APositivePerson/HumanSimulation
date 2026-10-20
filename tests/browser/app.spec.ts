import { test, expect } from "@playwright/test";
test("production WASM, physical actions, telemetry, pause/reset and WebGL synchronization", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("● 引擎在线")).toBeVisible();
  await page.getByLabel("基座模式").selectOption("fixed");
  await expect(page.getByText("● 引擎在线")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => window.human?.getState().time ?? 0))
    .toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "抬右手" }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.human
            ?.getState()
            .joints.find((j) => j.name === "right_shoulder")?.actual ?? 0,
      ),
    )
    .toBeGreaterThan(1.5);
  await expect(page.getByTestId("action-status")).toHaveText("completed");
  const right = await page.evaluate(() =>
    window.human!.getState().joints.find((j) => j.name === "right_shoulder")!,
  );
  expect(Math.abs(right.actual - right.target)).toBeLessThan(0.14);
  await page.getByRole("button", { name: "向左转头" }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.human!.getState().joints.find((j) => j.name === "neck_yaw")!
            .actual,
      ),
    )
    .toBeGreaterThan(0.5);
  await page.getByRole("button", { name: "暂停仿真" }).click();
  const time = await page.evaluate(() => window.human!.getState().time);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.human!.getState().time)).toBe(time);
  await page.getByRole("button", { name: "重置物理状态" }).click();
  expect(await page.evaluate(() => window.human!.getState().time)).toBe(0);
  expect(
    await page.evaluate(() =>
      window
        .human!.getState()
        .joints.every(
          (j) => j.actual === 0 && j.velocity === 0 && j.control === 0,
        ),
    ),
  ).toBe(true);
  await page.getByLabel("骨骼连线").check();
  await page.getByLabel("关节标记").uncheck();
  await page.getByLabel("世界坐标轴").uncheck();
  await page.getByRole("button", { name: "默认视角" }).click();
  await page.getByRole("button", { name: "继续仿真" }).click();
  await page.getByLabel("right_elbow", { exact: true }).fill("65");
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.human!.getState().joints.find((j) => j.name === "right_elbow")!
            .actual,
      ),
    )
    .toBeGreaterThan(0.8);
  await page.screenshot({ path: "test-results/human-lab.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("renderer resources plateau during a minute of running", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("● 引擎在线")).toBeVisible();
  // CDP collects heap after forced GC. This is a bounded smoke check, not a proof of no leaks.
  const client = await page.context().newCDPSession(page);
  await client.send("HeapProfiler.enable");
  await page.waitForTimeout(2000);
  await client.send("HeapProfiler.collectGarbage");
  const before = await client.send("Runtime.getHeapUsage");
  await page.waitForTimeout(60000);
  await client.send("HeapProfiler.collectGarbage");
  const after = await client.send("Runtime.getHeapUsage");
  expect(after.usedSize - before.usedSize).toBeLessThan(8 * 1024 * 1024);
  expect(
    await page.evaluate(() =>
      window.human!.getState().joints.every((j) => Number.isFinite(j.actual)),
    ),
  ).toBe(true);
});

test("free standing, physical walking/stopping, GLB skin and compatible-asset loading", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("skin-status")).toContainText("GLB 已绑定");
  await expect(page.getByTestId("gait-mode")).toHaveText("stand");
  expect(
    await page.evaluate(() => window.human!.getState().locomotion!.pelvis[2]),
  ).toBeGreaterThan(0.88);
  await page.getByRole("button", { name: "向前行走" }).click();
  await expect
    .poll(
      async () =>
        page.evaluate(() => window.human!.getState().locomotion!.steps),
      { timeout: 45000 },
    )
    .toBeGreaterThanOrEqual(2);
  expect(
    await page.evaluate(() => window.human!.getState().locomotion!.pelvis[1]),
  ).toBeLessThan(-0.06);
  await page.getByRole("button", { name: "停步并站稳" }).click();
  await expect(page.getByTestId("gait-mode")).toHaveText("stand", {
    timeout: 15000,
  });
  expect(
    await page.evaluate(() => window.human!.getState().locomotion!.pelvis[2]),
  ).toBeGreaterThan(0.88);
  await page.getByRole("button", { name: "抬右手" }).click();
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            window
              .human!.getState()
              .joints.find((j) => j.name === "right_shoulder")!.actual,
        ),
      { timeout: 10000 },
    )
    .toBeGreaterThan(1.5);
  await page.getByLabel("GLB 蒙皮外观").uncheck();
  await page.getByLabel("GLB 蒙皮外观").check();
  await page
    .getByLabel("载入兼容 GLB")
    .setInputFiles("public/models/human-skinned.glb");
  await expect(page.getByTestId("skin-status")).toContainText(
    "human-skinned.glb",
  );
  await page
    .getByLabel("载入兼容 GLB")
    .setInputFiles({
      name: "invalid.glb",
      mimeType: "model/gltf-binary",
      buffer: Buffer.from("invalid"),
    });
  await expect(page.getByTestId("skin-status")).toContainText("GLB 加载失败");
  await page.getByRole("button", { name: "恢复内置蒙皮" }).click();
  await expect(page.getByTestId("skin-status")).toContainText("GLB 已绑定");
  await page.getByRole("button", { name: "暂停仿真" }).click();
  await page.screenshot({
    path: "test-results/free-human-skinned.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "重置物理状态" }).click();
  expect(await page.evaluate(() => window.human!.getState().time)).toBe(0);
  expect(
    await page.evaluate(() => window.human!.getState().locomotion!.steps),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.human!.getState().locomotion!.pelvis[2]),
  ).toBeCloseTo(0.925, 6);
  expect(errors).toEqual([]);
});
