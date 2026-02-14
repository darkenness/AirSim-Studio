import { useRef, useCallback, useEffect, useState } from 'react';
import { Stage, Layer, Rect, Text, Arrow, Circle, Group, Line } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useAppStore } from '../../store/useAppStore';
import type { ZoneNode, SimulationResult } from '../../types';

const GRID_SIZE = 20;
const COLORS = {
  room: '#dbeafe',
  roomBorder: '#3b82f6',
  roomSelected: '#bfdbfe',
  ambient: '#dcfce7',
  ambientBorder: '#22c55e',
  link: '#64748b',
  linkSelected: '#3b82f6',
  flowPositive: '#22c55e',
  flowNegative: '#ef4444',
  grid: '#f1f5f9',
  pressure: '#7c3aed',
};

function GridLines({ width, height }: { width: number; height: number }) {
  const lines = [];
  for (let x = 0; x < width; x += GRID_SIZE) {
    lines.push(<Line key={`v${x}`} points={[x, 0, x, height]} stroke={COLORS.grid} strokeWidth={0.5} />);
  }
  for (let y = 0; y < height; y += GRID_SIZE) {
    lines.push(<Line key={`h${y}`} points={[0, y, width, y]} stroke={COLORS.grid} strokeWidth={0.5} />);
  }
  return <>{lines}</>;
}

function RoomShape({ node, isSelected, result }: { node: ZoneNode; isSelected: boolean; result: SimulationResult | null }) {
  const { selectNode, updateNode, toolMode } = useAppStore();
  const isAmbient = node.type === 'ambient';

  const nodeResult = result?.nodes.find((r: { id: number }) => r.id === node.id);
  const pressureText = nodeResult ? `${nodeResult.pressure.toFixed(2)} Pa` : '';

  return (
    <Group
      x={node.x}
      y={node.y}
      draggable={toolMode === 'select'}
      onClick={() => { if (toolMode === 'select') selectNode(node.id); }}
      onTap={() => { if (toolMode === 'select') selectNode(node.id); }}
      onDragEnd={(e: KonvaEventObject<DragEvent>) => {
        const snappedX = Math.round(e.target.x() / GRID_SIZE) * GRID_SIZE;
        const snappedY = Math.round(e.target.y() / GRID_SIZE) * GRID_SIZE;
        updateNode(node.id, { x: snappedX, y: snappedY });
      }}
    >
      <Rect
        width={node.width}
        height={node.height}
        fill={isAmbient ? COLORS.ambient : (isSelected ? COLORS.roomSelected : COLORS.room)}
        stroke={isAmbient ? COLORS.ambientBorder : COLORS.roomBorder}
        strokeWidth={isSelected ? 2.5 : 1.5}
        cornerRadius={6}
        shadowColor="rgba(0,0,0,0.08)"
        shadowBlur={isSelected ? 12 : 4}
        shadowOffsetY={2}
      />
      <Text
        text={node.name}
        x={4}
        y={6}
        width={node.width - 8}
        fontSize={11}
        fontFamily="Inter, sans-serif"
        fontStyle="600"
        fill={isAmbient ? '#166534' : '#1e40af'}
        align="center"
      />
      <Text
        text={isAmbient ? `${(node.temperature - 273.15).toFixed(0)}°C` : `${node.volume}m³`}
        x={4}
        y={22}
        width={node.width - 8}
        fontSize={9}
        fontFamily="Inter, sans-serif"
        fill="#64748b"
        align="center"
      />
      {pressureText && (
        <Text
          text={pressureText}
          x={4}
          y={node.height - 18}
          width={node.width - 8}
          fontSize={10}
          fontFamily="Inter, sans-serif"
          fontStyle="bold"
          fill={COLORS.pressure}
          align="center"
        />
      )}
    </Group>
  );
}

const SCALE_MIN = 0.2;
const SCALE_MAX = 3.0;
const SCALE_STEP = 1.1;

