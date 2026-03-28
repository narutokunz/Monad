export const WS_URL           = 'ws://localhost:8080'
export const CONTRACT_ADDRESS = '0x448b7b91620e0C8c94E730b577C7b07322c57d87'
export const CHAIN_ID         = 10143
export const STAKE_ETH        = '0.001'
export const GAS_LIMIT        = 300000n

export const CONTRACT_ABI = [
  'function submit(uint8 choice) payable',
  // Custom errors — needed so ethers can decode revert reasons
  'error RoundNotActive()',
  'error AlreadySubmitted()',
  'error InvalidChoice()',
  'error InsufficientStake()',
  'error RoundAlreadySettled()',
  'error RoundStillActive()',
  'error NoPlayersThisRound()',
]
