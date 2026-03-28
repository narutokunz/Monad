'use strict';

/**
 * roundManager.js
 * Polls timeLeft() every 5 seconds. When it returns 0 and the round has
 * not yet been settled on-chain, sends a settleRound() transaction.
 *
 * Uses a signer wallet funded with MON to pay for gas.
 */

const POLL_INTERVAL_MS = 5_000; // 5 seconds

/**
 * @param {import('ethers').Contract} contract        read-only (provider)
 * @param {import('ethers').Contract} signerContract  write (signer)
 * @param {object}                    state            shared mutable state
 */
function createRoundManager(contract, signerContract, state) {
  let timer      = null;
  let lastAttemptRound = -1n; // prevent double-settling same round

  async function checkAndSettle() {
    // Skip if we are mid-settlement already
    if (state.isSettling) return;

    try {
      const timeLeft = await contract.timeLeft();

      if (timeLeft > 0n) {
        // Round still active — nothing to do
        return;
      }

      // Time is up — check whether it has already been settled
      if (state.settled) return;

      // Guard against re-trying the same round on consecutive polls
      if (state.currentRound === lastAttemptRound) return;

      // Double-check on-chain to avoid sending a doomed tx
      const info = await contract.getRoundInfo(state.currentRound);
      const onChainSettled  = info[3];   // bool settled
      const onChainPlayers  = info[2];   // uint256 playerCount

      if (onChainSettled) {
        state.settled = true;
        return;
      }

      if (onChainPlayers === 0n || Number(onChainPlayers) === 0) {
        console.log(`[ROUND MANAGER] Round ${state.currentRound} has 0 players — settling to advance to next round...`);
      }

      // ── Fire the settlement transaction ──────────────────────────────────────
      state.isSettling    = true;
      lastAttemptRound    = state.currentRound;

      console.log(`[ROUND MANAGER] Round ${state.currentRound} has expired — sending settleRound()...`);

      const tx = await signerContract.settleRound({ gasLimit: 1_000_000n });
      console.log(`[ROUND MANAGER] tx submitted → ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(
        `[ROUND MANAGER] Confirmed in block ${receipt.blockNumber}` +
        `  |  gas used: ${receipt.gasUsed.toLocaleString()}`
      );

    } catch (err) {
      state.isSettling = false;

      const msg = err.shortMessage ?? err.message ?? String(err);

      if (msg.includes('RoundAlreadySettled')) {
        console.log(`[ROUND MANAGER] Round ${state.currentRound} already settled (race condition) — OK`);
        state.settled = true;
        return;
      }

      if (msg.includes('RoundStillActive')) {
        // Chain disagrees — our local clock was wrong; ignore
        return;
      }

      if (msg.includes('NoPlayersThisRound')) {
        console.warn(`[ROUND MANAGER] No players — skipping settlement for round ${state.currentRound}`);
        state.settled = true;
        return;
      }

      // Unexpected error — log it and let the next poll retry
      console.error(`[ROUND MANAGER] Error during settlement: ${msg}`);
    }
  }

  function start() {
    console.log(`[ROUND MANAGER] Started — polling timeLeft() every ${POLL_INTERVAL_MS / 1_000}s`);
    // Immediate first check, then interval
    checkAndSettle();
    timer = setInterval(checkAndSettle, POLL_INTERVAL_MS);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
      console.log('[ROUND MANAGER] Stopped');
    }
  }

  return { start, stop };
}

module.exports = { createRoundManager };