export default function SketchPad() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const { nodes, links, selectedNodeId, toolMode, addNode, addLink, result, selectNode } = useAppStore();
  const [linkStart, setLinkStart] = useState<number | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition()!;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, direction > 0 ? oldScale * SCALE_STEP : oldScale / SCALE_STEP));
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    setStageScale(newScale);
    setStagePos(newPos);
  }, []);

  const getCanvasPoint = useCallback((pointerPos: { x: number; y: number }) => {
    return {
      x: (pointerPos.x - stagePos.x) / stageScale,
      y: (pointerPos.y - stagePos.y) / stageScale,
    };
  }, [stageScale, stagePos]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setSize({ width: containerRef.current.offsetWidth, height: containerRef.current.offsetHeight });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleStageClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (e.target === e.target.getStage()) {
      const pointerPos = e.target.getStage()!.getPointerPosition()!;
      const pos = getCanvasPoint(pointerPos);

      if (toolMode === 'addRoom') {
        addNode({
          type: 'normal',
          x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE - 60,
          y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE - 40,
        });
      } else if (toolMode === 'addAmbient') {
        addNode({
          type: 'ambient',
          name: '室外',
          temperature: 283.15,
          volume: 0,
          x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE - 60,
          y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE - 40,
        });
      } else if (toolMode === 'select') {
        selectNode(null);
      }
    }
  }, [toolMode, addNode, selectNode, getCanvasPoint]);

  const handleNodeClickForLink = useCallback((nodeId: number) => {
    if (toolMode !== 'addLink') return;
    if (linkStart === null) {
      setLinkStart(nodeId);
    } else if (linkStart !== nodeId) {
      const fromNode = nodes.find((n) => n.id === linkStart)!;
      const toNode = nodes.find((n) => n.id === nodeId)!;
      addLink({
        from: linkStart,
        to: nodeId,
        x: (fromNode.x + toNode.x) / 2,
        y: (fromNode.y + toNode.y) / 2,
      });
      setLinkStart(null);
    }
  }, [toolMode, linkStart, nodes, addLink]);

  const getNodeCenter = (id: number) => {
    const n = nodes.find((node) => node.id === id);
    if (!n) return { x: 0, y: 0 };
    return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
  };

  return (
    <div ref={containerRef} className="flex-1 bg-white relative overflow-hidden cursor-crosshair">
      {/* Status bar */}
      {toolMode !== 'select' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-full shadow-lg">
          {toolMode === 'addRoom' && '点击放置房间'}
          {toolMode === 'addAmbient' && '点击放置室外节点'}
          {toolMode === 'addLink' && (linkStart === null ? '点击第一个节点' : '点击第二个节点以创建连接')}
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-2 right-2 z-10 px-2 py-0.5 bg-white/80 border border-slate-200 rounded text-[10px] text-slate-500 select-none">
        {Math.round(stageScale * 100)}%
      </div>

      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        draggable={toolMode === 'select'}
        onWheel={handleWheel}
        onDragEnd={(e: KonvaEventObject<DragEvent>) => {
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onClick={handleStageClick}
      >
        <Layer>
          <GridLines width={size.width} height={size.height} />
        </Layer>

        <Layer>
          {/* Draw links as arrows */}
          {links.map((link) => {
            const from = getNodeCenter(link.from);
            const to = getNodeCenter(link.to);
            const isSelected = useAppStore.getState().selectedLinkId === link.id;
            const linkResult = result?.links.find((r) => r.id === link.id);
            const flowColor = linkResult
              ? (linkResult.massFlow > 0 ? COLORS.flowPositive : COLORS.flowNegative)
              : COLORS.link;

            const elemLabel: Record<string, string> = {
              PowerLawOrifice: '孔口',
              TwoWayFlow: '大开口',
              Fan: '风扇',
              Duct: '风管',
              Damper: '阀门',
              Filter: '过滤器',
              SelfRegulatingVent: '自调节',
              CheckValve: '单向阀',
            };
            const typeTag = elemLabel[link.element.type] ?? link.element.type;

            return (
              <Group key={`link-${link.id}`}>
                <Arrow
                  points={[from.x, from.y, to.x, to.y]}
                  stroke={isSelected ? COLORS.linkSelected : flowColor}
                  strokeWidth={isSelected ? 3 : 2}
                  pointerLength={8}
                  pointerWidth={6}
                  fill={isSelected ? COLORS.linkSelected : flowColor}
                  onClick={() => useAppStore.getState().selectLink(link.id)}
                  hitStrokeWidth={12}
                />
                <Text
                  x={(from.x + to.x) / 2 - 20}
                  y={(from.y + to.y) / 2 + (linkResult ? -22 : -8)}
                  text={typeTag}
                  fontSize={9}
                  fontFamily="Inter, sans-serif"
                  fill={isSelected ? COLORS.linkSelected : '#94a3b8'}
                  padding={1}
                />
                {linkResult && (
                  <Text
                    x={(from.x + to.x) / 2 - 30}
                    y={(from.y + to.y) / 2 - 10}
                    text={`${(linkResult.massFlow * 1000).toFixed(3)} g/s`}
                    fontSize={9}
                    fontFamily="Inter, sans-serif"
                    fontStyle="bold"
                    fill={flowColor}
                    padding={2}
                  />
                )}
              </Group>
            );
          })}

          {/* Draw link-in-progress */}
          {linkStart !== null && (
            <Circle
              x={getNodeCenter(linkStart).x}
              y={getNodeCenter(linkStart).y}
              radius={8}
              fill="transparent"
              stroke={COLORS.linkSelected}
              strokeWidth={2}
              dash={[4, 4]}
            />
          )}

          {/* Draw nodes */}
          {nodes.map((node) => (
            <Group key={`node-${node.id}`} onClick={() => handleNodeClickForLink(node.id)}>
              <RoomShape
                node={node}
                isSelected={selectedNodeId === node.id}
                result={result}
              />
            </Group>
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
