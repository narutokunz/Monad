export const WS_URL           = 'ws://localhost:8080'
export const CONTRACT_ADDRESS = '0x448b7b91620e0C8c94E730b577C7b07322c57d87'
export const CHAIN_ID         = 10143
export const STAKE_ETH        = '0.001'
export const GAS_LIMIT        = 300000n

export const CONTRACT_ABI = [
  // Write
  'function submit(uint8 choice) payable',

  // Round views
  'function currentRound() view returns (uint256)',
  'function timeLeft() view returns (uint256)',
  'function getRoundsLeft() view returns (uint256)',
  'function getAccumulatedPot() view returns (uint256)',

  // Game views
  'function currentGame() view returns (uint256)',
  'function roundsInGame() view returns (uint256)',
  'function getGameInfo(uint256 gameId) view returns (uint256 gameId_, uint256 totalPot, address winner, uint32 winnerScore, bool finished)',

  // Custom errors — needed so ethers can decode revert reasons
  'error RoundNotActive()',
  'error AlreadySubmitted()',
  'error InvalidChoice()',
  'error InsufficientStake()',
  'error RoundAlreadySettled()',
  'error RoundStillActive()',
  'error NoPlayersThisRound()',
]
