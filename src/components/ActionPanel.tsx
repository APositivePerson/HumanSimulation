import {
  actions,
  labels,
  type PoseActionName,
} from "../human/ActionDefinitions";
export function ActionPanel({
  execute,
  free,
}: {
  free?: boolean;
  execute: (action: PoseActionName) => void;
}) {
  return (
    <section>
      <div className="section-heading">
        <h2>动作指令</h2>
        <span>02 SEC</span>
      </div>
      <div className="actions">
        {Object.keys(actions).map((a) => (
          <button
            key={a}
            disabled={free && a === "bend_right_knee"}
            title={
              free && a === "bend_right_knee"
                ? "腿部由步态控制器管理；固定模式可单独屈膝"
                : undefined
            }
            onClick={() => execute(a as PoseActionName)}
          >
            {labels[a as PoseActionName]}
            <span>↗</span>
          </button>
        ))}
      </div>
    </section>
  );
}
