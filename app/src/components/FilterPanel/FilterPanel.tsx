import { useAppStore } from '../../store/useAppStore';
import { Plus, Trash2, Filter, Layers } from 'lucide-react';
import type { FilterConfig, LoadingPoint } from '../../types';
import { InputField } from '../ui/input-field';
import { EmptyState } from '../ui/empty-state';

function LoadingTableEditor({ points, onChange }: {
  points: LoadingPoint[];
  onChange: (pts: LoadingPoint[]) => void;
}) {
  const addPoint = () => {
    onChange([...points, { loading: 0, efficiency: 0.9 }]);
  };

  const removePoint = (idx: number) => {
    onChange(points.filter((_, i) => i !== idx));
  };

  const updatePoint = (idx: number, patch: Partial<LoadingPoint>) => {
    onChange(points.map((p, i) => i === idx ? { ...p, ...patch } : p));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">负载-效率曲线</span>
        <button onClick={addPoint} className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground">
          <Plus size={12} />
        </button>
      </div>
      {points.map((pt, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="number"
            value={pt.loading}
            step="0.01"
            onChange={(e) => updatePoint(i, { loading: parseFloat(e.target.value) || 0 })}
            className="flex-1 px-1 py-0.5 text-[11px] border border-border rounded bg-background"
            placeholder="负载 (kg)"
          />
          <input
            type="number"
            value={pt.efficiency}
            step="0.01"
            min="0"
            max="1"
            onChange={(e) => updatePoint(i, { efficiency: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
            className="w-16 px-1 py-0.5 text-[11px] border border-border rounded bg-background text-right"
            placeholder="效率"
          />
          <button onClick={() => removePoint(i)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      {points.length === 0 && (
        <span className="text-[11px] text-muted-foreground italic">无数据点</span>
      )}
    </div>
  );
}

function ArrayEditor({ label, values, onChange, placeholder }: {
  label: string;
  values: number[];
  onChange: (vals: number[]) => void;
  placeholder?: string;
}) {
  const handleChange = (idx: number, val: number) => {
    const newVals = [...values];
    newVals[idx] = val;
    onChange(newVals);
  };

  const addValue = () => {
    onChange([...values, 0]);
  };

  const removeValue = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        <button onClick={addValue} className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground">
          <Plus size={12} />
        </button>
      </div>
      {values.map((val, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="number"
            value={val}
            step="0.001"
            onChange={(e) => handleChange(i, parseFloat(e.target.value) || 0)}
            className="flex-1 px-1 py-0.5 text-[11px] border border-border rounded bg-background"
            placeholder={placeholder}
          />
          <button onClick={() => removeValue(i)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
            <Trash2 size={11} />
          </button>
        </div>
      ))}
      {values.length === 0 && (
        <span className="text-[11px] text-muted-foreground italic">无系数</span>
      )}
    </div>
  );
}

function SimpleGaseousFilterCard({ filter }: { filter: FilterConfig }) {
  const { updateFilterConfig, removeFilterConfig } = useAppStore();
  if (filter.type !== 'SimpleGaseousFilter') return null;

  return (
    <div className="flex flex-col gap-2.5 p-4 border border-border rounded-lg">
      <div className="flex items-center gap-2">
        <Filter size={13} className="text-blue-500" />
        <input
          value={filter.name}
          onChange={(e) => updateFilterConfig(filter.id, { name: e.target.value })}
          className="flex-1 px-1.5 py-0.5 text-xs font-semibold border border-transparent hover:border-border rounded bg-transparent focus:outline-none focus:border-ring"
        />
        <button
          onClick={() => removeFilterConfig(filter.id)}
          className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <InputField label="流动系数 C" value={filter.flowCoefficient} type="number" step="0.0001"
          onChange={(v) => updateFilterConfig(filter.id, { flowCoefficient: Math.max(0.0001, parseFloat(v) || 0) })} />
        <InputField label="流动指数 n" value={filter.flowExponent} type="number" step="0.01"
          onChange={(v) => updateFilterConfig(filter.id, { flowExponent: Math.max(0.5, Math.min(1.0, parseFloat(v) || 0)) })} />
      </div>

      <InputField label="突破阈值" value={filter.breakthroughThreshold} type="number" step="0.01"
        onChange={(v) => updateFilterConfig(filter.id, { breakthroughThreshold: Math.max(0, Math.min(1, parseFloat(v) || 0)) })} />

      <LoadingTableEditor
        points={filter.loadingTable}
        onChange={(pts) => updateFilterConfig(filter.id, { loadingTable: pts })}
      />
    </div>
  );
}

function UVGIFilterCard({ filter }: { filter: FilterConfig }) {
  const { updateFilterConfig, removeFilterConfig } = useAppStore();
  if (filter.type !== 'UVGIFilter') return null;

  return (
    <div className="flex flex-col gap-2.5 p-4 border border-border rounded-lg">
      <div className="flex items-center gap-2">
        <Filter size={13} className="text-purple-500" />
        <input
          value={filter.name}
          onChange={(e) => updateFilterConfig(filter.id, { name: e.target.value })}
          className="flex-1 px-1.5 py-0.5 text-xs font-semibold border border-transparent hover:border-border rounded bg-transparent focus:outline-none focus:border-ring"
        />
        <button
          onClick={() => removeFilterConfig(filter.id)}
          className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <InputField label="流动系数 C" value={filter.flowCoefficient} type="number" step="0.0001"
          onChange={(v) => updateFilterConfig(filter.id, { flowCoefficient: Math.max(0.0001, parseFloat(v) || 0) })} />
        <InputField label="流动指数 n" value={filter.flowExponent} type="number" step="0.01"
          onChange={(v) => updateFilterConfig(filter.id, { flowExponent: Math.max(0.5, Math.min(1.0, parseFloat(v) || 0)) })} />
        <InputField label="敏感系数 k" value={filter.susceptibility} unit="m²/J" type="number" step="0.001"
          onChange={(v) => updateFilterConfig(filter.id, { susceptibility: Math.max(0, parseFloat(v) || 0) })} />
        <InputField label="辐照度" value={filter.irradiance} unit="W/m²" type="number" step="1"
          onChange={(v) => updateFilterConfig(filter.id, { irradiance: Math.max(0, parseFloat(v) || 0) })} />
        <InputField label="腔体体积" value={filter.chamberVolume} unit="m³" type="number" step="0.01"
          onChange={(v) => updateFilterConfig(filter.id, { chamberVolume: Math.max(0.001, parseFloat(v) || 0) })} />
        <InputField label="老化率" value={filter.agingRate} unit="1/h" type="number" step="0.0001"
          onChange={(v) => updateFilterConfig(filter.id, { agingRate: Math.max(0, parseFloat(v) || 0) })} />
      </div>

      <InputField label="灯管使用时长" value={filter.lampAgeHours} unit="h" type="number" step="1"
        onChange={(v) => updateFilterConfig(filter.id, { lampAgeHours: Math.max(0, parseFloat(v) || 0) })} />

      <ArrayEditor
        label="温度系数 [a0, a1, a2, a3]"
        values={filter.tempCoeffs}
        onChange={(vals) => updateFilterConfig(filter.id, { tempCoeffs: vals })}
        placeholder="系数"
      />

      <ArrayEditor
        label="流量系数 [b0, b1, b2]"
        values={filter.flowCoeffs}
        onChange={(vals) => updateFilterConfig(filter.id, { flowCoeffs: vals })}
        placeholder="系数"
      />
    </div>
  );
}

function SuperFilterCard({ filter }: { filter: FilterConfig }) {
  const { updateFilterConfig, removeFilterConfig, filterConfigs } = useAppStore();
  if (filter.type !== 'SuperFilter') return null;

  const addStage = () => {
    const firstFilter = filterConfigs.find(f => f.id !== filter.id);
    if (!firstFilter) return;
    updateFilterConfig(filter.id, {
      stages: [...filter.stages, { filterType: firstFilter.type as 'SimpleGaseousFilter' | 'UVGIFilter' | 'Filter', filterId: firstFilter.id }]
    });
  };

  const removeStage = (idx: number) => {
    updateFilterConfig(filter.id, {
      stages: filter.stages.filter((_, i) => i !== idx)
    });
  };

  const updateStage = (idx: number, filterId: number) => {
    const targetFilter = filterConfigs.find(f => f.id === filterId);
    if (!targetFilter) return;
    const newStages = [...filter.stages];
    newStages[idx] = { filterType: targetFilter.type as 'SimpleGaseousFilter' | 'UVGIFilter' | 'Filter', filterId };
    updateFilterConfig(filter.id, { stages: newStages });
  };

  return (
    <div className="flex flex-col gap-2.5 p-4 border border-border rounded-lg">
      <div className="flex items-center gap-2">
        <Layers size={13} className="text-emerald-500" />
        <input
          value={filter.name}
          onChange={(e) => updateFilterConfig(filter.id, { name: e.target.value })}
          className="flex-1 px-1.5 py-0.5 text-xs font-semibold border border-transparent hover:border-border rounded bg-transparent focus:outline-none focus:border-ring"
        />
        <button
          onClick={() => removeFilterConfig(filter.id)}
          className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <InputField label="负载衰减率" value={filter.loadingDecayRate} type="number" step="0.01"
        onChange={(v) => updateFilterConfig(filter.id, { loadingDecayRate: Math.max(0, parseFloat(v) || 0) })} />

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">级联阶段</span>
          <button onClick={addStage} className="ml-auto p-0.5 rounded hover:bg-accent text-muted-foreground">
            <Plus size={12} />
          </button>
        </div>
        {filter.stages.map((stage, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground w-8">#{i + 1}</span>
            <select
              value={stage.filterId}
              onChange={(e) => updateStage(i, parseInt(e.target.value))}
              className="flex-1 px-1 py-0.5 text-[11px] border border-border rounded bg-background"
            >
              {filterConfigs.filter(f => f.id !== filter.id).map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button onClick={() => removeStage(i)} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {filter.stages.length === 0 && (
          <span className="text-[11px] text-muted-foreground italic">无阶段</span>
        )}
      </div>
    </div>
  );
}

export default function FilterPanel() {
  const { filterConfigs, addFilterConfig } = useAppStore();

  const handleAdd = (type: 'SimpleGaseousFilter' | 'UVGIFilter' | 'SuperFilter') => {
    const nextId = filterConfigs.length > 0 ? Math.max(...filterConfigs.map(f => f.id)) + 1 : 0;

    if (type === 'SimpleGaseousFilter') {
      addFilterConfig({
        id: nextId,
        name: `气体过滤器 ${nextId + 1}`,
        type: 'SimpleGaseousFilter',
        flowCoefficient: 0.002,
        flowExponent: 0.65,
        loadingTable: [],
        breakthroughThreshold: 0.05,
      });
    } else if (type === 'UVGIFilter') {
      addFilterConfig({
        id: nextId,
        name: `UVGI过滤器 ${nextId + 1}`,
        type: 'UVGIFilter',
        flowCoefficient: 0.002,
        flowExponent: 0.65,
        susceptibility: 0.1,
        irradiance: 10,
        chamberVolume: 0.5,
        tempCoeffs: [1.0, 0, 0, 0],
        flowCoeffs: [1.0, 0, 0],
        agingRate: 0.0001,
        lampAgeHours: 0,
      });
    } else {
      addFilterConfig({
        id: nextId,
        name: `超级过滤器 ${nextId + 1}`,
        type: 'SuperFilter',
        stages: [],
        loadingDecayRate: 0.1,
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-blue-500" />
        <span className="text-xs font-bold text-foreground">过滤器配置</span>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() => handleAdd('SimpleGaseousFilter')}
            className="px-2.5 py-1 text-xs font-medium bg-background hover:bg-accent text-foreground rounded-md border border-border transition-colors"
            title="添加气体过滤器"
          >
            + 气体
          </button>
          <button
            onClick={() => handleAdd('UVGIFilter')}
            className="px-2.5 py-1 text-xs font-medium bg-background hover:bg-accent text-foreground rounded-md border border-border transition-colors"
            title="添加UVGI过滤器"
          >
            + UVGI
          </button>
          <button
            onClick={() => handleAdd('SuperFilter')}
            className="px-2.5 py-1 text-xs font-medium bg-background hover:bg-accent text-foreground rounded-md border border-border transition-colors"
            title="添加超级过滤器"
          >
            + 超级
          </button>
        </div>
      </div>

      {filterConfigs.length === 0 && (
        <EmptyState icon={Filter} message="尚未添加过滤器" />
      )}

      {filterConfigs.map((filter) => {
        if (filter.type === 'SimpleGaseousFilter') return <SimpleGaseousFilterCard key={filter.id} filter={filter} />;
        if (filter.type === 'UVGIFilter') return <UVGIFilterCard key={filter.id} filter={filter} />;
        if (filter.type === 'SuperFilter') return <SuperFilterCard key={filter.id} filter={filter} />;
        return null;
      })}
    </div>
  );
}
