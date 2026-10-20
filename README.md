# Human Dynamics Lab

浏览器内运行的自由站立、慢速步行与可交互人体动力学系统。React + TypeScript + Vite、Three.js，以及 Google DeepMind 官方 **`@mujoco/mujoco@3.16.0` 单线程 WebAssembly**。全部物理计算在浏览器中完成。

## 运行与操作

需要 Node.js 22.12+（推荐 Node 24 LTS）、npm、支持 WASM / WebGL2 的 Chrome。

```bash
npm install
npm run dev
```

打开终端显示的开发地址。默认模式是「自由站立 / 行走」：骨盆具有真实六自由度，人体通过足底地面接触站立。

1. 点击「向前行走」，左右脚交替摆动，人体沿自身正前方 −Y 缓慢前进，相机跟随水平位移。
2. 点击「停步并站稳」，控制器完成当前摆动脚落地，再将重心移回双脚支撑区。暂停不会完成这一步，需要恢复物理时间。
3. 「抬手」「转头」「屈肘」可以在自由模式中独立执行；腿部由平衡器管理，对应滑块禁用。
4. 切换到「固定动作演示」可单独控制全部关节，包括大幅屈膝；模式切换会重建模型、清除状态。
5. 「恢复初始姿态」通过 actuator 恢复上肢并请求停步。「重置物理状态」直接恢复 MJCF 初始 keyframe，并保留当前暂停状态。
6. 「GLB 蒙皮外观」切换蒙皮 / 碰撞几何显示；关节和骨骼连线可独立显示。

```bash
npm test                  # 12 项真实 WASM / GLB 测试，不是 mock
npm run build             # TypeScript + 生产打包
npm run preview           # 本地检查 dist
npx playwright install chromium
npm run test:browser      # 生产浏览器交互、步行、GLB、内存测试
```

已有 Chromium 时使用 `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`。浏览器套件包含一分钟内存观察，约需 1–2 分钟。受限云环境可使用 `npm ci --cache /workspace/.npm-cache`；普通本地开发不需要该缓存参数。

## 两种物理模型

| 模型                     | 骨盆                  | 人体刚体 | 驱动关节 / actuator | 广义坐标 / 速度 |
| ------------------------ | --------------------- | -------- | ------------------- | --------------- |
| `human-free.xml`（默认） | freejoint，无固定约束 | 16       | 20 / 20             | 27 / 26         |
| `human.xml`              | 固定在世界坐标系      | 16       | 16 / 16             | 16 / 16         |

人体包含骨盆、躯干、颈、头、左右上臂/前臂/手、大腿/小腿/脚。自由模型每条腿使用 3 自由度髋、单轴膝、2 自由度踝；多个局部 hinge 组合在同一 body 中。所有模型保留 −9.81 m/s² 重力、惯量、接触碰撞和关节限位。各段显式质量，惯量由 MuJoCo 根据碰撞几何及质量计算。

自由模型没有用于站立的 equality、mocap、根部 actuator、弹簧吊挂或外部支撑力。自由基座的位移与姿态由关节力矩和地面接触共同产生。下肢位置驱动器 `kp=1200, kv=85`，力矩限制 ±240 N·m；上肢与躯干保留 `kp=180, kv=24`，±160 N·m。足底尺寸 0.14 × 0.30 m，步态是针对此简化模型调整的低速平地步态。

## 站立与步行控制

`LocomotionController` 使用两个阶段：2 秒双脚支撑重心转移、2 秒摆动脚前移和落地。默认前进落脚间隔 0.06 m，抬脚轨迹峰值 0.025 m；稳态前进速度约 0.015 m/s。摆动时间与渲染帧率无关，按物理时间推进。

`LegIK` 在独立的 **scratch MjData** 中计算期望关节角：固定参考根部目标，使用 `mj_kinematics`、数值 Jacobian 和阻尼最小二乘求解每脚的位置与姿态。仅这个参考求解器会改写自己的 qpos；它不步进、不渲染，也不会覆写正在仿真的 qpos。初始站立 keyframe 也由同一求解器生成。

`BalanceController` 读取真实根部位置、姿态、速度、全身质心和 `qfrc_bias`，计算期望支撑力及姿态反馈力矩，按支撑阶段分配足端 wrench。通过官方 `mj_jacBody` 的平移/旋转 Jacobian，将 `qfrc_bias − Jᵀ·wrench` 映射到腿部关节力矩前馈。前馈除以位置 actuator 的 kp 后叠加到 ctrl：

```text
ctrl = IK 位置目标 + 支撑力矩前馈 / kp
位置 actuator 力矩 = kp × (ctrl − 实际角度) − kv × 实际速度
```

