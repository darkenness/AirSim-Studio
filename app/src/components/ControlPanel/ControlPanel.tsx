import { useAppStore } from '../../store/useAppStore';
import { Plus, Trash2, Activity, Gauge, Radio } from 'lucide-react';
import type { SensorDef, ControllerDef, ActuatorDef } from '../../types';
import { EmptyState } from '../ui/empty-state';

const SENSOR_TYPES = [
  { value: 'Concentration', label: '浓度' },
  { value: 'Pressure', label: '压力' },
  { value: 'Temperature', label: '温度' },
  { value: 'MassFlow', label: '流量' },
];

const ACTUATOR_TYPES = [
  { value: 'DamperFraction', label: '阀门开度' },
  { value: 'FanSpeed', label: '风扇转速' },
  { value: 'FilterBypass', label: '过滤器旁通' },
];

export default function ControlPanel() {
  const { nodes, links, controlSystem, setControlSystem } = useAppStore();
  const { sensors, controllers, actuators } = controlSystem;

  const nextId = (arr: { id: number }[]) => arr.length > 0 ? Math.max(...arr.map(a => a.id)) + 1 : 0;

  const updateSensors = (fn: (s: SensorDef[]) => SensorDef[]) =>
    setControlSystem({ ...controlSystem, sensors: fn(sensors) });
  const updateControllers = (fn: (c: ControllerDef[]) => ControllerDef[]) =>
    setControlSystem({ ...controlSystem, controllers: fn(controllers) });
  const updateActuators = (fn: (a: ActuatorDef[]) => ActuatorDef[]) =>
    setControlSystem({ ...controlSystem, actuators: fn(actuators) });

  const addSensor = () => updateSensors(s => [...s, {
    id: nextId(s), name: `传感器 ${s.length}`,
    type: 'Concentration' as const, targetId: nodes[0]?.id ?? 0, speciesIdx: 0,
  }]);

  const addController = () => updateControllers(c => [...c, {
    id: nextId(c), name: `控制器 ${c.length}`,
    sensorId: sensors[0]?.id ?? 0, actuatorId: actuators[0]?.id ?? 0,
    setpoint: 0.001, Kp: 1.0, Ki: 0.1, deadband: 0.0,
  }]);

  const addActuator = () => updateActuators(a => [...a, {
    id: nextId(a), name: `执行器 ${a.length}`,
    type: 'DamperFraction' as const, linkIdx: 0,
  }]);

  return (
    <div className="flex flex-col gap-4">
      {/* Sensors */}
      <div className="border border-border rounded-md p-4 bg-card">
        <div className="flex items-center gap-2 mb-3">
          <Radio size={12} className="text-green-500" />
          <span className="text-xs font-semibold text-foreground">传感器</span>
          <button onClick={addSensor} className="ml-auto p-0.5 rounded hover:bg-green-500/10 text-muted-foreground hover:text-green-500">
            <Plus size={13} />
          </button>
        </div>
        {sensors.length === 0 && <EmptyState icon={Radio} message="无传感器" actionText="添加传感器" onAction={addSensor} />}
        {sensors.map(s => (
          <div key={s.id} className="flex flex-col gap-2 py-2.5 border-t border-border text-xs">
            <div className="flex items-center gap-1">
              <input value={s.name} onChange={e => updateSensors(arr => arr.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))}
                className="flex-1 px-1.5 py-0.5 border border-border rounded text-xs bg-background" />
              <button onClick={() => updateSensors(arr => arr.filter(x => x.id !== s.id))}
                className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2 size={11} /></button>
            </div>
            <div className="flex gap-1">
              <select value={s.type} onChange={e => updateSensors(arr => arr.map(x => x.id === s.id ? { ...x, type: e.target.value as SensorDef['type'] } : x))}
                className="flex-1 px-1 py-0.5 border border-border rounded text-xs bg-background">
                {SENSOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={s.targetId} onChange={e => updateSensors(arr => arr.map(x => x.id === s.id ? { ...x, targetId: parseInt(e.target.value) } : x))}
                className="flex-1 px-1 py-0.5 border border-border rounded text-xs bg-background">
                {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Actuators */}
      <div className="border border-border rounded-md p-4 bg-card">
        <div className="flex items-center gap-2 mb-3">
          <Gauge size={12} className="text-orange-500" />
          <span className="text-xs font-semibold text-foreground">执行器</span>
          <button onClick={addActuator} className="ml-auto p-0.5 rounded hover:bg-orange-500/10 text-muted-foreground hover:text-orange-500">
            <Plus size={13} />
          </button>
        </div>
        {actuators.length === 0 && <EmptyState icon={Gauge} message="无执行器" actionText="添加执行器" onAction={addActuator} />}
        {actuators.map(a => (
          <div key={a.id} className="flex flex-col gap-2 py-2.5 border-t border-border text-xs">
            <div className="flex items-center gap-1">
              <input value={a.name} onChange={e => updateActuators(arr => arr.map(x => x.id === a.id ? { ...x, name: e.target.value } : x))}
                className="flex-1 px-1.5 py-0.5 border border-border rounded text-xs bg-background" />
              <button onClick={() => updateActuators(arr => arr.filter(x => x.id !== a.id))}
                className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2 size={11} /></button>
            </div>
            <div className="flex gap-1">
              <select value={a.type} onChange={e => updateActuators(arr => arr.map(x => x.id === a.id ? { ...x, type: e.target.value as ActuatorDef['type'] } : x))}
                className="flex-1 px-1 py-0.5 border border-border rounded text-xs bg-background">
                {ACTUATOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={a.linkIdx} onChange={e => updateActuators(arr => arr.map(x => x.id === a.id ? { ...x, linkIdx: parseInt(e.target.value) } : x))}
                className="flex-1 px-1 py-0.5 border border-border rounded text-xs bg-background">
                {links.map((l, i) => <option key={l.id} value={i}>路径 #{l.id}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Controllers */}
      <div className="border border-border rounded-md p-4 bg-card">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={12} className="text-violet-500" />
          <span className="text-xs font-semibold text-foreground">控制器 (PI)</span>
          <button onClick={addController} className="ml-auto p-0.5 rounded hover:bg-violet-500/10 text-muted-foreground hover:text-violet-500">
            <Plus size={13} />
          </button>
        </div>
        {controllers.length === 0 && <EmptyState icon={Activity} message="无控制器" actionText="添加控制器" onAction={addController} />}
        {controllers.map(c => (
          <div key={c.id} className="flex flex-col gap-2 py-2.5 border-t border-border text-xs">
            <div className="flex items-center gap-1">
              <input value={c.name} onChange={e => updateControllers(arr => arr.map(x => x.id === c.id ? { ...x, name: e.target.value } : x))}
                className="flex-1 px-1.5 py-0.5 border border-border rounded text-xs bg-background" />
              <button onClick={() => updateControllers(arr => arr.filter(x => x.id !== c.id))}
                className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2 size={11} /></button>
            </div>
            <div className="flex gap-1.5">
              <label className="flex flex-col flex-1">
                <span className="text-[10px] text-muted-foreground">传感器</span>
                <select value={c.sensorId} onChange={e => updateControllers(arr => arr.map(x => x.id === c.id ? { ...x, sensorId: parseInt(e.target.value) } : x))}
                  className="px-1 py-0.5 border border-border rounded text-xs bg-background">
                  {sensors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col flex-1">
                <span className="text-[10px] text-muted-foreground">执行器</span>
                <select value={c.actuatorId} onChange={e => updateControllers(arr => arr.map(x => x.id === c.id ? { ...x, actuatorId: parseInt(e.target.value) } : x))}
                  className="px-1 py-0.5 border border-border rounded text-xs bg-background">
                  {actuators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { key: 'setpoint', label: '设定值', step: '0.001' },
                { key: 'Kp', label: 'Kp', step: '0.1' },
                { key: 'Ki', label: 'Ki', step: '0.01' },
                { key: 'deadband', label: '死区', step: '0.001' },
              ].map(p => (
                <label key={p.key} className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">{p.label}</span>
                  <input type="number" step={p.step} value={(c as unknown as Record<string, number>)[p.key]}
                    onChange={e => updateControllers(arr => arr.map(x => x.id === c.id ? { ...x, [p.key]: parseFloat(e.target.value) || 0 } : x))}
                    className="px-1 py-0.5 border border-border rounded text-xs bg-background" />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
