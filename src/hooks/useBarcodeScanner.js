import { useEffect, useRef, useCallback } from 'react';

const SCAN_GAP_MS = 80;
const MIN_LENGTH = 3;

/**
 * Listen for USB barcode scanner input (rapid keypresses ending with Enter).
 */
export function useBarcodeScanner({ onScan, enabled = true }) {
  const bufferRef = useRef('');
  const lastKeyAtRef = useRef(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const flush = useCallback(() => {
    const code = bufferRef.current.trim();
    bufferRef.current = '';
    if (code.length >= MIN_LENGTH) onScanRef.current?.(code);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (e) => {
      const target = e.target;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'textarea') return;
      if (tag === 'input' && target !== document.body) {
        const type = target.type?.toLowerCase();
        if (type !== 'search' && !target.dataset?.barcodeCapture) return;
      }

      const now = Date.now();
      if (now - lastKeyAtRef.current > SCAN_GAP_MS) bufferRef.current = '';
      lastKeyAtRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current) {
          e.preventDefault();
          flush();
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, flush]);
}
