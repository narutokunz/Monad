'use strict';

/**
 * listener.js
 * Manual event polling with capped block ranges.
 *
 * Uses a single provider.getLogs() call per interval (all 4 events combined)
 * instead of contract.on() — avoids ethers' internal polling which can
 * request unbounded block ranges and hit 413 / rate-limit errors.
 *
 * Guards:
 *   1. MAX_BLOCKS_PER_POLL — caps the block range to avoid 413
 *   2. seen Set            — deduplicates txHash+logIndex across polls
 */

const { ethers } = require('ethers');

const POLL_INTERVAL_MS  = 12_000;  // poll every 12 seconds
const MAX_BLOCKS_PER_POLL = 40;    // max block range per getLogs call (~40s of Monad blocks)

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function upsertLeaderboard(leaderboard, address, score, choice, moveCount) {
  const key      = address.toLowerCase();
  const existing = leaderboard.find(p => p.address.toLowerCase() === key);
  if (existing) {
    existing.score     = score;
    existing.choice    = choice;
    existing.moveCount = moveCount;
  } else {
    leaderboard.push({ address, score, choice, moveCount });
  }
  leaderboard.sort((a, b) => b.score - a.score);
}

/**
 * @param {import('ethers').Contract}          contract
 * @param {object}                             state
 * @param {{ broadcast: Function }}            wsServer
 * @param {object}                             analyzer
 * @param {number}                             startBlock
 */
