import type { SizeGoal } from "../../types/engine";
import { formatSize, type SizeBound } from "../../utils/file-size";

/** The bound a size is shown against, so it never appears on the wrong side of it (D4). */
function boundFor(goal: SizeGoal, bytes: number): SizeBound {
  if (goal.mode === "maximum") return { kind: "upper", bytes: goal.maxBytes };
  if (goal.mode === "target") return { kind: "upper", bytes: goal.targetBytes };
  return bytes < goal.minBytes
    ? { kind: "lower", bytes: goal.minBytes }
    : { kind: "upper", bytes: goal.maxBytes };
}

/** A result size as text, rounded so it never crosses the goal's bound (D4). */
export const sizeOf = (goal: SizeGoal, bytes: number): string =>
  formatSize(bytes, boundFor(goal, bytes));
