export type TabType = 'signals' | 'gate' | 'positions' | 'config';

export interface RpcNode {
  id: string;
  name: string;
  location: string;
  latencyMs: number;
  jitoMevSupported: boolean;
  blockHeight: number;
  status: 'optimal' | 'moderate' | 'degraded';
}

export interface TokenSignal {
  id: string;
  symbol: string;
  name: string;
  mint: string;
  pairAddress: string;
  dex: 'Pump.fun' | 'Raydium' | 'Meteora' | 'Orca';
  dexColor: string;
  initialSolLiquidity: number;
  marketCapUsd: number;
  priceUsd: number;
  priceDelta5m: number;
  sparkline: number[];
  safetyScore: number;
  isMintRevoked: boolean;
  isFreezeRevoked: boolean;
  hasToken2022Extensions: boolean;
  top10HoldersPercent: number;
  devHoldingPercent: number;
  lpBurned: boolean;
  detectedSecondsAgo: number;
  bondingCurveProgress?: number;
  isSniped?: boolean;
}

export interface SafetyAuditResult {
  mint: string;
  resolvedMint: string;
  symbol: string;
  name: string;
  safetyScore: number;
  status: 'PASSED' | 'REJECTED' | 'HIGH_RISK';
  typeClassification: 'mint' | 'account' | 'pair' | 'malformed';
  checks: {
    id: string;
    label: string;
    description: string;
    passed: boolean;
    critical: boolean;
    details: string;
  }[];
  holderDistribution: {
    label: string;
    percent: number;
    color: string;
    address: string;
  }[];
  token2022Risk: {
    hasTransferFee: boolean;
    feeBasisPoints: number;
    hasDefaultAccountState: boolean;
    hasPermanentDelegate: boolean;
    hasInterestBearing: boolean;
  };
  vulnerabilityAnalysis: {
    isMintParsedCheck: boolean;
    safePropertyAccess: boolean;
    addressSanitized: boolean;
    dexPairFallbackResolved: boolean;
    vulnerabilityNotes: string[];
  };
}

export interface PriceAlert {
  id: string;
  positionId: string;
  symbol: string;
  type: 'TAKE_PROFIT' | 'STOP_LOSS';
  targetPriceUsd: number;
  deltaPercentFromCurrent: number;
  triggered: boolean;
  createdAt: string;
  autoExecuteSellPercent?: number; // e.g. 50% or 100% or 0 (alert only)
  strategyName?: string;
  routeDex?: string;
  priorityTipSol?: number;
  mempoolBuyRatio?: number;
  scannerStatus?: string;
}

export interface TakeProfitTier {
  tier: number;
  targetPercent: number;
  hit: boolean;
  sellPortionPercent: number;
  lockFloorPercent?: number;
  tightenedTrailingPercent?: number;
}

export interface Position {
  id: string;
  symbol: string;
  name: string;
  mint: string;
  dex: 'Pump.fun' | 'Raydium' | 'Meteora';
  entryPriceUsd: number;
  currentPriceUsd: number;
  tokensAmount: number;
  initialSolInvested: number;
  currentSolValue: number;
  pnlSol: number;
  pnlPercent: number;
  sparkline: number[];
  trailingStopPercent: number;
  highestPriceUsd: number;
  stopPriceUsd: number;
  takeProfitTiers: TakeProfitTier[];
  alerts?: PriceAlert[];
  autoSellTriggerEnabled?: boolean;
  autoSellPortionPercent?: number;
  jitoPriorityFeeSol?: number;
  antiMevEnabled?: boolean;
  trailingStopActive?: boolean;
  smartProfitLockEnabled?: boolean;
  smartProfitLockMode?: 'BREAKEVEN_SHIELD' | 'AGGRESSIVE_RATCHET' | 'HYPER_RUNNER';
  smartProfitFloorPercent?: number;
  smartProfitLockStage?: number;
  timestamp: string;
}

export interface SniperConfig {
  autoSnipeEnabled: boolean;
  defaultBuySol: number;
  slippageTolerancePercent: number;
  jitoTipSol: number;
  antiMevEnabled: boolean;
  minLiquiditySol: number;
  maxDevHoldingPercent: number;
  minSafetyScore: number;
  trailingStopLossPercent: number;
  tp1Percent: number;
  tp2Percent: number;
  tp3Percent: number;
  selectedRpcId: string;
}
