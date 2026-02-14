import { Handle, Position, type NodeProps } from '@xyflow/react';

interface LogicNodeData {
  label: string;
  logicType: 'AND' | 'OR' | 'XOR' | 'NOT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'EXP' | 'LN' | 'ABS' | 'MUL' | 'DIV' | 'INT' | 'MAVG';
  [key: string]: unknown;
}

const LOGIC_COLORS: Record<string, { bg: string; border: string; text: string; handle: string }> = {
  AND:  { bg: 'bg-indigo-50',  border: 'border-indigo-300', text: 'text-indigo-700', handle: '!bg-indigo-500' },
  OR:   { bg: 'bg-indigo-50',  border: 'border-indigo-300', text: 'text-indigo-700', handle: '!bg-indigo-500' },
  XOR:  { bg: 'bg-indigo-50',  border: 'border-indigo-300', text: 'text-indigo-700', handle: '!bg-indigo-500' },
  NOT:  { bg: 'bg-indigo-50',  border: 'border-indigo-300', text: 'text-indigo-700', handle: '!bg-indigo-500' },
  SUM:  { bg: 'bg-teal-50',    border: 'border-teal-300',   text: 'text-teal-700',   handle: '!bg-teal-500' },
  AVG:  { bg: 'bg-teal-50',    border: 'border-teal-300',   text: 'text-teal-700',   handle: '!bg-teal-500' },
  MIN:  { bg: 'bg-teal-50',    border: 'border-teal-300',   text: 'text-teal-700',   handle: '!bg-teal-500' },
  MAX:  { bg: 'bg-teal-50',    border: 'border-teal-300',   text: 'text-teal-700',   handle: '!bg-teal-500' },
  EXP:  { bg: 'bg-rose-50',    border: 'border-rose-300',   text: 'text-rose-700',   handle: '!bg-rose-500' },
  LN:   { bg: 'bg-rose-50',    border: 'border-rose-300',   text: 'text-rose-700',   handle: '!bg-rose-500' },
  ABS:  { bg: 'bg-rose-50',    border: 'border-rose-300',   text: 'text-rose-700',   handle: '!bg-rose-500' },
  MUL:  { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-700',  handle: '!bg-amber-500' },
  DIV:  { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-700',  handle: '!bg-amber-500' },
  INT:  { bg: 'bg-cyan-50',    border: 'border-cyan-300',   text: 'text-cyan-700',   handle: '!bg-cyan-500' },
  MAVG: { bg: 'bg-cyan-50',    border: 'border-cyan-300',   text: 'text-cyan-700',   handle: '!bg-cyan-500' },
};

const LOGIC_SYMBOLS: Record<string, string> = {
  AND: '∧', OR: '∨', XOR: '⊕', NOT: '¬',
  SUM: 'Σ', AVG: 'x̄', MIN: '↓', MAX: '↑',
  EXP: 'eˣ', LN: 'ln', ABS: '|x|',
  MUL: '×', DIV: '÷',
  INT: '∫', MAVG: 'MA',
};

// Nodes that accept multiple inputs
const MULTI_INPUT = new Set(['AND', 'OR', 'XOR', 'SUM', 'AVG', 'MIN', 'MAX', 'MUL']);
// Nodes that need exactly 2 inputs
const DUAL_INPUT = new Set(['DIV']);

export function LogicNode({ data, selected }: NodeProps) {
  const d = data as LogicNodeData;
  const colors = LOGIC_COLORS[d.logicType] ?? LOGIC_COLORS.AND;
  const symbol = LOGIC_SYMBOLS[d.logicType] ?? '?';
  const isMulti = MULTI_INPUT.has(d.logicType);
  const isDual = DUAL_INPUT.has(d.logicType);

  return (
    <div className={`px-3 py-2 rounded-lg border-2 min-w-[80px] ${colors.bg} ${
      selected ? `${colors.border} shadow-lg ring-2 ring-offset-1` : colors.border
    }`}>
      {/* Input handles */}
      {isDual ? (
        <>
          <Handle type="target" position={Position.Left} id="input1" className={`${colors.handle} !w-3 !h-3`} style={{ top: '30%' }} />
          <Handle type="target" position={Position.Left} id="input2" className={`${colors.handle} !w-3 !h-3`} style={{ top: '70%' }} />
        </>
      ) : isMulti ? (
        <>
          <Handle type="target" position={Position.Left} id="input1" className={`${colors.handle} !w-3 !h-3`} style={{ top: '25%' }} />
          <Handle type="target" position={Position.Left} id="input2" className={`${colors.handle} !w-2.5 !h-2.5`} style={{ top: '50%' }} />
          <Handle type="target" position={Position.Left} id="input3" className={`${colors.handle} !w-2.5 !h-2.5`} style={{ top: '75%' }} />
        </>
      ) : (
        <Handle type="target" position={Position.Left} id="input1" className={`${colors.handle} !w-3 !h-3`} />
      )}

      {/* Output handle */}
      <Handle type="source" position={Position.Right} id="output" className={`${colors.handle} !w-3 !h-3`} />

      <div className="text-center">
        <span className={`text-lg font-bold ${colors.text}`}>{symbol}</span>
        <div className={`text-[9px] ${colors.text} opacity-70`}>{d.label || d.logicType}</div>
      </div>
    </div>
  );
}
