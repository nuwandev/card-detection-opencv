import dynamic from "next/dynamic";

// No SSR — needs window, navigator, WebAssembly
const ScannerView = dynamic(
  () => import("@/components/Scanner").then((m) => m.ScannerView),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function ScannerPage() {
  return <ScannerView />;
}