// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MimicWar — a round-based on-chain game where the most unpredictable player wins
/// @notice Players submit a number 1-100 each round; winner is determined by unpredictability score
contract MimicWar {
    // ─── Constants ───────────────────────────────────────────────────────────────

    uint256 public constant ROUND_DURATION = 30;       // seconds per round
    uint256 public constant MIN_STAKE      = 0.001 ether;
    uint8   public constant HISTORY_SIZE   = 5;        // circular buffer length

    // ─── Custom Errors ────────────────────────────────────────────────────────────

    error RoundNotActive();
    error AlreadySubmitted();
    error InvalidChoice();
    error InsufficientStake();
    error RoundAlreadySettled();
    error RoundStillActive();
    error NoPlayersThisRound();

    // ─── Structs ──────────────────────────────────────────────────────────────────

    /// @dev Per-player behavioral fingerprint, persists across rounds
    struct Fingerprint {
        uint8[5] lastMoves;     // circular buffer of last 5 choices
        uint8    bufferIndex;   // next write position in the circular buffer
        uint8    moveCount;     // total moves ever, capped at 255
        uint32   totalSum;      // sum of all choices ever (for all-time mean)
        uint32   unpredictScore;// current unpredictability score 0-1000
        bool     hasSubmitted;  // submitted in the current round?
        uint8    currentChoice; // choice made in the current round
    }

    struct Round {
        uint256 startTime;
        uint256 pot;
        uint256 playerCount;
        bool    settled;
        address winner;
    }

    // ─── Events ───────────────────────────────────────────────────────────────────

    event RoundStarted(uint256 indexed roundId, uint256 startTime);
    event MoveMade(uint256 indexed roundId, address indexed player, uint8 choice, uint32 score);
    event RoundSettled(uint256 indexed roundId, address indexed winner, uint256 prize, uint32 winnerScore);
    event ScoreUpdated(address indexed player, uint32 newScore, uint8 choice);

    // ─── Storage ──────────────────────────────────────────────────────────────────

    mapping(address => Fingerprint) public fingerprints;
    mapping(uint256 => Round)       public rounds;
    mapping(uint256 => address[])   public roundPlayers;
    uint256 public currentRound;

    // ─── Constructor ──────────────────────────────────────────────────────────────

    constructor() {
        _startNewRound();
    }

    // ─── External: Player Action ─────────────────────────────────────────────────

    /// @notice Submit a choice for the current round
    /// @dev Parallel-safe: each caller writes only to their own Fingerprint slot;
    ///      shared round fields (pot, playerCount) are updated atomically by the EVM.
    /// @param choice A number in [1, 100]
    function submit(uint8 choice) external payable {
        if (choice < 1 || choice > 100) revert InvalidChoice();
        if (msg.value < MIN_STAKE)       revert InsufficientStake();

        Round storage round = rounds[currentRound];
        if (round.settled || block.timestamp >= round.startTime + ROUND_DURATION)
            revert RoundNotActive();

        Fingerprint storage fp = fingerprints[msg.sender];
        if (fp.hasSubmitted) revert AlreadySubmitted();

        // Score is computed from history BEFORE updating it
        uint32 score = _calculateUnpredictability(fp, choice);

        // Update persistent behavioral history
        _updateHistory(fp, choice);

        // Record round-specific state
        fp.unpredictScore = score;
        fp.hasSubmitted   = true;
        fp.currentChoice  = choice;

        // Update round bookkeeping
        round.pot         += msg.value;
        round.playerCount += 1;
        roundPlayers[currentRound].push(msg.sender);

        emit MoveMade(currentRound, msg.sender, choice, score);
        emit ScoreUpdated(msg.sender, score, choice);
    }

    // ─── External: Settlement ────────────────────────────────────────────────────

    /// @notice Settle the current round, pick a winner, and start the next round
    /// @dev Follows CEI: all state changes happen before the external payment call.
    ///      New round is started before paying to prevent re-entrancy from affecting
    ///      round state.
    function settleRound() external {
        uint256 roundId   = currentRound;
        Round storage round = rounds[roundId];

        if (round.settled)                                      revert RoundAlreadySettled();
        if (block.timestamp < round.startTime + ROUND_DURATION) revert RoundStillActive();

        address[] storage players = roundPlayers[roundId];
        if (players.length == 0) revert NoPlayersThisRound();

        // ── Find winner (highest unpredictability score; first occurrence wins ties) ──
        address winner;
        uint32  highestScore;
        uint256 count = players.length;

        for (uint256 i = 0; i < count; ) {
            address player = players[i];
            uint32  score  = fingerprints[player].unpredictScore;
            if (winner == address(0) || score > highestScore) {
                highestScore = score;
                winner       = player;
            }
            unchecked { ++i; }
        }

        uint256 prize = round.pot;

        // ── Effects: mark settled, record winner ──────────────────────────────────
        round.settled = true;
        round.winner  = winner;

        // Reset per-round submission flags for all participants
        for (uint256 i = 0; i < count; ) {
            fingerprints[players[i]].hasSubmitted = false;
            unchecked { ++i; }
        }

        // Start next round BEFORE paying winner (re-entrancy protection)
        _startNewRound();

        // ── Interaction: pay winner ───────────────────────────────────────────────
        // NOTE: If the winner's receive() reverts the entire transaction reverts,
        // rolling back the settled flag. Consider a pull-payment upgrade for
        // adversarial environments.
        (bool ok, ) = winner.call{value: prize}("");
        require(ok, "MimicWar: transfer failed");

        emit RoundSettled(roundId, winner, prize, highestScore);
    }

    // ─── External: View Helpers ──────────────────────────────────────────────────

    /// @notice Returns all players, their unpredictability scores, and their choices for a round
    function getLeaderboard(uint256 roundId)
        external
        view
        returns (
            address[] memory addrs,
            uint32[]  memory scores,
            uint8[]   memory choices
        )
    {
        address[] storage players = roundPlayers[roundId];
        uint256 n = players.length;

        addrs   = new address[](n);
        scores  = new uint32[](n);
        choices = new uint8[](n);

        for (uint256 i = 0; i < n; ) {
            address p  = players[i];
            addrs[i]   = p;
            scores[i]  = fingerprints[p].unpredictScore;
            choices[i] = fingerprints[p].currentChoice;
            unchecked { ++i; }
        }
    }

    /// @notice Returns the full behavioral fingerprint for a player
    function getFingerprint(address player)
        external
        view
        returns (
            uint8[5] memory lastMoves,
            uint8    bufferIndex,
            uint8    moveCount,
            uint32   totalSum,
            uint32   unpredictScore,
            bool     hasSubmitted,
            uint8    currentChoice
        )
    {
        Fingerprint storage fp = fingerprints[player];
        return (
            fp.lastMoves,
            fp.bufferIndex,
            fp.moveCount,
            fp.totalSum,
            fp.unpredictScore,
            fp.hasSubmitted,
            fp.currentChoice
        );
    }

    /// @notice Returns full round data for a given round ID
    function getRoundInfo(uint256 roundId)
        external
        view
        returns (
            uint256 startTime,
            uint256 pot,
            uint256 playerCount,
            bool    settled,
            address winner
        )
    {
        Round storage r = rounds[roundId];
        return (r.startTime, r.pot, r.playerCount, r.settled, r.winner);
    }

    /// @notice Returns seconds remaining in the current round (0 if time has elapsed)
    function timeLeft() external view returns (uint256) {
        uint256 endTime = rounds[currentRound].startTime + ROUND_DURATION;
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }

    // ─── Internal: Score Calculation ─────────────────────────────────────────────

    /// @dev Computes the unpredictability score [0, 1000] from existing history + new choice.
    ///      Called BEFORE _updateHistory so fp reflects only prior moves.
    function _calculateUnpredictability(Fingerprint storage fp, uint8 choice)
        internal
        view
        returns (uint32)
    {
        // First move ever → baseline score
        if (fp.moveCount == 0) return 500;

        uint8 count = fp.moveCount < HISTORY_SIZE ? fp.moveCount : HISTORY_SIZE;

        // ── Component 1: Variance score (0-400) ──────────────────────────────────
        // Mean of the circular buffer (only valid entries)
        uint256 bufSum = 0;
        for (uint8 i = 0; i < count; ) {
            bufSum += fp.lastMoves[i];
            unchecked { ++i; }
        }
        uint256 mean = bufSum / count;

        uint256 varianceAcc = 0;
        for (uint8 i = 0; i < count; ) {
            uint256 val  = fp.lastMoves[i];
            uint256 diff = val > mean ? val - mean : mean - val;
            varianceAcc += diff * diff;
            unchecked { ++i; }
        }
        uint256 variance      = varianceAcc / count;
        uint256 varianceScore = variance > 2500 ? 400 : (variance * 400) / 2500;

        // ── Component 2: Surprise score (0-400) ──────────────────────────────────
        uint256 allTimeMean = fp.totalSum / fp.moveCount; // safe: moveCount > 0
        uint256 choiceVal   = uint256(choice);
        uint256 surprise    = choiceVal > allTimeMean
            ? choiceVal - allTimeMean
            : allTimeMean - choiceVal;
        uint256 surpriseScore = surprise > 49 ? 400 : (surprise * 400) / 49;

        // ── Component 3: Anti-repeat penalty (-200) ───────────────────────────────
        uint256 repeatPenalty = 0;
        uint8 lastIdx = uint8((uint256(fp.bufferIndex) + HISTORY_SIZE - 1) % HISTORY_SIZE);
        if (choice == fp.lastMoves[lastIdx]) {
            repeatPenalty = 200;
        }

        // ── Final: clamp to [0, 1000] ─────────────────────────────────────────────
        uint256 raw = varianceScore + surpriseScore;
        if (raw < repeatPenalty) return 0;
        raw -= repeatPenalty;
        if (raw > 1000) return 1000;
        return uint32(raw);
    }

    // ─── Internal: History Update ────────────────────────────────────────────────

    /// @dev Appends `choice` to the circular buffer and updates summary statistics
    function _updateHistory(Fingerprint storage fp, uint8 choice) internal {
        fp.lastMoves[fp.bufferIndex] = choice;
        fp.bufferIndex = uint8((uint256(fp.bufferIndex) + 1) % HISTORY_SIZE);
        if (fp.moveCount < 255) fp.moveCount++;
        fp.totalSum += uint32(choice); // totalSum accumulates unbounded; moveCount caps at 255
    }

    // ─── Internal: Round Lifecycle ───────────────────────────────────────────────

    /// @dev Increments currentRound and initialises the new Round entry
    function _startNewRound() internal {
        currentRound++;
        rounds[currentRound].startTime = block.timestamp;
        emit RoundStarted(currentRound, block.timestamp);
    }
}
