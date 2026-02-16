import { useState, useCallback } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Button } from '../../components/ui/button';
import { Ruler, Crosshair } from 'lucide-react';

const PRESETS = [
  { label: '1:1 (1m)', value: 1.0 },
  { label: '1:10 (10cm)', value: 0.1 },
  { label: '1:100 (1cm)', value: 0.01 },
  { label: '10:1 (10m)', value: 10 },
];

export function ScaleFactorControl() {
  const scaleFactor = useCanvasStore(s => s.scaleFactor);
  const setScaleFactor = useCanvasStore(s => s.setScaleFactor);
  const calibrationPoints = useCanvasStore(s => s.calibrationPoints);
  const setCalibrationPoints = useCanvasStore(s => s.setCalibrationPoints);
  const applyCalibration = useCanvasStore(s => s.applyCalibration);

  const [open, setOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [calibDist, setCalibDist] = useState('');

  const isCalibrating = calibrationPoints !== null;
  const hasTwoPoints = calibrationPoints !== null && calibrationPoints.length === 2;

  const handleManualSubmit = useCallback(() => {
    const v = parseFloat(manualInput);
    if (!isNaN(v) && v > 0) {
      setScaleFactor(v);
      setManualInput('');
    }
  }, [manualInput, setScaleFactor]);

  const handleCalibrationApply = useCallback(() => {
    const dist = parseFloat(calibDist);
    if (!isNaN(dist) && dist > 0) {
      applyCalibration(dist);
      setCalibDist('');
    }
  }, [calibDist, applyCalibration]);

  const startCalibration = useCallback(() => {
    // Set to empty tuple-like state; Canvas2D will populate points on click
    setCalibrationPoints(null);
    // Signal calibration start by setting a sentinel — we use a special approach:
    // set points to a pair with NaN to indicate "waiting for first click"
    setCalibrationPoints([{ x: NaN, y: NaN }, { x: NaN, y: NaN }]);
  }, [setCalibrationPoints]);

  const cancelCalibration = useCallback(() => {
    setCalibrationPoints(null);
    setCalibDist('');
  }, [setCalibrationPoints]);

  return (
    <div className="absolute bottom-2 left-2 z-10 select-none">
      <div className="flex items-center gap-0.5 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-1 py-1 shadow-sm">
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-8 w-8"
          onClick={() => setOpen(!open)}
          title="比例尺设置"
        >
          <Ruler size={16} />
        </Button>
        <span className="font-data text-xs text-muted-foreground px-1">
          {scaleFactor === 1 ? '1:1' : `x${scaleFactor}`}
        </span>
      </div>

      {open && (
        <div className="absolute bottom-8 left-0 bg-card/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 shadow-lg min-w-[200px] space-y-2">
          <div className="text-xs font-semibold text-foreground">比例尺 (m/格)</div>

          {/* Presets */}
          <div className="flex flex-wrap gap-1">
            {PRESETS.map(p => (
              <button
                key={p.value}
                className={`text-xs px-2 py-1 rounded border ${
                  Math.abs(scaleFactor - p.value) < 1e-9
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-muted-foreground hover:bg-accent'
                }`}
                onClick={() => setScaleFactor(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Manual input */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              min="0.001"
              className="w-20 h-8 text-xs px-2 bg-background border border-border rounded text-foreground font-mono"
              placeholder="自定义..."
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
            />
            <Button variant="ghost" size="icon-sm" className="h-8 w-8 text-xs" onClick={handleManualSubmit}>
              OK
            </Button>
          </div>

          {/* Calibration */}
          <div className="border-t border-border pt-2 space-y-1">
            <div className="text-xs text-muted-foreground">两点校准</div>
            {!isCalibrating ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs w-full gap-1"
                onClick={startCalibration}
              >
                <Crosshair size={14} />
                开始校准
              </Button>
            ) : hasTwoPoints && !isNaN(calibrationPoints[0].x) ? (
              <div className="space-y-1">
                <div className="text-xs text-green-500">已选两点，输入实际距离:</div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0.001"
                    className="w-20 h-8 text-xs px-2 bg-background border border-border rounded text-foreground font-mono"
                    placeholder="距离(m)"
                    value={calibDist}
                    onChange={e => setCalibDist(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCalibrationApply()}
                    autoFocus
                  />
                  <Button variant="ghost" size="icon-sm" className="h-8 text-xs" onClick={handleCalibrationApply}>
                    应用
                  </Button>
                  <Button variant="ghost" size="icon-sm" className="h-8 text-xs text-destructive" onClick={cancelCalibration}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-xs text-amber-500">在画布上点击两个点...</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-destructive"
                  onClick={cancelCalibration}
                >
                  取消
                </Button>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground/60">
            当前: 1格 = {scaleFactor.toFixed(3)}m
          </div>
        </div>
      )}
    </div>
  );
}
