'use strict';

/**
 * test-game.js
 * Plays a full 5-round MimicWar game with 3 simulated players.
 * Run while `npm start` is running in another terminal.
 *
 * Usage:  node test-game.js
 */

require('dotenv').config();
const { ethers } = require('ethers');

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const RPC_URL          = process.env.MONAD_RPC_URL ?? 'https://testnet-rpc.monad.xyz';

const ABI = [
  'function submit(uint8 choice) payable',
  'function timeLeft() view returns (uint256)',
  'function currentRound() view returns (uint256)',
  'function currentGame() view returns (uint256)',
  'function roundsInGame() view returns (uint256)',
  'function getRoundsLeft() view returns (uint256)',
  'function getAccumulatedPot() view returns (uint256)',
  'function getRoundInfo(uint256) view returns (uint256 startTime, uint256 pot, uint256 playerCount, bool settled, address winner)',
  'function getGameInfo(uint256) view returns (uint256 gameId_, uint256 totalPot, address winner, uint32 winnerScore, bool finished)',
];

const STAKE     = ethers.parseEther('0.001');
const GAS_LIMIT = 300_000n;

// Different choices per round so scores are interesting
const ROUND_CHOICES = [
  [73, 12, 88],   // Round 1
  [25, 91, 47],   // Round 2
  [60, 33, 78],   // Round 3
  [15, 82, 44],   // Round 4
  [99,  5, 55],   // Round 5
];

