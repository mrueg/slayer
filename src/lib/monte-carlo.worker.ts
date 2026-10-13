import { runMonteCarlo, type MonteCarloResult, type ReliabilityResult } from './sla-calculator';

export interface SimulationRequest {
  id: number;
  reliability: ReliabilityResult;
  targetSla: number;
  iterations: number;
  seed?: number;
}

export interface SimulationResponse {
  id: number;
  result: MonteCarloResult;
}

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { id, reliability, targetSla, iterations, seed } = event.data;
  const response: SimulationResponse = { id, result: runMonteCarlo(reliability, targetSla, iterations, seed) };
  self.postMessage(response);
};
