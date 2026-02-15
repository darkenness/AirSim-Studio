import { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { saveFile, openFile } from '../../utils/fileOps';
import { toast } from '../../hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import {
  Search, Download, Upload, Eye, Wind, Fan, Filter, Clock,
  Check, Package, Trash2,
} from 'lucide-react';
import type {
  FlowElementDef, FilterConfig, Schedule,
} from '../../types';

// ── Library data types ──────────────────────────────────────────────

type LibraryCategory = 'airflow' | 'fan' | 'filter' | 'schedule';

interface LibraryAirflowItem {
  id: string;
  name: string;
  element: FlowElementDef;
}

interface LibraryFanItem {
  id: string;
  name: string;
  element: FlowElementDef; // type === 'Fan'
}

interface LibraryFilterItem {
  id: string;
  name: string;
  filter: FilterConfig;
}

interface LibraryScheduleItem {
  id: string;
  name: string;
  schedule: Schedule;
}

type LibraryItem = LibraryAirflowItem | LibraryFanItem | LibraryFilterItem | LibraryScheduleItem;

interface LibraryData {
  version: 1;
  category: LibraryCategory;
  items: LibraryItem[];
}

const CATEGORY_META: Record<LibraryCategory, { label: string; icon: typeof Wind }> = {
  airflow:  { label: '气流元件', icon: Wind },
  fan:      { label: '风机曲线', icon: Fan },
  filter:   { label: '过滤器',   icon: Filter },
  schedule: { label: '日程表',   icon: Clock },
};

const FLOW_TYPE_LABELS: Record<string, string> = {
  PowerLawOrifice: '幂律孔口', TwoWayFlow: '大开口', Fan: '风机',
  Duct: '风管', Damper: '风阀', Filter: '过滤器',
  SelfRegulatingVent: '自调节通风口', CheckValve: '单向阀',
  SupplyDiffuser: '送风口', ReturnGrille: '回风口',
};

// ── Helpers ─────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function extractAirflowItems(links: { id: number; element: FlowElementDef }[]): LibraryAirflowItem[] {
  return links
    .filter(l => l.element.type !== 'Fan')
    .map(l => ({
      id: uid(),
      name: `${FLOW_TYPE_LABELS[l.element.type] ?? l.element.type} #${l.id}`,
      element: { ...l.element },
    }));
}

function extractFanItems(links: { id: number; element: FlowElementDef }[]): LibraryFanItem[] {
  return links
    .filter(l => l.element.type === 'Fan')
    .map(l => ({
      id: uid(),
      name: `风机 #${l.id}`,
      element: { ...l.element },
    }));
}

function extractFilterItems(filters: FilterConfig[]): LibraryFilterItem[] {
  return filters.map(f => ({
    id: uid(),
    name: f.name,
    filter: { ...f },
  }));
}

function extractScheduleItems(schedules: Schedule[]): LibraryScheduleItem[] {
  return schedules.map(s => ({
    id: uid(),
    name: s.name,
    schedule: { ...s },
  }));
}

// ── Detail preview ──────────────────────────────────────────────────

function DetailKV({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{String(value)}</span>
    </div>
  );
}

