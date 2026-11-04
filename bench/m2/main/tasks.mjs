// M2 main set: the 4 frozen SCORE_TASKS of bench/live/score-tasks.mjs (sha256 in bench/saving-score.lock).
// Re-exported, not copied, so the main set can never drift from the frozen saving score.
import { SCORE_TASKS } from "../../live/score-tasks.mjs";
export const TASKS = SCORE_TASKS.map((t) => ({ ...t, set: "main" }));