function createListener(contract, state, wsServer, analyzer, startBlock) {
  const provider      = contract.runner?.provider ?? contract.runner;
  const iface         = contract.interface;
  const contractAddr  = contract.target ?? contract.address;

  // Build the combined topic list so one getLogs fetches all 4 events
  const eventTopics = [
    iface.getEvent('RoundStarted').topicHash,
    iface.getEvent('MoveMade').topicHash,
    iface.getEvent('RoundSettled').topicHash,
    iface.getEvent('ScoreUpdated').topicHash,
  ];

  const seen          = new Set();
  let   lastBlock     = startBlock - 1;
  let   timer         = null;
  let   polling       = false;

  // ── Deduplication ──────────────────────────────────────────────────────────

  function isDup(log) {
    const key = `${log.transactionHash}-${log.index ?? 0}`;
    if (seen.has(key)) return true;
    seen.add(key);
    if (seen.size > 2_000) {
      seen.delete(seen.values().next().value);
    }
    return false;
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  function handleRoundStarted(parsed, log) {
    const roundId   = parsed.args[0];
    const startTime = parsed.args[1];

    console.log(`\n[ROUND ${roundId}] ═══════════════ NEW ROUND ═══════════════`);
    console.log(`[ROUND ${roundId}] Started at ${new Date(Number(startTime) * 1000).toISOString()}`);

    state.currentRound   = roundId;
    state.roundStartTime = startTime;
    state.pot            = 0n;
    state.playerCount    = 0;
    state.settled        = false;
    state.leaderboard    = [];
    state.isSettling     = false;

    wsServer.broadcast({
      type:        'ROUND_STATE',
      roundId:     Number(roundId),
      timeLeft:    30,
      playerCount: 0,
      pot:         '0.0',
    });
  }

  async function handleMoveMade(parsed, log) {
    const roundId  = parsed.args[0];
    const player   = parsed.args[1];
    const choice   = parsed.args[2];
    const score    = parsed.args[3];

    const choiceNum = Number(choice);
    const scoreNum  = Number(score);

    try {
      const info        = await contract.getRoundInfo(roundId);
      state.pot         = info[1];
      state.playerCount = Number(info[2]);
    } catch (_) {}

    analyzer.recordMove(player, scoreNum, choiceNum);
    const moveCount = analyzer.getMoveCount(player);
    upsertLeaderboard(state.leaderboard, player, scoreNum, choiceNum, moveCount);

    const potFormatted = ethers.formatEther(state.pot);
    console.log(
      `[ROUND ${roundId}] Player ${shortAddr(player)} submitted ${choiceNum} → score: ${scoreNum}` +
      `  |  pot: ${potFormatted} MON`
    );

    const leader = state.leaderboard[0];
    if (leader && leader.address.toLowerCase() === player.toLowerCase()) {
      console.log(`[ROUND ${roundId}] 🏆 New leader: ${shortAddr(leader.address)} (${leader.score} pts)`);
    }

    wsServer.broadcast({
      type:      'MOVE_MADE',
      roundId:   Number(roundId),
      player:    shortAddr(player),
      choice:    choiceNum,
      score:     scoreNum,
      timestamp: Date.now(),
    });

    wsServer.broadcast({
      type:    'LEADERBOARD',
      roundId: Number(roundId),
      players: state.leaderboard.map(p => ({
        address:   p.address,
        score:     p.score,
        choice:    p.choice,
        moveCount: p.moveCount,
      })),
    });
  }

  function handleRoundSettled(parsed, log) {
    const roundId     = parsed.args[0];
    const winner      = parsed.args[1];
    const prize       = parsed.args[2];
    const winnerScore = parsed.args[3];

    const prizeFormatted = ethers.formatEther(prize);
    const scoreNum       = Number(winnerScore);
    const isReal         = winner !== ethers.ZeroAddress;

    state.settled    = true;
    state.isSettling = false;

    if (isReal) {
      analyzer.recordWin(winner, prize);
      analyzer.recordRoundEnd(Number(roundId), prize);

      console.log(`[ROUND ${roundId}] ══════════════ SETTLED ══════════════`);
      console.log(`[ROUND ${roundId}] Winner : ${shortAddr(winner)}`);
      console.log(`[ROUND ${roundId}] Prize  : ${prizeFormatted} MON`);
      console.log(`[ROUND ${roundId}] Score  : ${scoreNum} pts`);
      console.log(`[ROUND ${roundId}] Players: ${state.playerCount}`);

      const g = analyzer.getGlobalStats();
      console.log(`[GLOBAL] Total rounds: ${g.totalRounds}  |  Players: ${g.totalPlayers}  |  Volume: ${g.totalVolumeMON} MON`);
      console.log(`──────────────────────────────────────────────────\n`);
    } else {
      console.log(`[ROUND ${roundId}] Settled (no players — advancing to next round)`);
    }

    wsServer.broadcast({
      type:        'ROUND_SETTLED',
      roundId:     Number(roundId),
      winner:      isReal ? shortAddr(winner) : null,
      prize:       prizeFormatted,
      winnerScore: scoreNum,
    });
  }

  function handleScoreUpdated(parsed, log) {
    const player   = parsed.args[0];
    const newScore = parsed.args[1];
    const choice   = parsed.args[2];

    const key   = player.toLowerCase();
    const entry = state.leaderboard.find(p => p.address.toLowerCase() === key);
    if (entry) {
      entry.score  = Number(newScore);
      entry.choice = Number(choice);
      state.leaderboard.sort((a, b) => b.score - a.score);
    }
  }

  // ── Main poll loop ─────────────────────────────────────────────────────────

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const latest   = await provider.getBlockNumber();
      const fromBlock = lastBlock + 1;
      const toBlock   = Math.min(latest, fromBlock + MAX_BLOCKS_PER_POLL - 1);

      if (fromBlock > toBlock) {
        polling = false;
        return; // no new blocks yet
      }

      const logs = await provider.getLogs({
        address:   contractAddr,
        topics:    [eventTopics],          // OR match across all 4 event topics
        fromBlock,
        toBlock,
      });

      lastBlock = toBlock;

      for (const log of logs) {
        if (isDup(log)) continue;
        let parsed;
        try { parsed = iface.parseLog(log); } catch (_) { continue; }

        switch (parsed.name) {
          case 'RoundStarted':  handleRoundStarted(parsed, log);       break;
          case 'MoveMade':      await handleMoveMade(parsed, log);     break;
          case 'RoundSettled':  handleRoundSettled(parsed, log);       break;
          case 'ScoreUpdated':  handleScoreUpdated(parsed, log);       break;
        }
      }
    } catch (err) {
      const msg = err?.shortMessage ?? err?.message ?? String(err);
      if (
        msg.includes('request limit') ||
        msg.includes('rate limit')    ||
        msg.includes('coalesce')      ||
        msg.includes('413')           ||
        msg.includes('Entity Too Large')
      ) {
        console.warn('[LISTENER] RPC limit — will retry next poll...');
      } else {
        console.error('[LISTENER] Poll error:', msg);
      }
    } finally {
      polling = false;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function start() {
    console.log(
      `[LISTENER] Manual polling every ${POLL_INTERVAL_MS / 1_000}s` +
      ` (max ${MAX_BLOCKS_PER_POLL} blocks/poll) from block ${startBlock}`
    );
    poll(); // immediate first poll
    timer = setInterval(poll, POLL_INTERVAL_MS);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    console.log('[LISTENER] Stopped');
  }

  return { start, stop };
}

module.exports = { createListener };
