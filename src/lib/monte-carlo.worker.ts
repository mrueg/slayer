import type { MonteCarloResult, SLAItem } from './sla-calculator';
import { simulateSystem } from './simulation';

export interface SimulationRequest {
  id: number;
  root: SLAItem;
  targetSla: number;
  iterations: number;
  seed?: number;
}

export interface SimulationResponse {
  id: number;
  result: MonteCarloResult;
}

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { id, root, targetSla, iterations, seed } = event.data;
  const response: SimulationResponse = { id, result: simulateSystem(root, targetSla, iterations, seed) };
  self.postMessage(response);
};
