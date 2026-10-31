import { JOINTS, JOINT_TITLES, catalog, type Joint, type Size } from "../parts";

type Props = { joint: Joint; size: Size; onJoint: (j: Joint) => void; disabled?: boolean };

/** How stacked parts join, for every render and download: tapered jaws (default), the legacy dowel pins, or pins plus a screw clamp. */
export default function JointPicker({ joint, size, onJoint, disabled }: Props) {
  const hw = catalog.standards[size].hardware;
  const what: Record<Joint, string> = {
    jaws: "Three tapered jaws on each top face drop into pockets in the part above. No hardware; cranks and pointers drop over the jaws too.",
    pins: `The legacy joint: six dowel pin holes in each face, three ${hw.pin} steel pins join two parts (the printed coupler fits the same holes).`,
    bolts: `Dowel pins plus a clamp: three ${hw.screw} screws and nuts through a joint ring, on parts with room for them.`,
  };
  return (
    <div className="panel-section">
      <div className="segmented" role="radiogroup" aria-label="Joints">
        {JOINTS.map(j => (
          <button key={j} type="button" role="radio" aria-checked={joint === j} className={joint === j ? "on" : ""} disabled={disabled} onClick={() => onJoint(j)}>{JOINT_TITLES[j]}</button>
        ))}
      </div>
      <p className="muted small">{what[joint]}</p>
    </div>
  );
}
