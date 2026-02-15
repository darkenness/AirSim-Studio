import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Button } from '../../components/ui/button';
import { SkipBack, ChevronLeft, Play, Pause, ChevronRight, SkipForward } from 'lucide-react';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function TimeStepper() {
  const transientResult = useAppStore(s => s.transientResult);
  const appMode = useCanvasStore(s => s.appMode);
  const setAppMode = useCanvasStore(s => s.setAppMode);

  const currentStep = useCanvasStore(s => s.currentTransientStep);
  const setCurrentStep = useCanvasStore(s => s.setCurrentTransientStep);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (appMode !== 'results' || !transientResult) return null;

  const totalSteps = transientResult.timeSeries.length;
  const currentTime = transientResult.timeSeries[currentStep]?.time ?? 0;
  const endTime = transientResult.timeSeries[totalSteps - 1]?.time ?? 0;

  // Playback logic
  useEffect(() => {
    if (isPlaying && totalSteps > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= totalSteps - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, playbackSpeed, totalSteps]);

  const goFirst = useCallback(() => { setCurrentStep(0); setIsPlaying(false); }, []);
  const goPrev = useCallback(() => setCurrentStep(s => Math.max(0, s - 1)), []);
  const goNext = useCallback(() => setCurrentStep(s => Math.min(totalSteps - 1, s + 1)), [totalSteps]);
  const goLast = useCallback(() => { setCurrentStep(totalSteps - 1); setIsPlaying(false); }, [totalSteps]);
  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);

  const speeds = [0.5, 1, 2, 4];

  return (
    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-lg select-none">
      {/* Back to edit button */}
      <Button
        variant="ghost"
        size="sm"
        className="text-xs mr-2"
        onClick={() => setAppMode('edit')}
      >
        返回编辑
      </Button>

      <div className="w-px h-6 bg-border" />

      {/* Playback controls */}
      <Button variant="ghost" size="icon-sm" onClick={goFirst}><SkipBack size={14} /></Button>
      <Button variant="ghost" size="icon-sm" onClick={goPrev}><ChevronLeft size={14} /></Button>
      <Button variant="ghost" size="icon-sm" onClick={togglePlay}>
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={goNext}><ChevronRight size={14} /></Button>
      <Button variant="ghost" size="icon-sm" onClick={goLast}><SkipForward size={14} /></Button>

      <div className="w-px h-6 bg-border" />

      {/* Time slider */}
      <div className="flex items-center gap-2 min-w-[200px]">
        <span className="text-[10px] font-mono text-muted-foreground w-16 text-right">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={totalSteps - 1}
          value={currentStep}
          onChange={(e) => setCurrentStep(parseInt(e.target.value))}
          className="flex-1 h-1 accent-primary cursor-pointer"
        />
        <span className="text-[10px] font-mono text-muted-foreground w-16">
          {formatTime(endTime)}
        </span>
      </div>

      <div className="w-px h-6 bg-border" />

      {/* Speed selector */}
      <div className="flex items-center gap-0.5">
        {speeds.map(s => (
          <button
            key={s}
            onClick={() => setPlaybackSpeed(s)}
            className={`px-1.5 py-0.5 text-[10px] rounded ${
              playbackSpeed === s
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Step info */}
      <span className="text-[10px] text-muted-foreground ml-1">
        {currentStep + 1}/{totalSteps}
      </span>
    </div>
  );
}
