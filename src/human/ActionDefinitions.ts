export const actions = {
  raise_left_arm: { left_shoulder: -1.9 },
  raise_right_arm: { right_shoulder: 1.9 },
  lower_arms: {
    left_shoulder: 0,
    right_shoulder: 0,
    left_shoulder_flex: 0,
    right_shoulder_flex: 0,
    left_elbow: 0,
    right_elbow: 0,
  },
  turn_head_left: { neck_yaw: 0.7 },
  turn_head_right: { neck_yaw: -0.7 },
  bend_left_elbow: { left_elbow: 1.7 },
  bend_right_knee: { right_knee: 1.3 },
  reset_pose: {},
} satisfies Record<string, Record<string, number>>;
export type PoseActionName = keyof typeof actions;
export type ActionName =
  PoseActionName | "walk_forward" | "stand" | "stop_walk";
export interface ActionCommand {
  action: ActionName;
  duration?: number;
  source?: string;
}
export const labels: Record<PoseActionName, string> = {
  raise_left_arm: "抬左手",
  raise_right_arm: "抬右手",
  lower_arms: "放下双臂",
  turn_head_left: "向左转头",
  turn_head_right: "向右转头",
  bend_left_elbow: "弯曲左肘",
  bend_right_knee: "弯曲右膝",
  reset_pose: "恢复初始姿态",
};
