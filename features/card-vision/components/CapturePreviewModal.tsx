import { JSX } from "react/jsx-runtime";

type CapturePreviewModalProps = {
  capturedCard: string;
  onReset: () => void;
  onDownload: () => void;
};

export function CapturePreviewModal({
  capturedCard,
  onReset,
  onDownload,
}: CapturePreviewModalProps): JSX.Element {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-sm transition-all duration-300">
      <div className="w-full max-w-md bg-neutral-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <h3 className="font-bold text-base tracking-tight text-neutral-100 flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Autocaptured Result
          </h3>
          <button
            onClick={onReset}
            className="text-neutral-400 hover:text-neutral-200 transition-colors p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="relative aspect-[1.58] w-full rounded-2xl overflow-hidden bg-neutral-950 border border-white/5 shadow-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedCard}
            alt="Captured document result"
            className="w-full h-full object-contain"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onReset}
            className="flex-1 py-3 px-4 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all font-medium text-sm text-neutral-200 cursor-pointer"
          >
            Scan Again
          </button>
          <button
            onClick={onDownload}
            className="flex-1 py-3 px-4 rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all font-semibold text-sm text-white shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            Download Image
          </button>
        </div>
      </div>
    </div>
  );
}