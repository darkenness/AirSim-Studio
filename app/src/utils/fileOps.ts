/**
 * File operations abstraction — uses Tauri native dialogs when available,
 * falls back to browser APIs otherwise.
 */

const isTauri = () => !!(window as Record<string, unknown>).__TAURI_INTERNALS__;

// ── Save ────────────────────────────────────────────────────────────

export async function saveFile(
  content: string,
  defaultName: string,
  filters: { name: string; extensions: string[] }[] = [{ name: 'JSON', extensions: ['json'] }],
): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({
      defaultPath: defaultName,
      filters,
    });
    if (!path) return null;
    await writeTextFile(path, content);
    return path;
  }

  // Browser fallback
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return defaultName;
}

// ── Open ────────────────────────────────────────────────────────────

export async function openFile(
  filters: { name: string; extensions: string[] }[] = [{ name: 'JSON', extensions: ['json'] }],
): Promise<{ content: string; name: string } | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({
      multiple: false,
      filters,
    });
    if (!path) return null;
    const filePath = typeof path === 'string' ? path : path;
    const content = await readTextFile(filePath);
    const name = filePath.split(/[\\/]/).pop() ?? filePath;
    return { content, name };
  }

  // Browser fallback
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters.map(f => f.extensions.map(e => `.${e}`).join(',')).join(',');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        resolve({ content: ev.target?.result as string, name: file.name });
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

// ── Download (for CSV/text exports) ─────────────────────────────────

export async function downloadFile(
  content: string,
  defaultName: string,
  filters: { name: string; extensions: string[] }[] = [{ name: 'CSV', extensions: ['csv'] }],
): Promise<string | null> {
  return saveFile(content, defaultName, filters);
}
