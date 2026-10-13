import { useCallback, useEffect, useRef } from 'react';
import { runMonteCarlo, type MonteCarloResult, type ReliabilityResult } from '@/lib/sla-calculator';
import type { SimulationRequest, SimulationResponse } from '@/lib/monte-carlo.worker';

type Run = (reliability: ReliabilityResult, targetSla: number, iterations: number) => Promise<MonteCarloResult | null>;

/**
 * Runs the Monte Carlo simulation in a Web Worker so the UI stays responsive.
 *
 * Only the latest run matters: starting a new run terminates a worker that
 * is still busy with an older one, and the older promise resolves to null.
 * Falls back to running on the main thread where workers are unavailable.
 */
export const useMonteCarloSimulation = (): Run => {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const nextIdRef = useRef(0);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    pendingRef.current?.();
  }, []);

  return useCallback<Run>((reliability, targetSla, iterations) => {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(runMonteCarlo(reliability, targetSla, iterations));
    }

    // Supersede a run that is still in progress
    if (pendingRef.current) {
      workerRef.current?.terminate();
      workerRef.current = null;
      pendingRef.current();
    }

    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../lib/monte-carlo.worker.ts', import.meta.url), { type: 'module' });
    }
    const worker = workerRef.current;
    const id = ++nextIdRef.current;

    return new Promise(resolve => {
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        pendingRef.current = null;
      };
      const onMessage = (event: MessageEvent<SimulationResponse>) => {
        if (event.data.id !== id) return;
        cleanup();
        resolve(event.data.result);
      };
      const onError = (event: ErrorEvent) => {
        event.preventDefault();
        cleanup();
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        console.error('Simulation worker failed, running on the main thread', event.message);
        resolve(runMonteCarlo(reliability, targetSla, iterations));
      };
      pendingRef.current = () => {
        cleanup();
        resolve(null);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      const request: SimulationRequest = { id, reliability, targetSla, iterations };
      worker.postMessage(request);
    });
  }, []);
};
