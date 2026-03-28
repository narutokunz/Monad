'use strict';

/**
 * test-game.js
 * Simulates multiple players submitting moves to MimicWar.
 * Run this while `npm start` is running in another terminal.
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
  'function getRoundInfo(uint256) view returns (uint256 startTime, uint256 pot, uint256 playerCount, bool settled, address winner)',
];

const NUM_PLAYERS = 3;
const STAKE       = ethers.parseEther('0.001');
// Explicit gas limit — avoids eth_estimateGas which some Monad RPCs reject
const GAS_LIMIT   = 300_000n;

function makeProvider() {
  return new ethers.JsonRpcProvider(
    RPC_URL,
    { chainId: 10143, name: 'monad-testnet' },
    { polling: false },
  );
}

async function main() {
  const provider = makeProvider();
  const funder   = new ethers.Wallet(process.env.SETTLER_PRIVATE_KEY, provider);

  console.log('\n══════════════════════════════════════');
  console.log('  MimicWar — Test Game Runner');
  console.log('══════════════════════════════════════');
  console.log('Funder  :', funder.address);
  console.log('Contract:', CONTRACT_ADDRESS);

  // ── 1. Wait for a fresh round with enough time ───────────────────────────
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  let roundId, timeLeft, info;
  console.log('');
  while (true) {
    try {
      roundId  = await contract.currentRound();
      timeLeft = await contract.timeLeft();
      info     = await contract.getRoundInfo(roundId);
      console.log(`Round #${roundId}  |  timeLeft: ${timeLeft}s  |  settled: ${info[3]}`);

      if (!info[3] && timeLeft >= 20n) break; // enough time — proceed

      const waitMsg = timeLeft === 0n && !info[3]
        ? 'Round expired, waiting for backend to settle and start next round...'
        : info[3]
        ? 'Round settled, waiting for next round to start...'
        : `Only ${timeLeft}s left — waiting for next round...`;
      console.log(`  ⏳ ${waitMsg}`);
    } catch (err) {
      console.log(`  ⏳ RPC error (${err.shortMessage ?? err.message ?? 'unknown'}) — retrying...`);
    }
    await new Promise(r => setTimeout(r, 5_000)); // poll every 5s
  }

  // ── 2. Create and fund test wallets ──────────────────────────────────────
  console.log(`\nCreating ${NUM_PLAYERS} test players...`);
  const players = [];
  for (let i = 0; i < NUM_PLAYERS; i++) {
    players.push(ethers.Wallet.createRandom().connect(provider));
  }

  const fundAmount = ethers.parseEther('0.05'); // stake + gas headroom
  console.log(`Funding each player with ${ethers.formatEther(fundAmount)} MON...`);

  for (const player of players) {
    const tx = await funder.sendTransaction({
      to:       player.address,
      value:    fundAmount,
      gasLimit: 21_000n,
    });
    await tx.wait();
    console.log(`  ✔ Funded ${player.address}`);
  }

  // ── 3. Re-check time before submitting ───────────────────────────────────
  const timeLeftNow = await contract.timeLeft();
  if (timeLeftNow < 5n) {
    console.log(`⚠  Ran out of time during funding (${timeLeftNow}s left). Re-run for next round.`);
    return;
  }

  // ── 4. Each player submits a different choice ─────────────────────────────
  const choices = [73, 12, 88];
  console.log('\nSubmitting moves...');

  for (let i = 0; i < players.length; i++) {
    const playerContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, players[i]);
    const choice = choices[i] ?? Math.floor(Math.random() * 100) + 1;
    try {
      const tx = await playerContract.submit(choice, {
        value:    STAKE,
        gasLimit: GAS_LIMIT,
      });
      console.log(`  Player ${i + 1} (${players[i].address.slice(0, 8)}…) submitted ${choice} → tx: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  ✔ Confirmed in block ${receipt.blockNumber}`);
    } catch (err) {
      // Print full error detail for debugging
      console.error(`  ✗ Player ${i + 1} failed:`);
      console.error('    shortMessage:', err.shortMessage);
      console.error('    message     :', err.message?.slice(0, 200));
      console.error('    code        :', err.code);
      if (err.info) console.error('    info        :', JSON.stringify(err.info).slice(0, 300));
    }
  }

  // ── 5. Show updated round state ───────────────────────────────────────────
  const updated = await contract.getRoundInfo(roundId);
  console.log(`\nRound #${roundId} — ${updated[2]} player(s) | pot: ${ethers.formatEther(updated[1])} MON | timeLeft: ${await contract.timeLeft()}s`);
  console.log('\n✔ Done! Watch the backend terminal for live output.');
  console.log('  The backend auto-calls settleRound() when the 30s timer expires.\n');
}

main().catch((err) => {
  console.error('[FATAL]', err.shortMessage ?? err.message);
  process.exit(1);
});
