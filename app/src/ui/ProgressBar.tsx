import type { Progress } from "../domain/completion.ts";
import { percentFloor } from "../domain/completion.ts";

/** Horizontal progress bar; the numbers are always written next to it. */
export function ProgressBar({ progress, color, className = "", label }: { progress: Progress; color: string; className?: string; label: string }) {
  const percent = percentFloor(progress);
  return (
    <div className={`progress ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="progress__bar" style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}
