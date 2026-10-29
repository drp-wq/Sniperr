/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TabType, TokenSignal, Position, RpcNode, SniperConfig, PriceAlert } from './types';
import {
  INITIAL_RPC_NODES,
  INITIAL_SIGNALS,
  INITIAL_POSITIONS,
  DEFAULT_SNIPER_CONFIG
} from './services/mockData';
import { TopBar } from './components/TopBar';
import { BottomNavDock } from './components/BottomNavDock';
import { SignalStreamFeed } from './components/SignalStreamFeed';
import { SafetyGateInspector } from './components/SafetyGateInspector';
import { PositionsHUD } from './components/PositionsHUD';
import { SniperConfigTab } from './components/SniperConfigTab';
import { KillSwitchDrawer } from './components/KillSwitchDrawer';
import { WalletModal } from './components/WalletModal';
import { TelegramFrameWrapper } from './components/TelegramFrameWrapper';
import { haptics } from './services/haptics';
import { CheckCircle2, AlertOctagon, Zap, BellRing, Flame } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  const [walletSol, setWalletSol] = useState<number>(42.50);
  const [rpcNodes, setRpcNodes] = useState<RpcNode[]>(INITIAL_RPC_NODES);
  const [activeRpc, setActiveRpc] = useState<RpcNode>(INITIAL_RPC_NODES[0]);
  const [signals, setSignals] = useState<TokenSignal[]>(INITIAL_SIGNALS);
  const [positions, setPositions] = useState<Position[]>(INITIAL_POSITIONS);
  const [sniperConfig, setSniperConfig] = useState<SniperConfig>(DEFAULT_SNIPER_CONFIG);

  const [isKillSwitchOpen, setIsKillSwitchOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [inspectedMint, setInspectedMint] = useState<string>('Cat9ZpC4gTfRsm12wYFvMvK8xQyW3mK9jD2pE5qR8sT1');
  const [toastMessage, setToastMessage] = useState<{ title: string; subtitle: string; type: 'success' | 'alert' | 'info' } | null>(null);

  // Show Toast Helper
  const showToast = (title: string, subtitle: string, type: 'success' | 'alert' | 'info' = 'success') => {
    setToastMessage({ title, subtitle, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Helper to trigger system notification
  const triggerSystemPriceAlert = (
    position: Position,
    alert: PriceAlert,
    currentPrice: number
  ) => {
    const isTp = alert.type === 'TAKE_PROFIT';
    const title = isTp
      ? `🎯 TAKE PROFIT TRIGGERED: $${position.symbol}`
      : `⚠️ STOP LOSS TRIGGERED: $${position.symbol}`;
    const subtitle = `Price reached $${currentPrice.toFixed(6)} (Target: $${alert.targetPriceUsd.toFixed(6)})${
      alert.autoExecuteSellPercent ? ` · Auto-Sold ${alert.autoExecuteSellPercent}%` : ''
    }`;

    if (isTp) {
      haptics.success();
      showToast(title, subtitle, 'success');
    } else {
      haptics.error();
      showToast(title, subtitle, 'alert');
    }

    // Attempt browser Notification if permission is granted
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: subtitle });
      }
    } catch {}

    // Auto-execute sell if configured
    if (alert.autoExecuteSellPercent && alert.autoExecuteSellPercent > 0) {
      handleSellPosition(position.id, alert.autoExecuteSellPercent);
    }
  };

  // Live Mempool & Price Simulator with Real-Time Alert Triggering
  useEffect(() => {
    const interval = setInterval(() => {
      // 1. Randomly fluctuate position prices slightly & evaluate alerts and smart profit lock auto-trail
      setPositions((prev) =>
        prev.map((pos) => {
          const delta = (Math.random() - 0.48) * 0.00008 * (pos.currentPriceUsd > 0.01 ? 10 : 1);
          const nextPrice = Math.max(0.000001, pos.currentPriceUsd + delta);
          const highest = Math.max(pos.highestPriceUsd, nextPrice);
          const pnlPercent = ((nextPrice - pos.entryPriceUsd) / pos.entryPriceUsd) * 100;
          const currentSolValue = (pos.tokensAmount * nextPrice) / 165.25;
          const pnlSol = currentSolValue - pos.initialSolInvested;

          // Smart Profit Lock Auto-Trail Evaluation
          let currentTrailingPct = pos.trailingStopPercent;
          let currentLockStage = pos.smartProfitLockStage || 0;
          let currentLockFloor = pos.smartProfitFloorPercent || 0;
          let newlyHitTierMsg: string | null = null;

          const updatedTiers = (pos.takeProfitTiers || []).map((tier) => {
            if (!tier.hit && pnlPercent >= tier.targetPercent) {
              if (pos.smartProfitLockEnabled) {
                if (tier.tightenedTrailingPercent) {
                  currentTrailingPct = tier.tightenedTrailingPercent;
                }
                if (tier.lockFloorPercent !== undefined) {
                  currentLockFloor = Math.max(currentLockFloor, tier.lockFloorPercent);
                }
                currentLockStage = Math.max(currentLockStage, tier.tier);
                newlyHitTierMsg = `TP${tier.tier} (+${tier.targetPercent}%)`;
              }
              return { ...tier, hit: true };
            }
            return tier;
          });

          if (newlyHitTierMsg) {
            haptics.success();
            showToast(
              `🔒 SMART PROFIT LOCK ACTIVATED`,
              `$${pos.symbol} hit ${newlyHitTierMsg}! Stop loss tightened to +${currentLockFloor.toFixed(1)}% floor (-${currentTrailingPct}% buffer)`,
              'success'
            );
          }

          // Effective stop price: maximum of trailing ATH and guaranteed locked floor
          const trailFloorUsd = highest * (1 - currentTrailingPct / 100);
          let guaranteedFloorUsd = 0;
          if (pos.smartProfitLockEnabled && currentLockFloor > 0) {
            guaranteedFloorUsd = pos.entryPriceUsd * (1 + currentLockFloor / 100);
          }
          const stopPrice = Math.max(trailFloorUsd, guaranteedFloorUsd);

          // Check active price alerts
          const updatedAlerts = (pos.alerts || []).map((alert) => {
            if (alert.triggered) return alert;

            const isTpTriggered =
              alert.type === 'TAKE_PROFIT' && nextPrice >= alert.targetPriceUsd;
            const isSlTriggered =
              alert.type === 'STOP_LOSS' && nextPrice <= alert.targetPriceUsd;

            if (isTpTriggered || isSlTriggered) {
              triggerSystemPriceAlert(pos, alert, nextPrice);
              return { ...alert, triggered: true };
            }
            return alert;
          });

          return {
            ...pos,
            currentPriceUsd: nextPrice,
            highestPriceUsd: highest,
            stopPriceUsd: stopPrice,
            trailingStopPercent: currentTrailingPct,
            smartProfitLockStage: currentLockStage,
            smartProfitFloorPercent: currentLockFloor,
            takeProfitTiers: updatedTiers,
            currentSolValue,
            pnlSol,
            pnlPercent,
            alerts: updatedAlerts,
            sparkline: [...pos.sparkline.slice(1), Math.round(nextPrice * 1000000) % 100]
          };
        })
      );

      // 2. Fluctuate RPC Latency
      setRpcNodes((nodes) =>
        nodes.map((n) => ({
          ...n,
          latencyMs: Math.max(20, n.latencyMs + Math.floor((Math.random() - 0.5) * 6))
        }))
      );
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  // Quick Audit Handlers
  const handleQuickAudit = (mint: string) => {
    setInspectedMint(mint);
    setActiveTab('gate');
  };

  // 1-Tap Snipe Execution Handler
  const handleSnipeToken = (signal: TokenSignal) => {
    const buySol = sniperConfig.defaultBuySol;
    const jitoFee = sniperConfig.jitoTipSol;
    const totalRequired = buySol + jitoFee;

    if (walletSol < totalRequired) {
      haptics.error();
      showToast('Insufficient SOL Balance', `Need ${totalRequired.toFixed(3)} SOL to snipe`, 'alert');
      return;
    }

    // Deduct SOL
    setWalletSol((prev) => prev - totalRequired);

    // Mark signal as sniped
    setSignals((prev) =>
      prev.map((s) => (s.id === signal.id ? { ...s, isSniped: true } : s))
    );

    // Create new Position with automatic default TP and SL alerts
    const solPriceUsd = 165.25;
    const investedUsd = buySol * solPriceUsd;
    const tokenAmount = Math.floor(investedUsd / signal.priceUsd);
    const entryPrice = signal.priceUsd;

    const newPosition: Position = {
      id: `pos-${Date.now()}`,
      symbol: signal.symbol,
      name: signal.name,
      mint: signal.mint,
      dex: signal.dex === 'Orca' ? 'Raydium' : (signal.dex as Position['dex']),
      entryPriceUsd: entryPrice,
      currentPriceUsd: entryPrice * 1.05,
      tokensAmount: tokenAmount,
      initialSolInvested: buySol,
      currentSolValue: buySol * 1.05,
      pnlSol: buySol * 0.05,
      pnlPercent: 5.0,
      sparkline: [20, 25, 30, 40, 50, 60, 70, 85, 95, 105],
      trailingStopPercent: sniperConfig.trailingStopLossPercent,
      highestPriceUsd: entryPrice * 1.05,
      stopPriceUsd: entryPrice * 1.05 * (1 - sniperConfig.trailingStopLossPercent / 100),
      takeProfitTiers: [
        { tier: 1, targetPercent: 50, hit: false, sellPortionPercent: 30, lockFloorPercent: 2, tightenedTrailingPercent: 10 },
        { tier: 2, targetPercent: 100, hit: false, sellPortionPercent: 30, lockFloorPercent: 35, tightenedTrailingPercent: 6 },
        { tier: 3, targetPercent: 300, hit: false, sellPortionPercent: 40, lockFloorPercent: 80, tightenedTrailingPercent: 3.5 }
      ],
      alerts: [
        {
          id: `alert-${Date.now()}-tp`,
          positionId: `pos-${Date.now()}`,
          symbol: signal.symbol,
          type: 'TAKE_PROFIT',
          targetPriceUsd: entryPrice * 1.5,
          deltaPercentFromCurrent: 50,
          triggered: false,
          createdAt: 'Just now',
          autoExecuteSellPercent: 50
        }
      ],
      autoSellTriggerEnabled: true,
      autoSellPortionPercent: 50,
      jitoPriorityFeeSol: sniperConfig.jitoTipSol,
      antiMevEnabled: sniperConfig.antiMevEnabled,
      trailingStopActive: true,
      smartProfitLockEnabled: true,
      smartProfitLockMode: 'BREAKEVEN_SHIELD',
      smartProfitFloorPercent: 0,
      smartProfitLockStage: 0,
      timestamp: 'Just now'
    };

    setPositions((prev) => [newPosition, ...prev]);

    haptics.success();
    showToast(
      `Sniped ${signal.symbol}!`,
      `Filled ${buySol} SOL · TP Alert set at +50% · Safe Gate Passed (${signal.safetyScore}%)`,
      'success'
    );
  };

  // Sell Position (Partial or 100%)
  const handleSellPosition = (positionId: string, portionPercent: number) => {
    setPositions((prev) => {
      const target = prev.find((p) => p.id === positionId);
      if (!target) return prev;

      const returnSol = target.currentSolValue * (portionPercent / 100);
      setWalletSol((w) => w + returnSol);

      if (portionPercent >= 100) {
        showToast(
          `Sold 100% $${target.symbol}`,
          `Recovered ${returnSol.toFixed(2)} SOL (+${target.pnlPercent.toFixed(1)}%)`,
          'success'
        );
        return prev.filter((p) => p.id !== positionId);
      } else {
        const remainingPortion = 1 - portionPercent / 100;
        showToast(
          `Sold ${portionPercent}% $${target.symbol}`,
          `Credited ${returnSol.toFixed(2)} SOL to wallet`,
          'success'
        );
        return prev.map((p) => {
          if (p.id !== positionId) return p;
          return {
            ...p,
            tokensAmount: Math.floor(p.tokensAmount * remainingPortion),
            initialSolInvested: p.initialSolInvested * remainingPortion,
            currentSolValue: p.currentSolValue * remainingPortion,
            pnlSol: p.pnlSol * remainingPortion
          };
        });
      }
    });
  };

  // Adjust Trailing Stop
  const handleUpdateTrailingStop = (positionId: string, newPercent: number) => {
    setPositions((prev) =>
      prev.map((p) => {
        if (p.id !== positionId) return p;
        const newStop = p.highestPriceUsd * (1 - newPercent / 100);
        return {
          ...p,
          trailingStopPercent: newPercent,
          stopPriceUsd: newStop
        };
      })
    );
    showToast('Trailing Stop Updated', `Set to -${newPercent}% from peak price`, 'info');
  };

  // Update Execution Strategy parameters directly from HUD
  const handleUpdatePositionStrategy = (positionId: string, updates: Partial<Position>) => {
    setPositions((prev) =>
      prev.map((p) => {
        if (p.id !== positionId) return p;
        const updated = { ...p, ...updates };
        if (updates.trailingStopPercent !== undefined && updates.stopPriceUsd === undefined) {
          const trailFloor = updated.highestPriceUsd * (1 - updates.trailingStopPercent / 100);
          const lockFloor =
            updated.smartProfitLockEnabled && updated.smartProfitFloorPercent && updated.smartProfitFloorPercent > 0
              ? updated.entryPriceUsd * (1 + updated.smartProfitFloorPercent / 100)
              : 0;
          updated.stopPriceUsd = Math.max(trailFloor, lockFloor);
        }
        return updated;
      })
    );
  };

  // Smart Profit Lock Simulation Handler for instant testing
  const handleSimulateProfitLockTier = (positionId: string, tierNumber: number) => {
    setPositions((prev) =>
      prev.map((p) => {
        if (p.id !== positionId) return p;
        const targetTier = p.takeProfitTiers.find((t) => t.tier === tierNumber);
        if (!targetTier) return p;

        const floorPct = targetTier.lockFloorPercent ?? (tierNumber === 1 ? 2 : tierNumber === 2 ? 35 : 80);
        const trailPct = targetTier.tightenedTrailingPercent ?? (tierNumber === 1 ? 10 : tierNumber === 2 ? 6 : 3.5);
        const targetPrice = p.entryPriceUsd * (1 + targetTier.targetPercent / 100);
        const newHighest = Math.max(p.highestPriceUsd, targetPrice);
        const newStopPrice = Math.max(
          newHighest * (1 - trailPct / 100),
          p.entryPriceUsd * (1 + floorPct / 100)
        );
        const updatedTiers = p.takeProfitTiers.map((t) =>
          t.tier <= tierNumber ? { ...t, hit: true } : t
        );

        haptics.success();
        showToast(
          '🔒 Smart Profit Lock Activated',
          `$${p.symbol} hit TP${tierNumber} (+${targetTier.targetPercent}%)! Stop loss ratcheted to +${floorPct}% guaranteed floor (-${trailPct}% buffer)`,
          'success'
        );

        return {
          ...p,
          smartProfitLockEnabled: true,
          smartProfitLockStage: tierNumber,
          smartProfitFloorPercent: floorPct,
          trailingStopPercent: trailPct,
          highestPriceUsd: newHighest,
          stopPriceUsd: newStopPrice,
          takeProfitTiers: updatedTiers
        };
      })
    );
  };

  // Add Custom Price Alert Handler
  const handleAddPriceAlert = (
    positionId: string,
    alertData: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'positionId' | 'symbol'>
  ) => {
    const targetPos = positions.find((p) => p.id === positionId);
    if (!targetPos) return;

    const newAlert: PriceAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      positionId,
      symbol: targetPos.symbol,
      ...alertData,
      triggered: false,
      createdAt: 'Just now'
    };

    setPositions((prev) =>
      prev.map((p) => {
        if (p.id !== positionId) return p;
        return {
          ...p,
          alerts: [...(p.alerts || []), newAlert]
        };
      })
    );

    const typeLabel = alertData.type === 'TAKE_PROFIT' ? 'Take Profit' : 'Stop Loss';
    showToast(
      `Custom ${typeLabel} Alert Set`,
      `Target: $${alertData.targetPriceUsd.toFixed(6)} (${alertData.deltaPercentFromCurrent >= 0 ? '+' : ''}${alertData.deltaPercentFromCurrent.toFixed(1)}%)`,
      'info'
    );
  };

  // Delete Price Alert Handler
  const handleDeletePriceAlert = (positionId: string, alertId: string) => {
    setPositions((prev) =>
      prev.map((p) => {
        if (p.id !== positionId) return p;
        return {
          ...p,
          alerts: (p.alerts || []).filter((a) => a.id !== alertId)
        };
      })
    );
    showToast('Price Alert Removed', 'Alert cancelled for position', 'info');
  };

  // Test Trigger Alert Immediately (Simulation)
  const handleTestTriggerAlert = (positionId: string, alertId: string) => {
    const targetPos = positions.find((p) => p.id === positionId);
    if (!targetPos) return;
    const targetAlert = (targetPos.alerts || []).find((a) => a.id === alertId);
    if (!targetAlert) return;

    // Trigger system price alert
    triggerSystemPriceAlert(targetPos, targetAlert, targetAlert.targetPriceUsd);

    // Mark as triggered
    setPositions((prev) =>
      prev.map((p) => {
        if (p.id !== positionId) return p;
        return {
          ...p,
          alerts: (p.alerts || []).map((a) => (a.id === alertId ? { ...a, triggered: true } : a))
        };
      })
    );
  };

  // Bulk Clear All Alerts
  const handleClearAllAlerts = () => {
    setPositions((prev) =>
      prev.map((p) => ({
        ...p,
        alerts: []
      }))
    );
    haptics.heavy();
    showToast('All Alerts Cleared', 'Removed all pending alerts across open positions', 'info');
  };

  // Bulk Clear Alerts by Type
  const handleClearAlertsByType = (type: 'TAKE_PROFIT' | 'STOP_LOSS') => {
    setPositions((prev) =>
      prev.map((p) => ({
        ...p,
        alerts: (p.alerts || []).filter((a) => a.type !== type)
      }))
    );
    haptics.medium();
    const typeLabel = type === 'TAKE_PROFIT' ? 'Take Profit' : 'Stop Loss';
    showToast(`${typeLabel} Alerts Cleared`, `All ${typeLabel} alerts removed`, 'info');
  };

  // Bulk Simulate Trigger All Alerts
  const handleTriggerAllAlerts = () => {
    let triggeredCount = 0;
    positions.forEach((pos) => {
      (pos.alerts || []).forEach((a) => {
        if (!a.triggered) {
          triggerSystemPriceAlert(pos, a, a.targetPriceUsd);
          triggeredCount++;
        }
      });
    });

    setPositions((prev) =>
      prev.map((p) => ({
        ...p,
        alerts: (p.alerts || []).map((a) => ({ ...a, triggered: true }))
      }))
    );

    haptics.success();
    showToast('Simulated All Alerts', `Triggered ${triggeredCount} active alert notifications`, 'success');
  };

  // Emergency Halt Lever
  const handleConfirmHalt = (liquidateAll: boolean) => {
    setSniperConfig((prev) => ({ ...prev, autoSnipeEnabled: false }));

    if (liquidateAll && positions.length > 0) {
      const totalRecovered = positions.reduce((acc, p) => acc + p.currentSolValue, 0);
      setWalletSol((prev) => prev + totalRecovered);
      setPositions([]);
      showToast(
        'EMERGENCY HALT EXECUTED',
        `Engine killed · Liquidated all positions for ${totalRecovered.toFixed(2)} SOL`,
        'alert'
      );
    } else {
      showToast('EMERGENCY HALT EXECUTED', 'Auto-snipe and all active sub-slot triggers halted', 'alert');
    }
  };

  return (
    <TelegramFrameWrapper activeRpcName={activeRpc.name}>
      {/* TopBar with Latency, RPC Switcher, Kill Switch, and Wallet Pill */}
      <TopBar
        walletSol={walletSol}
        activeRpc={activeRpc}
        allRpcNodes={rpcNodes}
        onSelectRpc={(node) => setActiveRpc(node)}
        isEngineActive={sniperConfig.autoSnipeEnabled}
        onOpenKillSwitch={() => setIsKillSwitchOpen(true)}
        onOpenWalletModal={() => setIsWalletModalOpen(true)}
      />

      {/* Main Tab Viewport */}
      <main className="flex-1 px-3.5 pt-3.5">
        {activeTab === 'signals' && (
          <SignalStreamFeed
            signals={signals}
            onQuickAudit={handleQuickAudit}
            onSnipeToken={handleSnipeToken}
            isSniperActive={sniperConfig.autoSnipeEnabled}
            defaultBuySol={sniperConfig.defaultBuySol}
          />
        )}

        {activeTab === 'gate' && (
          <SafetyGateInspector
            initialMint={inspectedMint}
            onQuickSnipe={(mint, symbol) => {
              const matchedSignal = signals.find((s) => s.mint === mint) || {
                id: `sig-${Date.now()}`,
                symbol,
                name: symbol,
                mint,
                pairAddress: 'RayPool...',
                dex: 'Raydium',
                dexColor: '#10B981',
                initialSolLiquidity: 50,
                marketCapUsd: 100000,
                priceUsd: 0.0001,
                priceDelta5m: 10,
                sparkline: [20, 30, 40, 50, 60],
                safetyScore: 98,
                isMintRevoked: true,
                isFreezeRevoked: true,
                hasToken2022Extensions: false,
                top10HoldersPercent: 14,
                devHoldingPercent: 2,
                lpBurned: true,
                detectedSecondsAgo: 2
              };
              handleSnipeToken(matchedSignal);
              setActiveTab('positions');
            }}
          />
        )}

        {activeTab === 'positions' && (
          <PositionsHUD
            positions={positions}
            onSellPosition={handleSellPosition}
            onUpdateTrailingStop={handleUpdateTrailingStop}
            onAddPriceAlert={handleAddPriceAlert}
            onDeletePriceAlert={handleDeletePriceAlert}
            onTestTriggerAlert={handleTestTriggerAlert}
            onClearAllAlerts={handleClearAllAlerts}
            onClearAlertsByType={handleClearAlertsByType}
            onTriggerAllAlerts={handleTriggerAllAlerts}
            onUpdatePositionStrategy={handleUpdatePositionStrategy}
            onSimulateProfitLockTier={handleSimulateProfitLockTier}
          />
        )}

        {activeTab === 'config' && (
          <SniperConfigTab
            config={sniperConfig}
            onUpdateConfig={(updates) => {
              setSniperConfig((prev) => ({ ...prev, ...updates }));
              showToast('Configuration Saved', 'Sniper engine parameters updated', 'info');
            }}
            walletBalanceSol={walletSol}
          />
        )}
      </main>

      {/* Floating Bottom Glassmorphic Navigation Dock */}
      <BottomNavDock
        activeTab={activeTab}
        onChangeTab={(tab) => setActiveTab(tab)}
        signalsCount={signals.length}
        openPositionsCount={positions.length}
      />

      {/* Global Kill-Switch Slide Drawer */}
      <KillSwitchDrawer
        isOpen={isKillSwitchOpen}
        onClose={() => setIsKillSwitchOpen(false)}
        onConfirmHalt={handleConfirmHalt}
        isEngineActive={sniperConfig.autoSnipeEnabled}
        activePositionsCount={positions.length}
      />

      {/* Embedded Wallet Modal */}
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        walletSol={walletSol}
        onAddSol={(amt) => {
          setWalletSol((prev) => prev + amt);
          showToast(`Deposited +${amt} SOL`, `New balance: ${(walletSol + amt).toFixed(2)} SOL`, 'success');
        }}
      />

      {/* Global In-App Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm glass-panel-elevated rounded-xl p-3 border shadow-2xl animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg shrink-0 ${
                toastMessage.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 glow-emerald'
                  : toastMessage.type === 'alert'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 glow-crimson'
                  : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              }`}
            >
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : toastMessage.type === 'alert' ? (
                <AlertOctagon className="w-4 h-4" />
              ) : (
                <BellRing className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono font-bold text-white truncate">
                {toastMessage.title}
              </div>
              <div className="text-[11px] font-mono text-slate-300 truncate">
                {toastMessage.subtitle}
              </div>
            </div>
          </div>
        </div>
      )}
    </TelegramFrameWrapper>
  );
}
