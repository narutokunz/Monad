import { useState, useEffect, useRef, useCallback } from 'react'
import { ethers } from 'ethers'

import {
  WS_URL,
  CONTRACT_ADDRESS,
  CHAIN_ID,
  STAKE_ETH,
  GAS_LIMIT,
  CONTRACT_ABI,
} from './config.js'

import Header      from './components/Header.jsx'
import WalletModal from './components/WalletModal.jsx'
import JoinScreen  from './screens/JoinScreen.jsx'
import WarScreen   from './screens/WarScreen.jsx'
import EndScreen   from './screens/EndScreen.jsx'

/* ── Utility ── */
function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr ?? '—'
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

/* ── App ───────────────────────────────────────────────────── */
export default function App() {
  /* Screen */
  const [screen, setScreen] = useState('join') // 'join' | 'war' | 'end'

  /* Wallet */
  const [wallet,           setWallet]           = useState(null)
  const [signer,           setSigner]           = useState(null)
  const [contract,         setContract]         = useState(null)
  const [walletModal,      setWalletModal]      = useState(false)
  const [availableWallets, setAvailableWallets] = useState([])

  /* Round data */
  const [roundId,     setRoundId]     = useState(null)
  const [timeLeft,    setTimeLeft]    = useState(null)
  const [pot,         setPot]         = useState(null)
  const [playerCount, setPlayerCount] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [submitted,   setSubmitted]   = useState(false)
  const [myMoves,     setMyMoves]     = useState([])    // last 5 choices
  const [settlement,  setSettlement]  = useState(null)

  /* WebSocket */
  const wsRef        = useRef(null)
  const wsTimerRef   = useRef(null)
  const [wsConnected, setWsConnected] = useState(false)

  /* ── WebSocket ─────────────────────────────────────────── */
  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'ROUND_STATE':
        setRoundId(msg.roundId)
        setTimeLeft(msg.timeLeft)
        setPot(msg.pot)
        setPlayerCount(msg.playerCount)
        break

      case 'MOVE_MADE':
        setPlayerCount(prev => Math.max(prev ?? 0, 1))
        break

      case 'LEADERBOARD':
        setLeaderboard(msg.players ?? [])
        break

      case 'ROUND_SETTLED':
        setSettlement({
          roundId:     msg.roundId,
          winner:      msg.winner,
          winnerScore: msg.winnerScore,
          prize:       msg.prize,
        })
        setScreen('end')
        break

      case 'TICK':
        setTimeLeft(msg.timeLeft)
        break

      default:
        break
    }
  }, [])

  const wsConnect = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState < 2) return   // CONNECTING or OPEN

    const socket = new WebSocket(WS_URL)
    wsRef.current = socket

    socket.onopen = () => {
      clearTimeout(wsTimerRef.current)
      setWsConnected(true)
    }

    socket.onmessage = (e) => {
      try {
        handleMessage(JSON.parse(e.data))
      } catch (_) { /* ignore parse errors */ }
    }

    socket.onclose = () => {
      setWsConnected(false)
      wsTimerRef.current = setTimeout(wsConnect, 3000)
    }

    socket.onerror = () => socket.close()
  }, [handleMessage])

  useEffect(() => {
    wsConnect()
    return () => {
      clearTimeout(wsTimerRef.current)
      wsRef.current?.close()
    }
  }, [wsConnect])

  /* ── Wallet discovery (EIP-6963 + legacy fallback) ──────── */
  function getWalletName(p) {
    if (p?.isMetaMask && !p?.isCoinbaseWallet) return 'MetaMask'
    if (p?.isCoinbaseWallet)                   return 'Coinbase Wallet'
    if (p?.isRabby)                            return 'Rabby'
    if (p?.isTrust || p?.isTrustWallet)        return 'Trust Wallet'
    if (p?.isPhantom)                          return 'Phantom'
    if (p?.isBraveWallet)                      return 'Brave Wallet'
    if (p?.isOkxWallet || p?.isOKExWallet)     return 'OKX Wallet'
    if (p?.isBybit)                            return 'Bybit Wallet'
    return 'Browser Wallet'
  }

  async function discoverWallets() {
    const found = []

    // 1. EIP-6963 — modern standard, works with all major wallets
    const handler = (e) => { if (e.detail) found.push(e.detail) }
    window.addEventListener('eip6963:announceProvider', handler)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    await new Promise(r => setTimeout(r, 150))   // wait for announcements
    window.removeEventListener('eip6963:announceProvider', handler)

    if (found.length > 0) return found

    // 2. Legacy: multiple wallets in window.ethereum.providers[]
    if (window.ethereum?.providers?.length) {
      return window.ethereum.providers.map((p, i) => ({
        info:     { name: getWalletName(p), uuid: String(i), rdns: '', icon: '' },
        provider: p,
      }))
    }

    // 3. Legacy: single window.ethereum
    if (window.ethereum) {
      return [{
        info:     { name: getWalletName(window.ethereum), uuid: 'default', rdns: '', icon: '' },
        provider: window.ethereum,
      }]
    }

    return []
  }

  /* ── Connect to a specific wallet ────────────────────────── */
  const connectToWallet = useCallback(async (walletEntry) => {
    setWalletModal(false)
    const raw = walletEntry.provider
    try {
      const provider = new ethers.BrowserProvider(raw)
      await provider.send('eth_requestAccounts', [])

      // Switch / add Monad testnet
      const net = await provider.getNetwork()
      if (Number(net.chainId) !== CHAIN_ID) {
        try {
          await raw.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + CHAIN_ID.toString(16) }],
          })
        } catch (err) {
          if (err.code === 4902) {
            await raw.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId:        '0x' + CHAIN_ID.toString(16),
                chainName:      'Monad Testnet',
                rpcUrls:        ['https://testnet-rpc.monad.xyz'],
                nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
              }],
            })
          } else throw err
        }
      }

      const fresh = new ethers.BrowserProvider(raw)
      const s     = await fresh.getSigner()
      const addr  = await s.getAddress()
      const c     = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, s)

      setSigner(s)
      setWallet(addr)
      setContract(c)
    } catch (err) {
      alert('Connect failed: ' + (err?.shortMessage ?? err?.message ?? 'Unknown error'))
    }
  }, [])

  /* ── Connect Wallet (entry point) ────────────────────────── */
  const connectWallet = useCallback(async () => {
    const wallets = await discoverWallets()

    if (wallets.length === 0) {
      alert('No EVM wallet detected.\n\nInstall MetaMask, Coinbase Wallet, Rabby, or any EVM-compatible wallet.')
      return
    }

    if (wallets.length === 1) {
      await connectToWallet(wallets[0])   // only one wallet — connect directly
    } else {
      setAvailableWallets(wallets)        // multiple wallets — show picker
      setWalletModal(true)
    }
  }, [connectToWallet])

  /* ── Submit Move ────────────────────────────────────────── */
  const submitMove = useCallback(async (choice) => {
    if (!signer || !contract) throw new Error('Wallet not connected')
    if (submitted)            throw new Error('AlreadySubmitted')

    const tx = await contract.submit(choice, {
      value:    ethers.parseEther(STAKE_ETH),
      gasLimit: GAS_LIMIT,
    })
    await tx.wait()

    setSubmitted(true)
    setMyMoves(prev => {
      const next = [...prev, choice]
      return next.length > 5 ? next.slice(-5) : next
    })
    setScreen('war')
  }, [signer, contract, submitted])

  /* ── Reset Round (called by EndScreen countdown) ─────────── */
  const resetRound = useCallback(() => {
    setSubmitted(false)
    setLeaderboard([])
    setSettlement(null)
    setScreen('join')
  }, [])

  /* ── WS status label ───────────────────────────────────── */
  const wsLabel = wsConnected ? 'War room connected' : 'Reconnecting...'

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="flex flex-col min-h-screen bg-white text-black font-sans">

      {walletModal && (
        <WalletModal
          wallets={availableWallets}
          onSelect={connectToWallet}
          onClose={() => setWalletModal(false)}
        />
      )}

      <Header
        roundId={roundId}
        wallet={wallet}
        onConnect={connectWallet}
        shortAddr={shortAddr}
      />

      {/* Main content area */}
      <main className="flex flex-col flex-1 overflow-y-auto">
        {screen === 'join' && (
          <JoinScreen
            timeLeft={timeLeft}
            pot={pot}
            playerCount={playerCount}
            wallet={wallet}
            submitted={submitted}
            onSubmit={submitMove}
          />
        )}

        {screen === 'war' && (
          <WarScreen
            timeLeft={timeLeft}
            pot={pot}
            playerCount={playerCount}
            leaderboard={leaderboard}
            wallet={wallet}
            shortAddr={shortAddr}
          />
        )}

        {screen === 'end' && (
          <EndScreen
            settlement={settlement}
            myMoves={myMoves}
            roundId={roundId}
            leaderboard={leaderboard}
            onNextRound={resetRound}
            shortAddr={shortAddr}
            wallet={wallet}
          />
        )}
      </main>

      {/* ── Status bar ── */}
      <footer className="flex justify-between items-center px-8 py-4 border-t-4 border-black bg-gradient-to-r from-cyan-50 to-white flex-shrink-0 shadow-md">
        <span className="flex items-center gap-3 font-mono text-xs font-black text-black uppercase tracking-widest">
          <span
            className={[
              'inline-block w-3 h-3 rounded-full',
              wsConnected ? 'bg-lime-500 animate-pulse shadow-lg' : 'bg-gray-400',
            ].join(' ')}
          />
          <span className="drop-shadow-sm">
            {wsLabel}
          </span>
        </span>
        <span className="font-mono text-xs font-black text-black uppercase tracking-widest drop-shadow-sm">
          {wallet ? `Monad · ${shortAddr(wallet)}` : 'Monad Testnet'}
        </span>
      </footer>

    </div>
  )
}
