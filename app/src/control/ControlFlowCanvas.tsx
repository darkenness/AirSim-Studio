import { useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore } from '../store/useAppStore';
import { SensorNode } from './nodes/SensorNode';
import { PIControllerNode } from './nodes/PIControllerNode';
import { ActuatorNode } from './nodes/ActuatorNode';
import { MathNode } from './nodes/MathNode';
import { LogicNode } from './nodes/LogicNode';

// Register custom node types
const nodeTypes = {
  sensor: SensorNode,
  controller: PIControllerNode,
  actuator: ActuatorNode,
  math: MathNode,
  logic: LogicNode,
};

// Cycle detection: DFS from target to see if we can reach source
function wouldCreateCycle(source: string, target: string, edges: Edge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  // Check if there's a path from target → source (which would form a cycle)
  const visited = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === source) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of adj.get(node) ?? []) {
      stack.push(next);
    }
  }
  return false;
}

// Connection validation: enforce DAG rules
function isValidConnection(connection: Edge | Connection, existingEdges: Edge[]): boolean {
  // Prevent self-connections
  if (connection.source === connection.target) return false;
  if (!connection.source || !connection.target) return false;
  // Prevent cycles
  if (wouldCreateCycle(connection.source, connection.target, existingEdges)) return false;
  return true;
}

// Convert control system data to React Flow nodes/edges
function controlSystemToFlow(controlSystem: ReturnType<typeof useAppStore.getState>['controlSystem']): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let y = 50;

  // Sensors
  controlSystem.sensors.forEach((s, i) => {
    nodes.push({
      id: `sensor-${s.id}`,
      type: 'sensor',
      position: { x: 50, y: y + i * 120 },
      data: { label: s.name, sensorType: s.type, targetId: s.targetId, speciesIdx: s.speciesIdx },
    });
  });

  // Controllers
  controlSystem.controllers.forEach((c, i) => {
    nodes.push({
      id: `ctrl-${c.id}`,
      type: 'controller',
      position: { x: 350, y: y + i * 150 },
      data: { label: c.name, Kp: c.Kp, Ki: c.Ki, setpoint: c.setpoint, deadband: c.deadband },
    });

    // Edge: sensor → controller
    const sensorId = controlSystem.sensors.find(s => s.id === c.sensorId);
    if (sensorId) {
      edges.push({
        id: `e-sensor${c.sensorId}-ctrl${c.id}`,
        source: `sensor-${c.sensorId}`,
        target: `ctrl-${c.id}`,
        targetHandle: 'input1',
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#3b82f6' },
      });
    }
  });

  // Actuators
  controlSystem.actuators.forEach((a, i) => {
    nodes.push({
      id: `act-${a.id}`,
      type: 'actuator',
      position: { x: 650, y: y + i * 120 },
      data: { label: a.name, actuatorType: a.type, linkIdx: a.linkIdx },
    });

    // Edge: controller → actuator
    const ctrl = controlSystem.controllers.find(c => c.actuatorId === a.id);
    if (ctrl) {
      edges.push({
        id: `e-ctrl${ctrl.id}-act${a.id}`,
        source: `ctrl-${ctrl.id}`,
        target: `act-${a.id}`,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#10b981' },
      });
    }
  });

  return { nodes, edges };
}

