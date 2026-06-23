import { JSX } from "react/jsx-runtime";
import type { DetectionState } from "../types";
import { getStatusText, STATUS_DOT_BY_STATE } from "../utils/scanUi";

type ScanStatusBarProps = {
  state: DetectionState;
  coverage: number;
};

export function ScanStatusBar({
  state,
  coverage,
}: ScanStatusBarProps): JSX.Element {
  if (state === "CAPTURED") {
    return (
      <div className="text-center">
        <h2 className="text-lg font-bold text-emerald-400 mb-1">
          Capture Completed!
        </h2>
        <p className="text-xs text-neutral-400">
          Card successfully processed and cropped.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="px-4 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-lg">
        <span
          className={`inline-block w-2 h-2 rounded-full mr-2 ${STATUS_DOT_BY_STATE[state]}`}
        />
        <span className="text-xs uppercase font-mono font-bold tracking-widest text-neutral-300">
          {getStatusText(state)}
        </span>
      </div>

      {coverage > 0 && (
        <p className="text-[10px] text-neutral-500 font-mono">
          Coverage: {(coverage * 100).toFixed(0)}%
        </p>
      )}
    </div>
  );
}