function ItemPreview({ item, category }: { item: LibraryItem; category: LibraryCategory }) {
  if (category === 'airflow' || category === 'fan') {
    const el = (item as LibraryAirflowItem).element;
    return (
      <div className="flex flex-col gap-1 p-2 bg-muted rounded-lg">
        <DetailKV label="类型" value={FLOW_TYPE_LABELS[el.type] ?? el.type} />
        {el.C != null && <DetailKV label="流动系数 C" value={el.C} />}
        {el.n != null && <DetailKV label="流动指数 n" value={el.n} />}
        {el.maxFlow != null && <DetailKV label="最大风量" value={`${el.maxFlow} m\u00B3/s`} />}
        {el.shutoffPressure != null && <DetailKV label="全压截止" value={`${el.shutoffPressure} Pa`} />}
        {el.Cd != null && <DetailKV label="流量系数 Cd" value={el.Cd} />}
        {el.area != null && <DetailKV label="开口面积" value={`${el.area} m\u00B2`} />}
        {el.length != null && <DetailKV label="管道长度" value={`${el.length} m`} />}
        {el.diameter != null && <DetailKV label="水力直径" value={`${el.diameter} m`} />}
        {el.efficiency != null && <DetailKV label="去除效率" value={el.efficiency} />}
        {el.targetFlow != null && <DetailKV label="目标流量" value={`${el.targetFlow} m\u00B3/s`} />}
        {el.fraction != null && <DetailKV label="开度" value={el.fraction} />}
        {el.Cmax != null && <DetailKV label="Cmax" value={el.Cmax} />}
        {el.coeffs && el.coeffs.length > 0 && <DetailKV label="多项式系数" value={el.coeffs.join(', ')} />}
      </div>
    );
  }

  if (category === 'filter') {
    const fc = (item as LibraryFilterItem).filter;
    return (
      <div className="flex flex-col gap-1 p-2 bg-muted rounded-lg">
        <DetailKV label="类型" value={fc.type} />
        {'flowCoefficient' in fc && <DetailKV label="流动系数" value={(fc as { flowCoefficient: number }).flowCoefficient} />}
        {'flowExponent' in fc && <DetailKV label="流动指数" value={(fc as { flowExponent: number }).flowExponent} />}
        {fc.type === 'SimpleGaseousFilter' && <DetailKV label="负载点数" value={fc.loadingTable.length} />}
        {fc.type === 'UVGIFilter' && <DetailKV label="辐照度" value={`${fc.irradiance} W/m\u00B2`} />}
        {fc.type === 'SuperFilter' && <DetailKV label="级联阶段" value={fc.stages.length} />}
      </div>
    );
  }

  if (category === 'schedule') {
    const sch = (item as LibraryScheduleItem).schedule;
    return (
      <div className="flex flex-col gap-1 p-2 bg-muted rounded-lg">
        <DetailKV label="数据点数" value={sch.points.length} />
        {sch.points.length > 0 && (
          <>
            <DetailKV label="起始时间" value={`${sch.points[0].time} s`} />
            <DetailKV label="结束时间" value={`${sch.points[sch.points.length - 1].time} s`} />
          </>
        )}
      </div>
    );
  }

  return null;
}

// ── Item card ───────────────────────────────────────────────────────

