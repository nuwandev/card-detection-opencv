import { JSX } from "react/jsx-runtime";

type ScannerHeaderProps = {
  ready: boolean;
  showTuning: boolean;
  onToggleTuning: () => void;
};

export function ScannerHeader({
  ready,
  showTuning,
  onToggleTuning,
}: ScannerHeaderProps): JSX.Element {
  return (
    <header className="w-full z-40 px-6 py-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
        <h1 className="text-sm font-bold uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-neutral-100 to-neutral-400">
          CardVision AI
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onToggleTuning}
          className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
            showTuning
              ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.2)]"
              : "bg-neutral-800/80 border-neutral-700 hover:border-neutral-600 text-neutral-300"
          }`}
        >
          ⚙️ Tune Parameters
        </button>

        <div className="px-3 py-1 text-[10px] uppercase font-mono font-bold tracking-widest bg-neutral-800/80 border border-neutral-700/50 rounded-full">
          {ready ? "OpenCV Active" : "WASM Loading..."}
        </div>
      </div>
    </header>
  );
}