import Leaderboard from '../components/Leaderboard.jsx'

export default function WarScreen({
  timeLeft,
  pot,
  playerCount,
  leaderboard,
  wallet,
  shortAddr,
}) {
  const isHotPhase = timeLeft > 0 && timeLeft <= 10

  /* Derive user's own stats from leaderboard */
  const myKey   = wallet?.toLowerCase()
  const myEntry = leaderboard.find(p => p.address?.toLowerCase() === myKey)
  const myScore = myEntry?.score ?? null
  const myRank  = myEntry ? leaderboard.indexOf(myEntry) + 1 : null

  return (
    <div className="flex-1 w-full max-w-[900px] mx-auto px-6 py-8 flex flex-col gap-8 relative overflow-hidden">
      
      {/* Animated background */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl" />
      </div>

      {/* ── Timer Section ── */}
      <div className="card border-3 border-black bg-cyan-50 relative z-10">
        <div className="text-center py-10">
          <div className="text-xs font-black uppercase tracking-widest text-black mb-6 drop-shadow-sm">
            Round Time Remaining
          </div>
          <div
            className={`font-mono text-8xl font-black leading-none transition-all duration-300 drop-shadow-lg ${
              isHotPhase 
                ? 'text-red-600 animate-pulse' 
                : 'bg-gradient-to-r from-cyan-600 to-cyan-700 bg-clip-text text-transparent'
            }`}
          >
            {String(timeLeft ?? 0).padStart(2, '0')}
          </div>
          <div className="text-sm font-black text-black mt-3 tracking-widest uppercase">Seconds Remaining</div>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
        <div className="stat-box border-3 border-black bg-cyan-50 hover:glow">
          <div className="stat-label">Players</div>
          <div className="stat-value font-black text-black">{playerCount ?? 0}</div>
        </div>

        <div className="stat-box border-3 border-black bg-white border-cyan-500 hover:glow">
          <div className="stat-label">Prize Pool</div>
          <div>
            <span className="stat-value font-black text-cyan-600">${pot ? parseFloat(pot).toFixed(3) : '0.000'}</span>
            <span className="stat-unit font-black">MON</span>
          </div>
        </div>

        <div className="stat-box border-3 border-black bg-cyan-50 hover:glow">
          <div className="stat-label">Your Score</div>
          <div className="stat-value font-black text-cyan-600">
            {myScore !== null ? myScore : '—'}
          </div>
        </div>

        <div className="stat-box border-3 border-black bg-white border-cyan-500 hover:glow">
          <div className="stat-label">Your Rank</div>
          <div className="stat-value font-black text-black">
            {myRank !== null ? `#${myRank}` : '—'}
          </div>
        </div>
      </div>

      {/* ── Leaderboard section ── */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-3xl font-black text-black uppercase tracking-wider drop-shadow-sm">Live Rankings</h3>
            <p className="text-sm font-black text-black mt-2 uppercase tracking-widest opacity-75">Sorted by unpredictability score</p>
          </div>
          <div className="flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-lime-300 to-lime-400 border-3 border-black shadow-lg transform hover:scale-105 transition-transform">
            <span className="inline-block w-3 h-3 rounded-full bg-lime-500 animate-pulse shadow-lg" />
            <span className="text-xs font-black text-black uppercase tracking-widest">LIVE</span>
          </div>
        </div>

        <Leaderboard
          rows={leaderboard}
          wallet={wallet}
          shortAddr={shortAddr}
          revealed={false}
        />
      </div>

    </div>
  )
}
