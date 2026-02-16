/**
 * L-19: Shared labeled input field with optional unit suffix.
 */
export function InputField({ label, value, onChange, unit, type = 'text', step, min, max, disabled }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  unit?: string;
  type?: string;
  step?: string;
  min?: string | number;
  max?: string | number;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground tracking-wider">{label}</span>
      <div className="flex items-center gap-1">
        <input type={type} value={value} step={step} min={min} max={max} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring bg-background disabled:opacity-50" />
        {unit && <span className="text-[11px] text-muted-foreground min-w-[28px]">{unit}</span>}
      </div>
    </label>
  );
}
