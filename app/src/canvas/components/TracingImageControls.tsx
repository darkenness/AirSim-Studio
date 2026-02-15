/**
 * TracingImageControls — Floating panel for background tracing image management.
 * Supports: import, opacity, scale, rotation, lock, calibration, remove.
 * Chinese UI, dark mode compatible.
 */

import { useState, useRef, useCallback } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Button } from '../../components/ui/button';
import { Slider } from '../../components/ui/slider';
import { Input } from '../../components/ui/input';
import {
  Image, Trash2, Lock, Unlock, RotateCw,
  Upload, Ruler, X, ChevronDown, ChevronUp,
} from 'lucide-react';

/** Accepted image MIME types */
const ACCEPT_TYPES = '.png,.jpg,.jpeg,.bmp';

export function TracingImageControls() {
  const stories = useCanvasStore(s => s.stories);
  const activeStoryId = useCanvasStore(s => s.activeStoryId);
  const setBackgroundImage = useCanvasStore(s => s.setBackgroundImage);
  const updateBackgroundImage = useCanvasStore(s => s.updateBackgroundImage);

  const story = stories.find(s => s.id === activeStoryId);
  const bg = story?.backgroundImage;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationDistance, setCalibrationDistance] = useState('');

  // Calibration state: two world-coordinate points picked on canvas
  const [calPoints, setCalPoints] = useState<{ x: number; y: number }[]>([]);

  // ── Import image via file input ──
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeStoryId) return;

    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setBackgroundImage(activeStoryId, {
        url,
        opacity: 0.4,
        scalePixelsPerMeter: 100,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        locked: false,
      });
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [activeStoryId, setBackgroundImage]);

  // ── Rotation: cycle 0 → 90 → 180 → 270 → 0 ──
  const handleRotate = useCallback(() => {
    if (!bg || !activeStoryId) return;
    const next = ((bg.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    updateBackgroundImage(activeStoryId, { rotation: next });
  }, [bg, activeStoryId, updateBackgroundImage]);

  // ── Lock toggle ──
  const handleToggleLock = useCallback(() => {
    if (!bg || !activeStoryId) return;
    updateBackgroundImage(activeStoryId, { locked: !bg.locked });
  }, [bg, activeStoryId, updateBackgroundImage]);

  // ── Remove image ──
  const handleRemove = useCallback(() => {
    if (!activeStoryId) return;
    setBackgroundImage(activeStoryId, undefined);
  }, [activeStoryId, setBackgroundImage]);

  // ── Start calibration mode ──
  const handleStartCalibration = useCallback(() => {
    setCalibrating(true);
    setCalPoints([]);
    setCalibrationDistance('');
    // Store a listener key so Canvas2D can detect calibration mode
    useCanvasStore.setState({ _tracingCalibrationActive: true } as any);
  }, []);

  // ── Cancel calibration ──
  const handleCancelCalibration = useCallback(() => {
    setCalibrating(false);
    setCalPoints([]);
    useCanvasStore.setState({ _tracingCalibrationActive: false } as any);
  }, []);

  // ── Receive calibration point from Canvas2D (called externally) ──
  // This is exposed via a global callback pattern
  const addCalibrationPoint = useCallback((wx: number, wy: number) => {
    setCalPoints(prev => {
      const next = [...prev, { x: wx, y: wy }];
      if (next.length >= 2) {
        // Two points collected, wait for distance input
      }
      return next.slice(0, 2);
    });
  }, []);

  // Expose addCalibrationPoint globally for Canvas2D to call
  (window as any).__tracingCalibrationAddPoint = addCalibrationPoint;

  // ── Apply calibration ──
  const handleApplyCalibration = useCallback(() => {
    if (calPoints.length < 2 || !bg || !activeStoryId) return;
    const dist = parseFloat(calibrationDistance);
    if (!dist || dist <= 0) return;

    // Pixel distance between the two points on the image
    const dx = calPoints[1].x - calPoints[0].x;
    const dy = calPoints[1].y - calPoints[0].y;
    const worldDist = Math.sqrt(dx * dx + dy * dy);
    if (worldDist < 1e-6) return;

    // Current scale: scalePixelsPerMeter means N image-pixels = 1 meter
    // The two points are worldDist meters apart in current scale.
    // User says they should be `dist` meters apart.
    // New scale = oldScale * (worldDist / dist)
    const newScale = bg.scalePixelsPerMeter * (worldDist / dist);
    updateBackgroundImage(activeStoryId, { scalePixelsPerMeter: Math.max(1, newScale) });

    setCalibrating(false);
    setCalPoints([]);
    useCanvasStore.setState({ _tracingCalibrationActive: false } as any);
  }, [calPoints, calibrationDistance, bg, activeStoryId, updateBackgroundImage]);

  // ── No image: show import button only ──
  if (!bg) {
    return (
      <div className="absolute top-2 right-14 z-20">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_TYPES}
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs bg-card/90 backdrop-blur-sm border-border shadow-sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Image size={14} />
          导入底图
        </Button>
      </div>
    );
  }

  // ── Calibration mode overlay ──
  if (calibrating) {
    return (
      <div className="absolute top-2 right-14 z-20 w-64 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">两点标定</span>
          <Button variant="ghost" size="icon-sm" className="h-5 w-5" onClick={handleCancelCalibration}>
            <X size={12} />
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-tight">
          {calPoints.length === 0 && '在底图上点击第一个标定点'}
          {calPoints.length === 1 && '在底图上点击第二个标定点'}
          {calPoints.length >= 2 && '输入两点间的实际距离 (米)'}
        </p>

        {/* Point indicators */}
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          <span className={calPoints.length >= 1 ? 'text-primary font-medium' : ''}>
            P1 {calPoints.length >= 1 ? `(${calPoints[0].x.toFixed(2)}, ${calPoints[0].y.toFixed(2)})` : '--'}
          </span>
          <span className={calPoints.length >= 2 ? 'text-primary font-medium' : ''}>
            P2 {calPoints.length >= 2 ? `(${calPoints[1].x.toFixed(2)}, ${calPoints[1].y.toFixed(2)})` : '--'}
          </span>
        </div>

        {calPoints.length >= 2 && (
          <div className="flex gap-1.5 items-center">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="实际距离 (m)"
              value={calibrationDistance}
              onChange={(e) => setCalibrationDistance(e.target.value)}
              className="h-7 text-xs flex-1"
            />
            <Button size="sm" className="h-7 text-xs px-2" onClick={handleApplyCalibration}>
              确定
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Full controls panel ──
  return (
    <div className="absolute top-2 right-14 z-20 w-56 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg select-none">
      {/* Header */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer hover:bg-muted/30 rounded-t-lg"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-1.5">
          <Image size={13} className="text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">底图追踪</span>
        </div>
        <div className="flex items-center gap-0.5">
          {bg.locked && <Lock size={11} className="text-amber-500" />}
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </div>
      </div>

      {!collapsed && (
        <div className="px-2.5 pb-2.5 space-y-2.5 border-t border-border pt-2">
          {/* Opacity slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">透明度</span>
              <span className="text-[10px] font-data text-muted-foreground">{Math.round(bg.opacity * 100)}%</span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[Math.round(bg.opacity * 100)]}
              onValueChange={([v]) => updateBackgroundImage(activeStoryId, { opacity: v / 100 })}
            />
          </div>

          {/* Scale input */}
          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground">比例 (像素/米)</span>
            <Input
              type="number"
              min={1}
              step={1}
              value={Math.round(bg.scalePixelsPerMeter)}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (v > 0) updateBackgroundImage(activeStoryId, { scalePixelsPerMeter: v });
              }}
              className="h-7 text-xs"
              disabled={bg.locked}
            />
          </div>

          {/* Rotation + Lock row */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-xs gap-1"
              onClick={handleRotate}
              disabled={bg.locked}
            >
              <RotateCw size={12} />
              旋转 {bg.rotation}°
            </Button>
            <Button
              variant={bg.locked ? 'default' : 'outline'}
              size="icon-sm"
              className="h-7 w-7"
              onClick={handleToggleLock}
              title={bg.locked ? '解锁底图' : '锁定底图'}
            >
              {bg.locked ? <Lock size={12} /> : <Unlock size={12} />}
            </Button>
          </div>

          {/* Calibrate + Replace + Remove row */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-xs gap-1"
              onClick={handleStartCalibration}
              disabled={bg.locked}
            >
              <Ruler size={12} />
              标定
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_TYPES}
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              size="icon-sm"
              className="h-7 w-7"
              onClick={() => fileInputRef.current?.click()}
              disabled={bg.locked}
              title="替换底图"
            >
              <Upload size={12} />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              className="h-7 w-7 text-destructive hover:bg-destructive/10"
              onClick={handleRemove}
              title="移除底图"
            >
              <Trash2 size={12} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
