import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Plus, Trash2, Activity, Gauge, Radio, Sliders } from 'lucide-react';

interface SensorDef {
  id: number;
  name: string;
  type: 'Concentration' | 'Pressure' | 'Temperature' | 'MassFlow';
  targetId: number;
  speciesIdx: number;
}

interface ControllerDef {
  id: number;
  name: string;
  sensorId: number;
  actuatorId: number;
  setpoint: number;
  Kp: number;
  Ki: number;
  deadband: number;
}

interface ActuatorDef {
  id: number;
  name: string;
  type: 'DamperFraction' | 'FanSpeed' | 'FilterBypass';
  linkIdx: number;
}

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
  const { nodes, links } = useAppStore();
  const [sensors, setSensors] = useState<SensorDef[]>([]);
  const [controllers, setControllers] = useState<ControllerDef[]>([]);
  const [actuators, setActuators] = useState<ActuatorDef[]>([]);
  const [expanded, setExpanded] = useState(false);

  const nextId = (arr: { id: number }[]) => arr.length > 0 ? Math.max(...arr.map(a => a.id)) + 1 : 0;

  const addSensor = () => {
    setSensors([...sensors, {
      id: nextId(sensors), name: `传感器 ${sensors.length}`,
      type: 'Concentration', targetId: nodes[0]?.id ?? 0, speciesIdx: 0,
    }]);
  };

  const addController = () => {
    setControllers([...controllers, {
      id: nextId(controllers), name: `控制器 ${controllers.length}`,
      sensorId: sensors[0]?.id ?? 0, actuatorId: actuators[0]?.id ?? 0,
      setpoint: 0.001, Kp: 1.0, Ki: 0.1, deadband: 0.0,
    }]);
  };

  const addActuator = () => {
    setActuators([...actuators, {
      id: nextId(actuators), name: `执行器 ${actuators.length}`,
      type: 'DamperFraction', linkIdx: 0,
    }]);
  };

  const updateSensor = (id: number, patch: Partial<SensorDef>) => {
    setSensors(sensors.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const updateController = (id: number, patch: Partial<ControllerDef>) => {
    setControllers(controllers.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const updateActuator = (id: number, patch: Partial<ActuatorDef>) => {
    setActuators(actuators.map(a => a.id === id ? { ...a, ...patch } : a));
  };

  if (!expanded) {
    return (
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(true)}>
        <Sliders size={14} className="text-violet-500" />
        <span className="text-xs font-bold text-slate-700">控制系统</span>
        <span className="text-[9px] text-slate-400 ml-auto">
          {sensors.length}S / {controllers.length}C / {actuators.length}A
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded(false)}>
        <Sliders size={14} className="text-violet-500" />
        <span className="text-xs font-bold text-slate-700">控制系统</span>
        <span className="text-[9px] text-slate-400 ml-auto">▼</span>
      </div>

      {/* Sensors */}
      <div className="border border-slate-100 rounded-md p-2 bg-white">
        <div className="flex items-center gap-1 mb-1">
          <Radio size={11} className="text-green-500" />
          <span className="text-[10px] font-bold text-slate-600">传感器</span>
          <button onClick={addSensor} className="ml-auto p-0.5 rounded hover:bg-green-50 text-slate-400 hover:text-green-500">
            <Plus size={12} />
          </button>
        </div>
        {sensors.map(s => (
          <div key={s.id} className="flex flex-col gap-0.5 py-1 border-t border-slate-50 text-[10px]">
            <div className="flex items-center gap-1">
              <input value={s.name} onChange={e => updateSensor(s.id, { name: e.target.value })}
                className="flex-1 px-1 py-0.5 border border-slate-200 rounded text-[10px]" />
              <button onClick={() => setSensors(sensors.filter(x => x.id !== s.id))}
                className="p-0.5 text-slate-300 hover:text-red-400"><Trash2 size={10} /></button>
            </div>
            <div className="flex gap-1">
              <select value={s.type} onChange={e => updateSensor(s.id, { type: e.target.value as SensorDef['type'] })}
                className="flex-1 px-1 py-0.5 border border-slate-200 rounded text-[10px]">
                {SENSOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={s.targetId} onChange={e => updateSensor(s.id, { targetId: parseInt(e.target.value) })}
                className="flex-1 px-1 py-0.5 border border-slate-200 rounded text-[10px]">
                {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Actuators */}
      <div className="border border-slate-100 rounded-md p-2 bg-white">
        <div className="flex items-center gap-1 mb-1">
          <Gauge size={11} className="text-orange-500" />
          <span className="text-[10px] font-bold text-slate-600">执行器</span>
          <button onClick={addActuator} className="ml-auto p-0.5 rounded hover:bg-orange-50 text-slate-400 hover:text-orange-500">
            <Plus size={12} />
          </button>
        </div>
        {actuators.map(a => (
          <div key={a.id} className="flex flex-col gap-0.5 py-1 border-t border-slate-50 text-[10px]">
            <div className="flex items-center gap-1">
              <input value={a.name} onChange={e => updateActuator(a.id, { name: e.target.value })}
                className="flex-1 px-1 py-0.5 border border-slate-200 rounded text-[10px]" />
              <button onClick={() => setActuators(actuators.filter(x => x.id !== a.id))}
                className="p-0.5 text-slate-300 hover:text-red-400"><Trash2 size={10} /></button>
            </div>
            <div className="flex gap-1">
              <select value={a.type} onChange={e => updateActuator(a.id, { type: e.target.value as ActuatorDef['type'] })}
                className="flex-1 px-1 py-0.5 border border-slate-200 rounded text-[10px]">
                {ACTUATOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={a.linkIdx} onChange={e => updateActuator(a.id, { linkIdx: parseInt(e.target.value) })}
                className="flex-1 px-1 py-0.5 border border-slate-200 rounded text-[10px]">
                {links.map((l, i) => <option key={l.id} value={i}>Link #{l.id}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Controllers */}
      <div className="border border-slate-100 rounded-md p-2 bg-white">
        <div className="flex items-center gap-1 mb-1">
          <Activity size={11} className="text-violet-500" />
          <span className="text-[10px] font-bold text-slate-600">控制器 (PI)</span>
          <button onClick={addController} className="ml-auto p-0.5 rounded hover:bg-violet-50 text-slate-400 hover:text-violet-500">
            <Plus size={12} />
          </button>
        </div>
        {controllers.map(c => (
          <div key={c.id} className="flex flex-col gap-0.5 py-1 border-t border-slate-50 text-[10px]">
            <div className="flex items-center gap-1">
              <input value={c.name} onChange={e => updateController(c.id, { name: e.target.value })}
                className="flex-1 px-1 py-0.5 border border-slate-200 rounded text-[10px]" />
              <button onClick={() => setControllers(controllers.filter(x => x.id !== c.id))}
                className="p-0.5 text-slate-300 hover:text-red-400"><Trash2 size={10} /></button>
            </div>
            <div className="flex gap-1">
              <label className="flex flex-col">
                <span className="text-[8px] text-slate-400">传感器</span>
                <select value={c.sensorId} onChange={e => updateController(c.id, { sensorId: parseInt(e.target.value) })}
                  className="px-1 py-0.5 border border-slate-200 rounded text-[10px]">
                  {sensors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col">
                <span className="text-[8px] text-slate-400">执行器</span>
                <select value={c.actuatorId} onChange={e => updateController(c.id, { actuatorId: parseInt(e.target.value) })}
                  className="px-1 py-0.5 border border-slate-200 rounded text-[10px]">
                  {actuators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-4 gap-1">
              <label className="flex flex-col">
                <span className="text-[8px] text-slate-400">设定值</span>
                <input type="number" step="0.001" value={c.setpoint}
                  onChange={e => updateController(c.id, { setpoint: parseFloat(e.target.value) || 0 })}
                  className="px-1 py-0.5 border border-slate-200 rounded text-[10px]" />
              </label>
              <label className="flex flex-col">
                <span className="text-[8px] text-slate-400">Kp</span>
                <input type="number" step="0.1" value={c.Kp}
                  onChange={e => updateController(c.id, { Kp: parseFloat(e.target.value) || 0 })}
                  className="px-1 py-0.5 border border-slate-200 rounded text-[10px]" />
              </label>
              <label className="flex flex-col">
                <span className="text-[8px] text-slate-400">Ki</span>
                <input type="number" step="0.01" value={c.Ki}
                  onChange={e => updateController(c.id, { Ki: parseFloat(e.target.value) || 0 })}
                  className="px-1 py-0.5 border border-slate-200 rounded text-[10px]" />
              </label>
              <label className="flex flex-col">
                <span className="text-[8px] text-slate-400">死区</span>
                <input type="number" step="0.001" value={c.deadband}
                  onChange={e => updateController(c.id, { deadband: parseFloat(e.target.value) || 0 })}
                  className="px-1 py-0.5 border border-slate-200 rounded text-[10px]" />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