足端力矩按足底支撑尺寸限幅，ctrl 再按 actuator 范围夹紧。所有实际运动都来自 `mj_step`，控制器不向根部施加稳定力或修改真实位姿。测试中有限的外部侧推仅用于恢复能力验证，正常站立/行走中的 `xfrc_applied` 和 `qfrc_applied` 保持零。

步态停止时等待落脚并回到双脚支撑；检测到骨盆高度过低时标记 fallen / failed，需要重置。当前验证范围是默认模型、平坦地面和低速步行；坡地、楼梯、奔跑、任意大幅动作及大扰动恢复需要进一步控制器开发与验证。该模型没有临床生物力学标定。

## GLB 蒙皮

内置 `public/models/human-skinned.glb` 是项目生成的实际二进制 glTF：**16 根骨骼、5,490 个顶点、skinIndex / skinWeight / inverseBindMatrices、无动画片段**。它是简化的程序化人体外观，包含衣服配色和关节附近的混合权重。生成的资产使用 CC0，见同目录 LICENSE.txt。

`SkinnedHuman` 使用 GLTFLoader 加载，建立 MuJoCo body → Bone 映射。每帧读取 `data.xpos / xquat`，将物理世界姿态转换为 GLB 骨骼局部姿态，再由 Three.js 执行线性蒙皮。没有 AnimationMixer、行走动画片段或独立于物理的骨骼运动。

界面支持上传兼容的 `.glb`（最多 20 MB）。必须满足：

- 16 根骨骼名称与 MJCF body 名相同，且父子层级一致。
- 米单位，Y-up glTF；绑定姿态与内置 GLB 一致。
- 使用相同骨架比例和绑定空间，不带额外的骨骼父节点变换。
- 内嵌资源；本版不实现 Draco、KTX2 或任意 Mixamo / VRM 骨架自动重定向。

加载失败会显示原因并保留已有模型；可以恢复内置蒙皮。若需接入不同人体比例或骨骼轴的高质量美术模型，应先在 DCC 中对齐骨架或增加明确的重定向适配器。

重新生成内置资产：

```bash
npm run generate:avatar
# 改动自由模型腿长或关节结构后，重算初始化 keyframe：
npx tsx scripts/generate-standing-key.ts
```

GLB 生成使用固定模型的零角度姿态作为绑定参考；自由模型站立 keyframe 可以是屈膝姿态，加载后仍由真实物理骨骼驱动。

## 坐标、状态与时间

MJCF 使用 `compiler angle="radian"`。右手世界坐标：**+X 为人体左侧、−Y 为正前方、+Z 向上**。关节轴定义在对应 body 的局部坐标系，遵循右手法则。界面角度与速度显示为度、度/秒；引擎和 ctrl 使用 rad、rad/s，力矩使用 N·m。

| 关节                              | 局部轴 | 范围 rad   |
| --------------------------------- | ------ | ---------- |
| spine                             | +Y     | −0.35…0.35 |
| neck_yaw                          | +Z     | −0.9…0.9   |
| left/right_shoulder               | +Y     | −2.7…2.7   |
| left/right_shoulder_flex          | +X     | −1.5…2.5   |
| left/right_elbow                  | −X     | 0…2.4      |
| left/right_hip                    | +X     | −1.5…1.2   |
| left/right_hip_abduction          | +Y     | −0.5…0.5   |
| left/right_hip_yaw（自由模型）    | +Z     | −0.6…0.6   |
| left/right_knee                   | +X     | 0…2.2      |
| left/right_ankle                  | +X     | −0.55…0.55 |
| left/right_ankle_roll（自由模型） | +Y     | −0.5…0.5   |

正颈角向人体左侧转头；左肩负角、右肩正角向侧面抬臂；正肘角向前屈肘；正膝角让小腿向后弯曲，髋前屈为负角。

碰撞几何渲染使用 Z-up Three.js 世界，读取 `geom_xpos / geom_xmat`；行主序旋转矩阵转为 Three.js 四元数。蒙皮使用标准 Y-up 资源，通过 ±90° X 轴转换连接 Z-up 场景。`xquat` 顺序是 w,x,y,z，转换到 Three.js 时使用 x,y,z,w。每步后 `mj_forward` 保证位姿派生量与当前 qpos 一致，重置也立即同步。

物理步长固定为 0.002 秒（500 Hz），RAF 驱动物理累积与渲染，UI 约 10 Hz 更新。每帧最多接受 0.1 秒物理时间，额外时间丢弃并显示统计，以避免切换后台后无界追赶。倍速作用于物理时间；性能不足时会降低相对真实时间的速度。

