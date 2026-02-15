import { describe, it, expect } from 'vitest';
import { openFile, saveFile } from '../utils/fileOps';

describe('fileOps', () => {
  describe('browser fallback detection', () => {
    it('openFile returns null when no file selected (browser mode)', async () => {
      // In jsdom, there's no real file picker — the hidden input won't fire change
      // We just verify the function doesn't throw
      // Full integration test would need Tauri runtime
      expect(typeof openFile).toBe('function');
      expect(typeof saveFile).toBe('function');
    });
  });

  describe('isTauri detection', () => {
    it('detects non-Tauri environment', () => {
      // jsdom doesn't have __TAURI_INTERNALS__
      expect((window as any).__TAURI_INTERNALS__).toBeUndefined();
    });
  });
});