function makeProvider() {
  return new ethers.JsonRpcProvider(
    RPC_URL,
    { chainId: 10143, name: 'monad-testnet' },
    { polling: false },
  );
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForFreshRound(contract, minSeconds = 20n) {
  while (true) {
    try {
      // Sequential calls — avoid burst that triggers QuickNode rate limiter
      const roundId   = await contract.currentRound();  await sleep(400);
      const timeLeft  = await contract.timeLeft();       await sleep(400);
      const gameId    = await contract.currentGame();    await sleep(400);
      const roundsLeft = await contract.getRoundsLeft(); await sleep(400);
      const info      = await contract.getRoundInfo(roundId);

      console.log(
        `  Round #${roundId} | Game #${gameId} | Round ${5 - Number(roundsLeft) + 1}/5 | ` +
        `timeLeft: ${timeLeft}s | settled: ${info[3]}`
      );
      if (!info[3] && timeLeft >= minSeconds) return { roundId, gameId, roundsLeft };
      const msg = timeLeft === 0n && !info[3]
        ? 'waiting for backend to settle...'
        : info[3]
        ? 'round settled, waiting for next...'
        : `only ${timeLeft}s left, waiting...`;
      console.log(`    ⏳ ${msg}`);
    } catch (err) {
      console.log(`    ⏳ RPC error — retrying... (${err.shortMessage ?? err.message})`);
    }
    await sleep(6_000);
  }
}

async function main() {
  const provider = makeProvider();
  const funder   = new ethers.Wallet(process.env.SETTLER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║     MimicWar — 5-Round Game Test Runner          ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`Funder  : ${funder.address}`);
  console.log(`Contract: ${CONTRACT_ADDRESS}\n`);

  // ── Create 3 persistent test wallets ──────────────────────────────────────
  const players = [
    new ethers.Wallet('0x1111111111111111111111111111111111111111111111111111111111111111', provider),
    new ethers.Wallet('0x2222222222222222222222222222222222222222222222222222222222222222', provider),
    new ethers.Wallet('0x3333333333333333333333333333333333333333333333333333333333333333', provider),
  ];

  // ── Check balances, fund if needed ────────────────────────────────────────
  console.log('Checking player balances...');
  const fundAmount = ethers.parseEther('0.05');
  for (let i = 0; i < players.length; i++) {
    const bal = await provider.getBalance(players[i].address);
    if (bal < ethers.parseEther('0.01')) {
      process.stdout.write(`  Funding player ${i + 1} (${players[i].address.slice(0, 8)}…)... `);
      const tx = await funder.sendTransaction({ to: players[i].address, value: fundAmount, gasLimit: 21_000n });
      await tx.wait();
      console.log('✔');
    } else {
      console.log(`  Player ${i + 1} (${players[i].address.slice(0, 8)}…) has ${ethers.formatEther(bal)} MON ✔`);
    }
  }

  // ── Play up to 5 rounds ───────────────────────────────────────────────────
  let startGame = null;

  for (let roundNum = 1; roundNum <= 5; roundNum++) {
    console.log(`\n${'─'.repeat(52)}`);
    console.log(`ROUND ${roundNum}/5`);
    console.log('─'.repeat(52));

    // Wait for a round with enough time
    const { roundId, gameId, roundsLeft } = await waitForFreshRound(contract, 20n);

    // On first round, record which game we're in
    if (startGame === null) {
      startGame = gameId;
      console.log(`\n  Starting game #${gameId}`);
    }

    // If game changed mid-test, keep going (backend settled early)
    console.log(`  Submitting in round #${roundId} (game #${gameId})...`);

    const choices = ROUND_CHOICES[roundNum - 1];
    for (let i = 0; i < players.length; i++) {
      const playerContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, players[i]);
      const choice = choices[i];
      let retries = 3;
      while (retries > 0) {
        try {
          const tx = await playerContract.submit(choice, { value: STAKE, gasLimit: GAS_LIMIT });
          console.log(`  Player ${i + 1} submitted ${choice} → tx: ${tx.hash.slice(0, 18)}…`);
          break; // sent successfully — don't wait for receipt to avoid polling
        } catch (err) {
          const reason = err.shortMessage ?? err.message ?? '';
          if (reason.includes('AlreadySubmitted')) {
            console.log(`  Player ${i + 1} already submitted — skipping`);
            break;
          } else if (reason.includes('coalesce') || reason.includes('rate limit') || reason.includes('limit reached')) {
            retries--;
            console.log(`  Player ${i + 1} rate limited — waiting 4s (${retries} retries left)...`);
            await sleep(4_000);
          } else {
            console.error(`  Player ${i + 1} FAILED: ${reason.slice(0, 120)}`);
            break;
          }
        }
      }
      await sleep(5_000); // 5s gap between each player to avoid rate limits
    }

    const pot = await contract.getAccumulatedPot();
    console.log(`  Accumulated pot so far: ${ethers.formatEther(pot)} MON`);

    if (roundNum < 5) {
      console.log('\n  Waiting for backend to settle this round and start the next...');
      // Wait until roundsInGame increases (backend settled)
      const prevRoundsIn = 5 - Number(roundsLeft);
      while (true) {
        await sleep(10_000); // wait 10s between checks to stay under rate limit
        try {
          const newRoundsIn = Number(await contract.roundsInGame());
          if (newRoundsIn > prevRoundsIn || newRoundsIn === 0) break;
          process.stdout.write('.');
        } catch (_) {}
      }
      console.log('');
    }
  }

  // ── Wait for final game settlement ────────────────────────────────────────
  console.log(`\n${'═'.repeat(52)}`);
  console.log('All 5 rounds submitted — waiting for game settlement...');
  console.log('═'.repeat(52));

  while (true) {
    await sleep(8_000);
    try {
      const gameId = startGame ?? (await contract.currentGame()) - 1n;
      const info   = await contract.getGameInfo(gameId);
      if (info.finished) {
        console.log('\n✔ GAME SETTLED!');
        console.log(`  Game     : #${info.gameId_}`);
        console.log(`  Winner   : ${info.winner}`);
        console.log(`  Prize    : ${ethers.formatEther(info.totalPot)} MON`);
        console.log(`  Score    : ${info.winnerScore} pts`);
        break;
      }
      const roundsIn = await contract.roundsInGame();
      process.stdout.write(`  Rounds settled: ${roundsIn}/5... `);
    } catch (err) {
      process.stdout.write('(RPC error — retrying) ');
    }
  }

  console.log('\n✔ Full game test complete! Check the frontend end screen.\n');
}

main().catch((err) => {
  console.error('[FATAL]', err.shortMessage ?? err.message ?? err);
  process.exit(1);
});
