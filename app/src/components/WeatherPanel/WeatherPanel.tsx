import { useCallback, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { CloudSun, Upload, Trash2 } from 'lucide-react';
import type { WeatherRecord } from '../../types';
import { EmptyState } from '../ui/empty-state';

/** Parse a CONTAM-style .wth weather file into WeatherRecord[] */
function parseWthFile(text: string): { records: WeatherRecord[]; skipped: number; totalLines: number } {
  const records: WeatherRecord[] = [];
  let skipped = 0;
  let totalLines = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('#')) continue;
    if (!/^\d/.test(trimmed)) continue;
    totalLines++;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 7) { skipped++; continue; }

    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    const hour = parseInt(parts[2]);
    const tempC = parseFloat(parts[3]);
    const pressure = parseFloat(parts[4]);
    const windSpeed = parseFloat(parts[5]);
    const windDirection = parseFloat(parts[6]);
    const rhPercent = parts.length >= 8 ? parseFloat(parts[7]) : 50;

    if (isNaN(month) || isNaN(tempC)) { skipped++; continue; }

    records.push({
      month, day, hour,
      temperature: tempC + 273.15,
      windSpeed,
      windDirection,
      pressure,
      humidity: rhPercent / 100,
    });
  }
  return { records, skipped, totalLines };
}

export default function WeatherPanel() {
  const { weatherConfig, setWeatherConfig } = useAppStore();
  const [parseInfo, setParseInfo] = useState<string | null>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { records, skipped, totalLines } = parseWthFile(text);
      if (records.length === 0) {
        setParseInfo(`解析失败：${totalLines} 行数据中无有效记录`);
      } else if (skipped > 0) {
        setParseInfo(`已跳过 ${skipped} 行格式错误（共 ${totalLines} 行，成功 ${records.length} 条）`);
      } else {
        setParseInfo(null);
      }
      setWeatherConfig({
        enabled: true,
        filePath: file.name,
        records,
      });
    };
    reader.readAsText(file);
    e.target.value = ''; // reset for re-upload
  }, [setWeatherConfig]);

  const handleClear = useCallback(() => {
    setWeatherConfig({ enabled: false, filePath: '', records: [] });
  }, [setWeatherConfig]);

  const records = weatherConfig.records;
  const hasData = records.length > 0;

  // Summary stats
  const tempMin = hasData ? Math.min(...records.map(r => r.temperature)) - 273.15 : 0;
  const tempMax = hasData ? Math.max(...records.map(r => r.temperature)) - 273.15 : 0;
  const wsMax = hasData ? Math.max(...records.map(r => r.windSpeed)) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <CloudSun size={14} className="text-sky-500" />
        <span className="text-xs font-bold text-foreground">气象数据</span>
      </div>

      {/* Enable toggle */}
      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={weatherConfig.enabled}
          onChange={(e) => setWeatherConfig({ enabled: e.target.checked })}
          className="rounded border-border"
        />
        启用气象驱动仿真
      </label>

      {/* File upload */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 px-2 py-1.5 text-xs border border-border rounded-md cursor-pointer hover:bg-accent">
          <Upload size={12} />
          <span>加载 .wth 文件</span>
          <input type="file" accept=".wth,.txt,.csv" onChange={handleFileUpload} className="hidden" />
        </label>
        {hasData && (
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* File info */}
      {weatherConfig.filePath && (
        <div className="px-2 py-1.5 bg-muted rounded text-[11px] text-muted-foreground">
          文件: {weatherConfig.filePath}
        </div>
      )}

      {/* Parse warnings */}
      {parseInfo && (
        <div className="px-2 py-1.5 bg-amber-50 dark:bg-amber-950/30 rounded text-[11px] text-amber-700 dark:text-amber-300">
          ⚠ {parseInfo}
        </div>
      )}

      {/* Data summary */}
      {hasData && (
        <div className="flex flex-col gap-1 px-2 py-1.5 bg-sky-50 dark:bg-sky-950/30 rounded text-[11px]">
          <div className="text-sky-700 dark:text-sky-300 font-semibold">
            {records.length} 条记录
          </div>
          <div className="text-muted-foreground">
            温度: {tempMin.toFixed(1)}°C ~ {tempMax.toFixed(1)}°C
          </div>
          <div className="text-muted-foreground">
            最大风速: {wsMax.toFixed(1)} m/s
          </div>
          <div className="text-muted-foreground">
            时段: {records[0].month}/{records[0].day} ~ {records[records.length - 1].month}/{records[records.length - 1].day}
          </div>
        </div>
      )}

      {/* Preview table (first 10 records) */}
      {hasData && (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] text-muted-foreground">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-0.5 pr-1">月/日</th>
                <th className="text-left py-0.5 pr-1">时</th>
                <th className="text-right py-0.5 pr-1">温度°C</th>
                <th className="text-right py-0.5 pr-1">风速</th>
                <th className="text-right py-0.5">风向°</th>
              </tr>
            </thead>
            <tbody>
              {records.slice(0, 8).map((r, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-0.5 pr-1">{r.month}/{r.day}</td>
                  <td className="py-0.5 pr-1">{r.hour}</td>
                  <td className="text-right py-0.5 pr-1">{(r.temperature - 273.15).toFixed(1)}</td>
                  <td className="text-right py-0.5 pr-1">{r.windSpeed.toFixed(1)}</td>
                  <td className="text-right py-0.5">{r.windDirection.toFixed(0)}</td>
                </tr>
              ))}
              {records.length > 8 && (
                <tr>
                  <td colSpan={5} className="py-0.5 text-center italic">
                    ... 还有 {records.length - 8} 条
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!hasData && (
        <EmptyState icon={CloudSun} message="尚未加载气象数据。支持 CONTAM .wth 格式。" />
      )}
    </div>
  );
}