遥测分别展示关节目标、实际角度、实际速度、ctrl 和实际 actuator 力矩。自由模式腿部目标是 IK 参考角，ctrl 额外包含支撑前馈，二者可以不同；固定模式 ctrl 是经过 Smoothstep 插值的轨迹角。暂停冻结物理状态，正常动作不直接设置真实 qpos。

## Agent / 外部模块入口

```js
window.human.executeAction({ action: "walk_forward", source: "agent" });
window.human.executeAction({ action: "stop_walk", source: "agent" });
window.human.executeAction({
  action: "raise_right_arm",
  duration: 2,
  source: "agent",
});
window.human.getState(); // {status, time, locomotion, joints}
```

`walk_forward` 持续行走至收到 `stop_walk` / `stand`；duration 用于姿态命令。`locomotion` 包含 mode、phase、steps、pelvis 世界位置、实际接触数量、足底最低高度和 stopping 标志。固定模式的 locomotion 为 null。

姿态命令还包括 `raise_left_arm`, `lower_arms`, `turn_head_left`, `turn_head_right`, `bend_left_elbow`, `bend_right_knee`, `reset_pose`。自由模式拒绝单独的大幅屈膝命令，避免和腿部平衡控制权冲突；切换固定模式可用。新姿态命令从当前轨迹目标连续插值，未指定关节保留前一目标。输入时长须为有限正数。

状态：idle / running / completed / failed。上肢/固定模式轨迹结束后，位置误差 <0.14 rad 且速度 <0.12 rad/s 才标记 completed；额外 6 秒未稳定则 failed。步行持续 running，落脚停稳后 completed。没有动作队列、网络 Agent 服务或鉴权层。

## 官方 API 与部署

安装包版本固定为 3.16.0，使用实际类型定义与运行测试核对 API：默认 `loadMujoco({locateFile})`、`MjModel.from_xml_string`、`new MjData(model)`、`mj_step`、`mj_forward`、`mj_resetData` / `mj_resetDataKeyframe`、`mj_kinematics`、`mj_jacBody`、`mj_name2id`、`mj_id2name`。

该版本 `DoubleBuffer` 的实际方法是 **`GetView()`（大写 G）**，与随包 README 部分旧示例的 `getView()` 不同。代码按实际 d.ts 和运行结果实现，并用 `delete()` 释放所有模型、数据与输出缓冲区。

WASM 以 `@mujoco/mujoco/mujoco.wasm?url` 导入，Vite 输出独立哈希资源；MJCF 和 GLB 使用 BASE_URL 下的 models 路径。部署上传完整 dist，正确提供 WASM MIME（application/wasm）并启用 gzip / brotli。单线程不需要 SharedArrayBuffer 或跨源隔离头。WASM 原始大小约 10.8 MB；Vite 对官方绑定的 Node `module` 分支会发出 externalized 提示，浏览器路径不使用此分支，生产浏览器测试覆盖加载。

## 文件结构与验证

```text
public/models/human.xml                  固定基座模型
public/models/human-free.xml             自由基座、20 驱动器和站立 keyframe
public/models/human-skinned.glb          内置带权重的骨骼蒙皮资产
src/physics/                            引擎、加载和固定步长循环
src/human/HumanController.ts             动作、控制权与 Agent 入口
src/human/LocomotionController.ts        重心转移、摆动、停止和跌倒状态
src/human/LegIK.ts                       独立参考数据中的足端 IK
src/human/BalanceController.ts           质心 / 根部反馈和 Jacobian 力矩映射
src/rendering/SkinnedHuman.ts            GLB 加载、物理骨骼同步与释放
src/rendering/HumanRenderer.ts           碰撞几何、骨架与蒙皮切换
src/rendering/SceneManager.ts            场景、相机跟随和释放
src/components/                         React 控制、遥测和导入面板
tests/physics.test.ts                    原有动作、限位、重置及几何同步
tests/locomotion.test.ts                 自由站立、受推恢复、持续行走与停止
tests/skin.test.ts                       GLB 骨骼、顶点蒙皮及取消加载
tests/browser/app.spec.ts               生产浏览器回归
scripts/                                GLB 和初始化 keyframe 生成工具
```

自动检查包括 60 秒自由站立、35 N / 0.1 s 有限侧推后的恢复、130 秒连续步行（至少 30 次落脚，前进超过 1.7 米，左右脚实际离地）、关节限位、停步恢复、重置、蒙皮顶点移动与世界骨骼同步，以及一分钟浏览器 GC 后堆增长 <8 MB 的观察。

卸载时取消 RAF、断开 ResizeObserver、释放 OrbitControls、几何/材质/纹理/骨骼、阴影、WebGL 上下文、MuJoCo 主/参考 MjData、DoubleBuffer 和 MjModel。共享 WASM 模块复用。内存检查是有界测试，不证明任意资产和无限期运行无泄漏。
