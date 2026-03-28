import { useEffect, useState } from 'react'
import Leaderboard from '../components/Leaderboard.jsx'
import MoveGraph   from '../components/MoveGraph.jsx'

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'

function isNoWinner(addr) {
  if (!addr) return true
  return addr.toLowerCase() === NULL_ADDRESS.toLowerCase()
}

export default function EndScreen({
  settlement,
  myMoves,
  roundId,
  leaderboard,
  onNextRound,
  shortAddr,
  wallet,
}) {
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    setCountdown(5)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          onNextRound()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [settlement, onNextRound])

  const noWinner = isNoWinner(settlement?.winner)
  const isMyWin = settlement?.winner?.toLowerCase() === wallet?.toLowerCase()

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-12 max-w-[700px] mx-auto w-full relative overflow-hidden">
      
      {/* Animated background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
      </div>

      {/* ── Round Complete Header ── */}
      <div className="text-center mb-4 relative z-10 animate-in">
        <div className="text-lg font-black text-cyan-600 uppercase tracking-widest mb-4 border-b-4 border-cyan-600 pb-3 drop-shadow-lg">
          Round {roundId} Complete
        </div>
      </div>

      {/* ── Winner Card ── */}
      {noWinner ? (
        <div className="card w-full text-center py-16 border-3 border-black bg-white relative z-10 shadow-2xl">
          <p className="text-2xl font-black text-black uppercase tracking-wider drop-shadow-sm">No Submissions This Round</p>
          <p className="text-sm font-bold text-black mt-2">Better luck next time!</p>
        </div>
      ) : (
        <div className={`card w-full border-3 relative z-10 shadow-2xl transition-all ${isMyWin ? 'border-cyan-600 bg-gradient-to-br from-white to-cyan-50 shadow-glow-lg' : 'border-black bg-white'}`}>
          <div className="text-center mb-10">
            <div className="text-8xl mb-4 animate-pulse drop-shadow-lg"></div>
            <h2 className="text-4xl font-black text-black mb-3 uppercase tracking-wider drop-shadow-sm">
              {isMyWin ? 'YOU WON!' : 'Winner'}
            </h2>
          </div>

          {/* Winner address */}
          <div className="text-center mb-10 py-8 bg-gradient-to-r from-cyan-100 to-cyan-50 border-3 border-black transform -rotate-1 hover:rotate-0 transition-transform shadow-md">
            <p className="text-xs font-black text-black uppercase tracking-widest mb-3 drop-shadow-sm">Winning Address</p>
            <p className="font-mono text-xl font-black text-cyan-600 drop-shadow-sm">
              {shortAddr ? shortAddr(settlement.winner) : settlement?.winner}
            </p>
          </div>

          {/* Score and Prize - Large and Clear */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="text-center p-6 bg-white border-3 border-black shadow-lg hover:shadow-xl transition-all transform hover:scale-105">
              <p className="text-xs font-black text-black uppercase tracking-widest mb-4 drop-shadow-sm">Winner Score</p>
              <p className="text-5xl font-black bg-gradient-to-r from-cyan-600 to-cyan-700 bg-clip-text text-transparent font-mono drop-shadow-lg">
                {settlement?.winnerScore ?? '—'}
              </p>
              <p className="text-xs font-black text-black mt-3 uppercase tracking-widest">unpredictability</p>
            </div>

            <div className="text-center p-6 bg-gradient-to-br from-yellow-300 to-yellow-200 border-3 border-black shadow-lg hover:shadow-xl transition-all transform rotate-2 hover:-rotate-2">
              <p className="text-xs font-black text-black uppercase tracking-widest mb-4 drop-shadow-sm">Prize Won</p>
              <p className="text-5xl font-black text-black font-mono drop-shadow-lg">
                {settlement?.prize ? `${parseFloat(settlement.prize).toFixed(3)}` : '—'}
              </p>
              <p className="text-xs font-black text-black mt-3 uppercase tracking-widest">MON</p>
            </div>
          </div>

          {isMyWin && (
            <div className="p-5 bg-gradient-to-r from-black to-gray-800 border-3 border-black shadow-lg transform -rotate-2 hover:rotate-0 transition-transform">
              <p className="text-lg font-black text-white text-center uppercase tracking-widest drop-shadow-lg">
                Earned {settlement?.prize} MON!
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Your Move History ── */}
      {myMoves && myMoves.length > 0 && (
        <div className="card w-full border-3 border-black bg-cyan-50 relative z-10 shadow-lg">
          <h3 className="font-black text-black mb-6 uppercase tracking-wider text-xl drop-shadow-sm">Your Move History</h3>
          <MoveGraph moves={myMoves} />
        </div>
      )}

      {/* ── Final Leaderboard ── */}
      {leaderboard.length > 0 && (
        <div className="card w-full border-3 border-black bg-cyan-50 relative z-10 shadow-lg">
          <h3 className="font-black text-black mb-6 uppercase tracking-wider text-xl drop-shadow-sm">Final Rankings</h3>
          <Leaderboard
            rows={leaderboard}
            wallet={wallet}
            shortAddr={shortAddr}
            revealed={true}
          />
        </div>
      )}

      {/* ── Countdown ── */}
      <div className="card w-full text-center border-3 border-black bg-gradient-to-br from-cyan-100 to-cyan-50 border-cyan-600 relative z-10 shadow-lg">
        <p className="text-sm font-black text-black mb-4 uppercase tracking-widest drop-shadow-sm">Next Round Launching In</p>
        <p className="font-mono text-7xl font-black bg-gradient-to-r from-cyan-600 to-cyan-700 bg-clip-text text-transparent leading-none drop-shadow-lg">
          {countdown}
        </p>
      </div>

    </div>
  )
}
