/**
 * L-19: Shared labeled input field with optional unit suffix.
 * 方案 A: flex justify-between, label left, input right with constrained width.
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
    <div className="flex items-center justify-between gap-4 mb-1">
      <label className="text-sm font-medium text-slate-600 dark:text-slate-400 shrink-0">
        {label}
      </label>
      <div className="flex items-center gap-1.5 w-[58%] shrink-0">
        <input type={type} value={value} step={step} min={min} max={max} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 px-3 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors disabled:opacity-50" />
        {unit && <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{unit}</span>}
      </div>
    </div>
  );
}
