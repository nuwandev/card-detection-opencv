import type { DetectorConfig } from "@/lib/detector";
import type { ScanMetrics } from "../types";
import { JSX } from "react/jsx-runtime";

type MetricsCardProps = {
  candidatesCount: number;
  lastMetrics: ScanMetrics | null;
  secondBestScore: number;
  config: DetectorConfig;
};

export function MetricsCard({
  candidatesCount,
  lastMetrics,
  secondBestScore,
  config,
}: MetricsCardProps): JSX.Element {
  if (!lastMetrics) {
    return (
      <div className="flex flex-col gap-2.5 bg-black/40 border border-white/5 rounded-xl p-3.5 font-mono">
        <h4 className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
          Detection Feed Metrics
        </h4>
        <div className="flex justify-between">
          <span className="text-neutral-400">Quads Found:</span>
          <span
            className={
              candidatesCount > 0 ? "text-emerald-400" : "text-amber-500"
            }
          >
            {candidatesCount}
          </span>
        </div>
        <div className="text-neutral-500 italic text-center py-4 border-t border-white/5 mt-1.5">
          No candidate shape detected
        </div>
      </div>
    );
  }

  const scoreSatisfied = lastMetrics.score < config.qualityFloor;
  const confidenceGapValue =
    secondBestScore === Number.POSITIVE_INFINITY
      ? "∞"
      : (secondBestScore - lastMetrics.score).toFixed(3);
  const confidenceSatisfied =
    secondBestScore - lastMetrics.score > config.confidenceGap;

  return (
    <div className="flex flex-col gap-2.5 bg-black/40 border border-white/5 rounded-xl p-3.5 font-mono">
      <h4 className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
        Detection Feed Metrics
      </h4>

      <div className="flex justify-between">
        <span className="text-neutral-400">Quads Found:</span>
        <span
          className={
            candidatesCount > 0 ? "text-emerald-400" : "text-amber-500"
          }
        >
          {candidatesCount}
        </span>
      </div>

      <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
        <span className="text-neutral-400">Best Score:</span>
        <span className={scoreSatisfied ? "text-emerald-400" : "text-rose-400"}>
          {lastMetrics.score.toFixed(3)}
        </span>
      </div>

      <div className="flex justify-between text-[11px] pl-2 text-neutral-400">
        <span>Quality Floor:</span>
        <span>{config.qualityFloor.toFixed(2)}</span>
      </div>

      <div className="flex justify-between text-[11px] pl-2 text-neutral-400">
        <span>Score Pass:</span>
        <span className={scoreSatisfied ? "text-emerald-400" : "text-rose-400"}>
          {scoreSatisfied ? "YES" : "NO (Too High)"}
        </span>
      </div>

      <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
        <span className="text-neutral-400">Confidence Gap:</span>
        <span
          className={confidenceSatisfied ? "text-emerald-400" : "text-rose-400"}
        >
          {confidenceGapValue}
        </span>
      </div>

      <div className="flex justify-between text-[11px] pl-2 text-neutral-400">
        <span>Required Gap:</span>
        <span>{config.confidenceGap.toFixed(2)}</span>
      </div>

      <div className="flex justify-between text-[11px] pl-2 text-neutral-400">
        <span>Gap Pass:</span>
        <span
          className={confidenceSatisfied ? "text-emerald-400" : "text-rose-400"}
        >
          {confidenceSatisfied ? "YES" : "NO (Too Narrow)"}
        </span>
      </div>

      <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
        <span className="text-neutral-400">Aspect Ratio:</span>
        <span className="text-sky-300 font-semibold">
          {lastMetrics.ratio.toFixed(3)}
        </span>
      </div>

      <div className="flex justify-between text-[11px] pl-2 text-neutral-400">
        <span>Diff from target:</span>
        <span>
          {Math.abs(lastMetrics.ratio - config.targetAspectRatio).toFixed(3)}
        </span>
      </div>
    </div>
  );
}
