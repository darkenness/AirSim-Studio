import { useCanvasStore } from '../../store/useCanvasStore';
import { Button } from '../../components/ui/button';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

export function ZoomControls() {
  const cameraZoom = useCanvasStore(s => s.cameraZoom);
  const setCameraZoom = useCanvasStore(s => s.setCameraZoom);

  return (
    <div className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-1 py-1 shadow-sm select-none">
      <Button variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => setCameraZoom(Math.max(10, cameraZoom * 0.85))}>
        <ZoomOut size={16} />
      </Button>
      <span className="font-data text-xs text-muted-foreground w-9 text-center">
        {Math.round(cameraZoom)}
      </span>
      <Button variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => setCameraZoom(Math.min(200, cameraZoom * 1.15))}>
        <ZoomIn size={16} />
      </Button>
      <div className="w-px h-4 bg-border mx-0.5" />
      <Button variant="ghost" size="icon-sm" className="h-8 w-8" onClick={() => setCameraZoom(50)}>
        <Maximize2 size={16} />
      </Button>
    </div>
  );
}
