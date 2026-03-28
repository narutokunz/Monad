'use strict';

/**
 * index.js
 * MimicWar backend — entry point.
 *
 * Start order:
 *   1. Load env & build ethers provider / signer / contracts
 *   2. Hydrate state from current on-chain round
 *   3. Start WebSocket server (clients can connect immediately)
 *   4. Start event listener
 *   5. Start round manager (auto-settler)
 */

require('dotenv').config();

const { ethers } = require('ethers');
const { createAnalyzer }     = require('./analyzer');
const { createWsServer }     = require('./wsServer');
const { createListener }     = require('./listener');
const { createRoundManager } = require('./roundManager');

// ─── Minimal ABI (only what the backend uses) ─────────────────────────────────

const CONTRACT_ABI = [
  // Events
  'event RoundStarted(uint256 indexed roundId, uint256 startTime)',
  'event MoveMade(uint256 indexed roundId, address indexed player, uint8 choice, uint32 score)',
  'event RoundSettled(uint256 indexed roundId, address indexed winner, uint256 prize, uint32 winnerScore)',
  'event ScoreUpdated(address indexed player, uint32 newScore, uint8 choice)',

  // View functions
  'function currentRound() external view returns (uint256)',
  'function timeLeft() external view returns (uint256)',
  'function getRoundInfo(uint256 roundId) external view returns (uint256 startTime, uint256 pot, uint256 playerCount, bool settled, address winner)',
  'function getLeaderboard(uint256 roundId) external view returns (address[], uint32[], uint8[])',
  'function getFingerprint(address player) external view returns (uint8[5] lastMoves, uint8 bufferIndex, uint8 moveCount, uint32 totalSum, uint32 unpredictScore, bool hasSubmitted, uint8 currentChoice)',

  // Write functions (called by settler wallet only)
  'function settleRound() external',
];

// ─── Validation ───────────────────────────────────────────────────────────────

function assertEnv() {
  const required = ['CONTRACT_ADDRESS', 'SETTLER_PRIVATE_KEY'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[FATAL] Missing required env variables: ${missing.join(', ')}`);
    console.error('[FATAL] Copy .env.example → .env and fill in your values.');
    process.exit(1);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function bootstrap() {
  assertEnv();

  const rpcUrl  = process.env.MONAD_RPC_URL ?? 'https://testnet-rpc.monad.xyz';
  const wsPort  = parseInt(process.env.WS_PORT ?? '8080', 10);
  const chainId = 10143; // Monad testnet

  // ── Provider (read-only) ──────────────────────────────────────────────────────
  // Monad testnet does not support eth_newFilter, so we force polling mode
  // which uses eth_getLogs instead — fully supported by Monad.
  const provider = new ethers.JsonRpcProvider(
    rpcUrl,
    { chainId, name: 'monad-testnet' },
    { polling: false },   // listener.js does its own manual polling
  );

  // ── Signer (settler wallet) ───────────────────────────────────────────────────
  const signer = new ethers.Wallet(process.env.SETTLER_PRIVATE_KEY, provider);

  // ── Contracts ─────────────────────────────────────────────────────────────────
  const contract       = new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  const signerContract = new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  // ── Verify connectivity ───────────────────────────────────────────────────────
  const network      = await provider.getNetwork();
  const startBlock   = await provider.getBlockNumber(); // only process events from here forward
  console.log(`[INIT] Connected to chain ID ${network.chainId} at block ${startBlock}`);

  if (Number(network.chainId) !== chainId) {
    console.warn(`[WARN] Expected chain ${chainId} but got ${network.chainId} — proceeding anyway`);
  }

  // ── Hydrate initial round state from chain ────────────────────────────────────
  const roundId = await contract.currentRound();
  const info    = await contract.getRoundInfo(roundId);

  /** @type {{ currentRound: bigint, roundStartTime: bigint, pot: bigint, playerCount: number, settled: boolean, leaderboard: object[], isSettling: boolean }} */
  const state = {
    currentRound:  roundId,
    roundStartTime: info[0],   // startTime as bigint
    pot:            info[1],   // pot in wei as bigint
    playerCount:    Number(info[2]),
    settled:        info[3],   // bool
    leaderboard:    [],
    isSettling:     false,
  };

  // ── Hydrate leaderboard for the current round (if it has players) ─────────────
  if (!state.settled && state.playerCount > 0) {
    try {
      const [addrs, scores, choices] = await contract.getLeaderboard(roundId);
      for (let i = 0; i < addrs.length; i++) {
        state.leaderboard.push({
          address:   addrs[i],
          score:     Number(scores[i]),
          choice:    Number(choices[i]),
          moveCount: 0, // unknown until analyzer catches up
        });
      }
      state.leaderboard.sort((a, b) => b.score - a.score);
    } catch (_) {
      // Non-fatal — leaderboard will fill as events arrive
    }
  }

  // ── Settler balance check ─────────────────────────────────────────────────────
  const settlerBalance = await provider.getBalance(signer.address);
  const balanceMON     = ethers.formatEther(settlerBalance);
  if (settlerBalance < ethers.parseEther('0.01')) {
    console.warn(`[WARN] Settler wallet ${signer.address} has only ${balanceMON} MON — top up to ensure settlements work`);
  }

  // ── Modules ───────────────────────────────────────────────────────────────────
  const analyzer    = createAnalyzer();
  const wsServer    = createWsServer(wsPort, state, analyzer);
  const listener    = createListener(contract, state, wsServer, analyzer, startBlock);
  const roundMgr    = createRoundManager(contract, signerContract, state);

  // ── Banner ────────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║       M I M I C W A R  —  W A R  R O O M        ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  RPC       : ${rpcUrl}`);
  console.log(`  Chain ID  : ${chainId} (Monad Testnet)`);
  console.log(`  Contract  : ${process.env.CONTRACT_ADDRESS}`);
  console.log(`  Settler   : ${signer.address}  (${balanceMON} MON)`);
  console.log(`  WS port   : ${wsPort}`);
  console.log(`  Round     : #${roundId}  (${state.playerCount} players, pot: ${ethers.formatEther(state.pot)} MON)`);
  console.log('──────────────────────────────────────────────────\n');

  // ── Start everything ──────────────────────────────────────────────────────────
  listener.start();
  roundMgr.start();

  // ── Graceful shutdown ─────────────────────────────────────────────────────────
  function shutdown(signal) {
    console.log(`\n[SHUTDOWN] Received ${signal} — cleaning up...`);
    listener.stop();
    roundMgr.stop();
    provider.destroy();
    process.exit(0);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[FATAL] Bootstrap failed:', err);
  process.exit(1);
});

// Prevent rate-limit / transient RPC errors from crashing the process
process.on('unhandledRejection', (reason) => {
  const msg = reason?.shortMessage ?? reason?.message ?? String(reason);
  if (msg.includes('request limit') || msg.includes('rate limit') || msg.includes('coalesce')) {
    console.warn('[RPC] Rate limit hit — waiting for next poll cycle...');
    return;
  }
  console.error('[UNHANDLED REJECTION]', msg);
});