/** Write React Flow graph state back to the app store's controlSystem */
function flowToControlSystem(
  nodes: Node[],
  edges: Edge[],
  prevCS: ReturnType<typeof useAppStore.getState>['controlSystem'],
): ReturnType<typeof useAppStore.getState>['controlSystem'] {
  // Rebuild sensors with updated positions
  const sensors = prevCS.sensors.map(s => {
    const n = nodes.find(nd => nd.id === `sensor-${s.id}`);
    return n ? { ...s, x: n.position.x, y: n.position.y } : s;
  });

  // Rebuild controllers — update positions + sensorId/actuatorId from edges
  const controllers = prevCS.controllers.map(c => {
    const n = nodes.find(nd => nd.id === `ctrl-${c.id}`);
    // Find sensor→controller edge
    const inEdge = edges.find(e => e.target === `ctrl-${c.id}` && e.source.startsWith('sensor-'));
    const sensorId = inEdge ? parseInt(inEdge.source.replace('sensor-', ''), 10) : c.sensorId;
    // Find controller→actuator edge
    const outEdge = edges.find(e => e.source === `ctrl-${c.id}` && e.target.startsWith('act-'));
    const actuatorId = outEdge ? parseInt(outEdge.target.replace('act-', ''), 10) : c.actuatorId;
    return {
      ...c,
      sensorId,
      actuatorId,
      ...(n ? { x: n.position.x, y: n.position.y } : {}),
    };
  });

  // Rebuild actuators with updated positions
  const actuators = prevCS.actuators.map(a => {
    const n = nodes.find(nd => nd.id === `act-${a.id}`);
    return n ? { ...a, x: n.position.x, y: n.position.y } : a;
  });

  return { sensors, controllers, actuators };
}

export default function ControlFlowCanvas() {
  const controlSystem = useAppStore(s => s.controlSystem);
  const setControlSystem = useAppStore(s => s.setControlSystem);
  const initial = useMemo(() => controlSystemToFlow(controlSystem), [controlSystem]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  // Track whether changes originated from store (avoid feedback loop)
  const syncingFromStore = useRef(false);

  // Sync store → local when controlSystem changes externally
  useEffect(() => {
    syncingFromStore.current = true;
    const { nodes: newNodes, edges: newEdges } = controlSystemToFlow(controlSystem);
    setNodes(newNodes);
    setEdges(newEdges);
    // Reset flag after React processes the state update
    requestAnimationFrame(() => { syncingFromStore.current = false; });
  }, [controlSystem, setNodes, setEdges]);

  // Write back to store on node position changes
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
  }, [onNodesChange]);

  // Write back on edge changes
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
  }, [onEdgesChange]);

  // Debounced write-back: sync local state → store
  const writeBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (syncingFromStore.current) return;
    if (writeBackTimer.current) clearTimeout(writeBackTimer.current);
    writeBackTimer.current = setTimeout(() => {
      const newCS = flowToControlSystem(nodes, edges, controlSystem);
      // Only update if something actually changed
      const prev = controlSystem;
      const posChanged = prev.sensors.some((s, i) => {
        const ns = newCS.sensors[i];
        return ns && ((s as any).x !== (ns as any).x || (s as any).y !== (ns as any).y);
      }) || prev.controllers.some((c, i) => {
        const nc = newCS.controllers[i];
        return nc && (c.sensorId !== nc.sensorId || c.actuatorId !== nc.actuatorId || (c as any).x !== (nc as any).x || (c as any).y !== (nc as any).y);
      });
      if (posChanged) {
        syncingFromStore.current = true;
        setControlSystem(newCS);
        requestAnimationFrame(() => { syncingFromStore.current = false; });
      }
    }, 300);
    return () => { if (writeBackTimer.current) clearTimeout(writeBackTimer.current); };
  }, [nodes, edges, controlSystem, setControlSystem]);

  const onConnect = useCallback((params: Connection) => {
    if (!isValidConnection(params, edges)) return;
    setEdges((eds) => {
      const newEdges = addEdge({
        ...params,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      }, eds);
      return newEdges;
    });
  }, [setEdges, edges]);

  const checkConnection = useCallback((conn: Edge | Connection) => {
    return isValidConnection(conn, edges);
  }, [edges]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        isValidConnection={checkConnection}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{
          animated: true,
          style: { strokeWidth: 2 },
        }}
      >
        <Controls position="bottom-left" />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === 'sensor') return '#3b82f6';
            if (n.type === 'controller') return '#8b5cf6';
            if (n.type === 'actuator') return '#10b981';
            return '#94a3b8';
          }}
          position="bottom-right"
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
      </ReactFlow>
    </div>
  );
}
