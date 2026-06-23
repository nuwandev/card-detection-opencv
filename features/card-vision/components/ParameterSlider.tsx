import type { ChangeEvent, JSX } from "react";

type ParameterSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel?: string;
  onChange: (value: number) => void;
};

export function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  valueLabel,
  onChange,
}: ParameterSliderProps): JSX.Element {
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(Number.parseFloat(event.target.value));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-neutral-300">
        <span>{label}</span>
        <span className="font-mono">{valueLabel ?? value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="w-full accent-emerald-500"
      />
    </div>
  );
}
