// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  MimicWar — 5-Round Game System
/// @notice Players submit a number 1-100 each round; scores accumulate across
///         5 rounds; the most unpredictable player across the whole game wins
///         the combined pot.
contract MimicWar {

    // ─── Constants ────────────────────────────────────────────────────────────────

    uint256 public constant TOTAL_ROUNDS   = 5;
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

    /// @dev Per-player behavioral fingerprint — persists across all rounds and games
    struct Fingerprint {
        uint8[5] lastMoves;      // circular buffer of last 5 choices
        uint8    bufferIndex;    // next write position in circular buffer
        uint8    moveCount;      // total moves ever, capped at 255
        uint32   totalSum;       // sum of all choices (for all-time mean)
        uint32   unpredictScore; // current unpredictability score 0-1000
        bool     hasSubmitted;   // submitted in the current round?
        uint8    currentChoice;  // choice made in the current round
    }

    struct Round {
        uint256 startTime;
        uint256 pot;
        uint256 playerCount;
        bool    settled;
        address winner;          // highest scorer this round (informational; prize deferred to game end)
    }

    struct Game {
        uint256 gameId;
        uint256 totalPot;
        address winner;
        uint32  winnerScore;
        bool    finished;
    }

    // ─── Events ───────────────────────────────────────────────────────────────────

    event RoundStarted(uint256 indexed roundId, uint256 startTime);
    event MoveMade(uint256 indexed roundId, address indexed player, uint8 choice, uint32 score);
    event RoundSettled(uint256 indexed roundId, address indexed winner, uint256 prize, uint32 winnerScore);
    event ScoreUpdated(address indexed player, uint32 newScore, uint8 choice);
    event RoundCompleted(uint256 indexed gameId, uint256 roundNumber, uint256 roundPot);
    event GameStarted(uint256 indexed gameId);
    event GameSettled(uint256 indexed gameId, address winner, uint256 totalPot, uint32 winnerScore);

    // ─── Storage ──────────────────────────────────────────────────────────────────

    mapping(address => Fingerprint)  public fingerprints;
    mapping(uint256 => Round)        public rounds;
    mapping(uint256 => address[])    public roundPlayers;
    mapping(uint256 => Game)         public games;

    // Per-game unique player list (used by _settleGame to find the overall winner)
    mapping(uint256 => address[])                    private gamePlayers;
    mapping(uint256 => mapping(address => bool))     private gamePlayerSeen;

    uint256 public currentRound;
    uint256 public currentGame;
    uint256 public roundsInGame;    // rounds completed so far in current game (0-5)
    uint256 public accumulatedPot;  // total MON collected across rounds in current game

    // ─── Constructor ──────────────────────────────────────────────────────────────

    constructor() {
        currentGame = 1;
        games[1].gameId = 1;
        emit GameStarted(1);
        _startNewRound();
    }

    // ─── External: Player Action ──────────────────────────────────────────────────

    /// @notice Submit a choice for the current round
    /// @param  choice A number in [1, 100]
    function submit(uint8 choice) external payable {
        if (choice < 1 || choice > 100) revert InvalidChoice();
        if (msg.value < MIN_STAKE)       revert InsufficientStake();

        Round storage round = rounds[currentRound];
        if (round.settled || block.timestamp >= round.startTime + ROUND_DURATION)
            revert RoundNotActive();

        Fingerprint storage fp = fingerprints[msg.sender];
        if (fp.hasSubmitted) revert AlreadySubmitted();

        // Score computed from history BEFORE updating it
        uint32 score = _calculateUnpredictability(fp, choice);
        _updateHistory(fp, choice);

        fp.unpredictScore = score;
        fp.hasSubmitted   = true;
        fp.currentChoice  = choice;

        round.pot         += msg.value;
        round.playerCount += 1;
        roundPlayers[currentRound].push(msg.sender);

        // Track unique players per game for _settleGame()
        if (!gamePlayerSeen[currentGame][msg.sender]) {
            gamePlayerSeen[currentGame][msg.sender] = true;
            gamePlayers[currentGame].push(msg.sender);
        }

        emit MoveMade(currentRound, msg.sender, choice, score);
        emit ScoreUpdated(msg.sender, score, choice);
    }

    // ─── External: Settlement ─────────────────────────────────────────────────────

    /// @notice Settle the current round and advance to the next one (or end the game)
    /// @dev    Follows CEI: all state changes before external calls.
    function settleRound() external {
        uint256 roundId     = currentRound;
        Round storage round = rounds[roundId];

        if (round.settled)                                       revert RoundAlreadySettled();
        if (block.timestamp < round.startTime + ROUND_DURATION)  revert RoundStillActive();

        address[] storage players = roundPlayers[roundId];

        // ── Empty round path ──────────────────────────────────────────────────────
        if (players.length == 0) {
            round.settled = true;
            roundsInGame++;
            emit RoundSettled(roundId, address(0), 0, 0);

            if (roundsInGame >= TOTAL_ROUNDS) {
                _settleGame();
            } else {
                emit RoundCompleted(currentGame, roundsInGame, 0);
                _startNewRound();
            }
            return;
        }

        // ── Find round's top scorer (informational — prize deferred to game end) ──
        address roundWinner;
        uint32  highestScore;
        uint256 count = players.length;

        for (uint256 i = 0; i < count; ) {
            address player = players[i];
            uint32  score  = fingerprints[player].unpredictScore;
            if (roundWinner == address(0) || score > highestScore) {
                highestScore = score;
                roundWinner  = player;
            }
            unchecked { ++i; }
        }

        // ── Effects ───────────────────────────────────────────────────────────────
        round.settled = true;
        round.winner  = roundWinner;

        uint256 roundPot = round.pot;
        accumulatedPot  += roundPot;
        roundsInGame++;

        // Reset per-round submission flags for all round participants
        for (uint256 i = 0; i < count; ) {
            fingerprints[players[i]].hasSubmitted = false;
            unchecked { ++i; }
        }

        emit RoundSettled(roundId, roundWinner, roundPot, highestScore);

        if (roundsInGame >= TOTAL_ROUNDS) {
            _settleGame();
        } else {
            emit RoundCompleted(currentGame, roundsInGame, roundPot);
            _startNewRound();
        }
    }

    // ─── Internal: Game Settlement ────────────────────────────────────────────────

    /// @dev Finds the overall game winner (highest unpredictScore across all
    ///      game participants), resets game state, then pays — CEI order.
    function _settleGame() internal {
        uint256 gameId = currentGame;
        address[] storage allPlayers = gamePlayers[gameId];
        uint256 count = allPlayers.length;

        // ── No players in any round of this game ──────────────────────────────────
        if (count == 0) {
            games[gameId].finished = true;
            emit GameSettled(gameId, address(0), 0, 0);

            roundsInGame   = 0;
            accumulatedPot = 0;
            currentGame++;
            games[currentGame].gameId = currentGame;
            emit GameStarted(currentGame);
            _startNewRound();
            return;
        }

        // ── Find player with highest overall unpredictScore ───────────────────────
        address gameWinner;
        uint32  highestScore;

        for (uint256 i = 0; i < count; ) {
            address player = allPlayers[i];
            uint32  score  = fingerprints[player].unpredictScore;
            if (gameWinner == address(0) || score > highestScore) {
                highestScore = score;
                gameWinner   = player;
            }
            unchecked { ++i; }
        }

        uint256 prize = accumulatedPot;

        // ── Effects: reset all game state BEFORE paying ───────────────────────────
        games[gameId].finished    = true;
        games[gameId].winner      = gameWinner;
        games[gameId].totalPot    = prize;
        games[gameId].winnerScore = highestScore;

        roundsInGame   = 0;
        accumulatedPot = 0;
        currentGame++;
        games[currentGame].gameId = currentGame;

        emit GameSettled(gameId, gameWinner, prize, highestScore);
        emit GameStarted(currentGame);
        _startNewRound();

        // ── Interaction: pay winner after all state is reset ──────────────────────
        (bool ok, ) = gameWinner.call{value: prize}("");
        require(ok, "MimicWar: transfer failed");
    }

    // ─── External: View Functions ─────────────────────────────────────────────────

    /// @notice Leaderboard for a given round
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

    /// @notice Full behavioral fingerprint for a player
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

    /// @notice Round data for a given round ID
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

    /// @notice Game data for a given game ID
    function getGameInfo(uint256 gameId)
        external
        view
        returns (
            uint256 gameId_,
            uint256 totalPot,
            address winner,
            uint32  winnerScore,
            bool    finished
        )
    {
        Game storage g = games[gameId];
        return (g.gameId, g.totalPot, g.winner, g.winnerScore, g.finished);
    }

    /// @notice Seconds remaining in the current round
    function timeLeft() external view returns (uint256) {
        uint256 endTime = rounds[currentRound].startTime + ROUND_DURATION;
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }

    /// @notice Rounds remaining in the current game (5 at game start, 0 after last round settles)
    function getRoundsLeft() external view returns (uint256) {
        return TOTAL_ROUNDS - roundsInGame;
    }

    /// @notice Total MON accumulated across all rounds in the current game
    function getAccumulatedPot() external view returns (uint256) {
        return accumulatedPot;
    }

    // ─── Internal: Score Calculation ─────────────────────────────────────────────

    function _calculateUnpredictability(Fingerprint storage fp, uint8 choice)
        internal
        view
        returns (uint32)
    {
        if (fp.moveCount == 0) return 500;

        uint8 count = fp.moveCount < HISTORY_SIZE ? fp.moveCount : HISTORY_SIZE;

        // Component 1: Variance score (0-400)
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

        // Component 2: Surprise score (0-400)
        uint256 allTimeMean   = fp.totalSum / fp.moveCount;
        uint256 choiceVal     = uint256(choice);
        uint256 surprise      = choiceVal > allTimeMean
            ? choiceVal - allTimeMean
            : allTimeMean - choiceVal;
        uint256 surpriseScore = surprise > 49 ? 400 : (surprise * 400) / 49;

        // Component 3: Anti-repeat penalty (0 or 200)
        uint256 repeatPenalty = 0;
        uint8 lastIdx = uint8((uint256(fp.bufferIndex) + HISTORY_SIZE - 1) % HISTORY_SIZE);
        if (choice == fp.lastMoves[lastIdx]) repeatPenalty = 200;

        uint256 raw = varianceScore + surpriseScore;
        if (raw < repeatPenalty) return 0;
        raw -= repeatPenalty;
        if (raw > 1000) return 1000;
        return uint32(raw);
    }

    // ─── Internal: History Update ─────────────────────────────────────────────────

    function _updateHistory(Fingerprint storage fp, uint8 choice) internal {
        fp.lastMoves[fp.bufferIndex] = choice;
        fp.bufferIndex = uint8((uint256(fp.bufferIndex) + 1) % HISTORY_SIZE);
        if (fp.moveCount < 255) fp.moveCount++;
        fp.totalSum += uint32(choice);
    }

    // ─── Internal: Round Lifecycle ────────────────────────────────────────────────

    function _startNewRound() internal {
        currentRound++;
        rounds[currentRound].startTime = block.timestamp;
        emit RoundStarted(currentRound, block.timestamp);
    }
}