function LibraryItemCard({
  item, category, selected, onToggle, onPreview,
}: {
  item: LibraryItem;
  category: LibraryCategory;
  selected: boolean;
  onToggle: () => void;
  onPreview: () => void;
}) {
  const Icon = CATEGORY_META[category].icon;
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 bg-card'
      }`}
      onClick={onToggle}
    >
      <div className={`p-1 rounded ${selected ? 'bg-primary/10' : 'bg-muted'}`}>
        {selected ? <Check size={13} className="text-primary" /> : <Icon size={13} className="text-muted-foreground" />}
      </div>
      <span className="flex-1 text-xs text-foreground truncate">{item.name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onPreview(); }}
        className="p-1 rounded hover:bg-accent text-muted-foreground"
        title="预览详情"
      >
        <Eye size={12} />
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function LibraryManager() {
  const {
    links, filterConfigs, schedules,
    addLink, addFilterConfig, addSchedule,
  } = useAppStore();
  const nextId = useAppStore(s => s.nextId);

  const [category, setCategory] = useState<LibraryCategory>('airflow');
  const [search, setSearch] = useState('');
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [mode, setMode] = useState<'export' | 'import'>('export');

  // Items from current project for export
  const projectItems = useMemo((): LibraryItem[] => {
    switch (category) {
      case 'airflow': return extractAirflowItems(links);
      case 'fan': return extractFanItems(links);
      case 'filter': return extractFilterItems(filterConfigs);
      case 'schedule': return extractScheduleItems(schedules);
    }
  }, [category, links, filterConfigs, schedules]);

  const displayItems = mode === 'export' ? projectItems : libraryItems;

  const filteredItems = useMemo(() => {
    if (!search.trim()) return displayItems;
    const q = search.toLowerCase();
    return displayItems.filter(it => it.name.toLowerCase().includes(q));
  }, [displayItems, search]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredItems.map(it => it.id)));
  }, [filteredItems]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Reset selection when switching category or mode
  const handleCategoryChange = (val: string) => {
    setCategory(val as LibraryCategory);
    setSelectedIds(new Set());
    setSearch('');
    setPreviewItem(null);
    if (mode === 'import') setLibraryItems([]);
  };

  const handleModeSwitch = (newMode: 'export' | 'import') => {
    setMode(newMode);
    setSelectedIds(new Set());
    setSearch('');
    setPreviewItem(null);
    if (newMode === 'export') setLibraryItems([]);
  };

  // ── Export ──────────────────────────────────────────────────────

  const handleExport = async () => {
    const selected = displayItems.filter(it => selectedIds.has(it.id));
    if (selected.length === 0) {
      toast({ title: '未选择项目', description: '请先勾选要导出的项目', variant: 'destructive' });
      return;
    }
    const data: LibraryData = {
      version: 1,
      category,
      items: selected,
    };
    const json = JSON.stringify(data, null, 2);
    const catLabel = CATEGORY_META[category].label;
    const saved = await saveFile(json, `library_${category}.json`, [
      { name: `CONTAM 库文件 (${catLabel})`, extensions: ['json'] },
    ]);
    if (saved) {
      toast({ title: '导出成功', description: `${selected.length} 个${catLabel}已导出` });
    }
  };

  // ── Import (load file) ─────────────────────────────────────────

  const handleLoadFile = async () => {
    const result = await openFile([
      { name: 'CONTAM 库文件', extensions: ['json'] },
    ]);
    if (!result) return;
    try {
      const data: LibraryData = JSON.parse(result.content);
      if (data.version !== 1 || !data.items || !Array.isArray(data.items)) {
        toast({ title: '文件格式错误', description: '不是有效的 CONTAM 库文件', variant: 'destructive' });
        return;
      }
      // Auto-switch to matching category
      if (data.category && data.category !== category) {
        setCategory(data.category);
      }
      setLibraryItems(data.items);
      setSelectedIds(new Set());
      toast({ title: '已加载库文件', description: `${data.items.length} 个项目 (${CATEGORY_META[data.category]?.label ?? data.category})` });
    } catch {
      toast({ title: '文件解析失败', variant: 'destructive' });
    }
  };

  // ── Import (apply to project) ──────────────────────────────────

  const handleImport = () => {
    const selected = libraryItems.filter(it => selectedIds.has(it.id));
    if (selected.length === 0) {
      toast({ title: '未选择项目', description: '请先勾选要导入的项目', variant: 'destructive' });
      return;
    }

    let count = 0;
    let currentNextId = nextId;

    for (const item of selected) {
      if (category === 'airflow' || category === 'fan') {
        const el = (item as LibraryAirflowItem).element;
        // Create a link with this element (from=0, to=0 as placeholder — user must reconnect)
        addLink({
          from: 0,
          to: 0,
          elevation: 1.5,
          element: { ...el },
          x: 200 + count * 30,
          y: 200 + count * 30,
        });
        currentNextId++;
        count++;
      } else if (category === 'filter') {
        const fc = (item as LibraryFilterItem).filter;
        const newId = filterConfigs.length > 0 ? Math.max(...filterConfigs.map(f => f.id)) + 1 + count : count;
        addFilterConfig({ ...fc, id: newId });
        count++;
      } else if (category === 'schedule') {
        const sch = (item as LibraryScheduleItem).schedule;
        const newId = schedules.length > 0 ? Math.max(...schedules.map(s => s.id)) + 1 + count : count;
        addSchedule({ ...sch, id: newId });
        count++;
      }
    }

    const catLabel = CATEGORY_META[category].label;
    toast({ title: '导入成功', description: `${count} 个${catLabel}已导入到当前项目` });
    setSelectedIds(new Set());
  };

  // ── Remove from library list ───────────────────────────────────

  const handleRemoveFromLibrary = () => {
    setLibraryItems(prev => prev.filter(it => !selectedIds.has(it.id)));
    setSelectedIds(new Set());
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Package size={14} className="text-indigo-500" />
        <span className="text-xs font-bold text-foreground">库管理器</span>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
        <button
          onClick={() => handleModeSwitch('export')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            mode === 'export' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Upload size={12} />
          导出到库
        </button>
        <button
          onClick={() => handleModeSwitch('import')}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            mode === 'import' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Download size={12} />
          从库导入
        </button>
      </div>

      {/* Category tabs */}
      <Tabs value={category} onValueChange={handleCategoryChange}>
        <TabsList className="w-full h-auto flex-wrap gap-0.5 p-0.5">
          {(Object.keys(CATEGORY_META) as LibraryCategory[]).map(cat => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            return (
              <TabsTrigger key={cat} value={cat} className="text-[10px] px-2 py-1 gap-1">
                <Icon size={11} />
                {meta.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Search */}
        <div className="relative mt-2">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`搜索${CATEGORY_META[category].label}...`}
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Import: load file button */}
        {mode === 'import' && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full text-xs gap-1.5"
            onClick={handleLoadFile}
          >
            <Download size={13} />
            加载库文件
          </Button>
        )}

        {/* Select all / none */}
        {filteredItems.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <button onClick={selectAll} className="text-[10px] text-primary hover:underline">全选</button>
            <span className="text-[10px] text-muted-foreground">|</span>
            <button onClick={selectNone} className="text-[10px] text-primary hover:underline">取消全选</button>
            <span className="text-[10px] text-muted-foreground ml-auto">
              已选 {selectedIds.size}/{filteredItems.length}
            </span>
          </div>
        )}

        {/* Item list — shared across all category tabs */}
        {(Object.keys(CATEGORY_META) as LibraryCategory[]).map(cat => (
          <TabsContent key={cat} value={cat} className="mt-2 flex flex-col gap-1.5 max-h-[360px] overflow-y-auto">
            {filteredItems.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic py-4 text-center">
                {mode === 'export'
                  ? `当前项目中没有${CATEGORY_META[cat].label}`
                  : '请先加载库文件'}
              </p>
            ) : (
              filteredItems.map(item => (
                <LibraryItemCard
                  key={item.id}
                  item={item}
                  category={category}
                  selected={selectedIds.has(item.id)}
                  onToggle={() => toggleSelect(item.id)}
                  onPreview={() => setPreviewItem(item)}
                />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Preview dialog */}
      <Dialog open={previewItem !== null} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{previewItem?.name ?? '详情预览'}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {CATEGORY_META[category].label}参数详情
            </DialogDescription>
          </DialogHeader>
          {previewItem && <ItemPreview item={previewItem} category={category} />}
          <DialogFooter>
            <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => setPreviewItem(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action buttons */}
      <div className="flex gap-2 mt-1">
        {mode === 'export' ? (
          <Button
            size="sm"
            className="flex-1 text-xs gap-1.5 rounded-xl"
            disabled={selectedIds.size === 0}
            onClick={handleExport}
          >
            <Upload size={13} />
            导出选中 ({selectedIds.size})
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              className="flex-1 text-xs gap-1.5 rounded-xl"
              disabled={selectedIds.size === 0 || libraryItems.length === 0}
              onClick={handleImport}
            >
              <Download size={13} />
              导入选中 ({selectedIds.size})
            </Button>
            {libraryItems.length > 0 && selectedIds.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1 rounded-xl hover:bg-destructive/10 hover:text-destructive"
                onClick={handleRemoveFromLibrary}
              >
                <Trash2 size={12} />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
