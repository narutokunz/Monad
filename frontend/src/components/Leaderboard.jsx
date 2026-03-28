import { useRef, useEffect } from 'react'

export default function Leaderboard({ rows, wallet, shortAddr, revealed }) {
  const prevRowsRef = useRef([])
  const flashSet    = useRef(new Set())

  // Detect new addresses that weren't in previous render
  useEffect(() => {
    if (!rows.length) {
      prevRowsRef.current = []
      return
    }

    const prevAddrs = new Set(prevRowsRef.current.map(r => r.address?.toLowerCase()))
    const newAddrs  = rows
      .map(r => r.address?.toLowerCase())
      .filter(a => a && !prevAddrs.has(a))

    if (newAddrs.length) {
      flashSet.current = new Set(newAddrs)
      setTimeout(() => { flashSet.current = new Set() }, 1500)
    }

    prevRowsRef.current = rows
  }, [rows])

  if (!rows.length) {
    return (
      <div className="card text-center py-16 border-3 border-black bg-cyan-50 shadow-lg">
        <p className="text-lg font-black text-black">Waiting for players to join...</p>
        <p className="text-sm font-bold text-black mt-2 opacity-75">Get ready to mimic!</p>
      </div>
    )
  }

  const myKey = wallet?.toLowerCase()

  // Get medal emoji for top 3
  const getMedal = (rank) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return null
  }

  return (
    <div className="space-y-2">
      {rows.map((p, i) => {
        const addrKey = p.address?.toLowerCase()
        const isMe    = addrKey === myKey
        const isFlash = flashSet.current.has(addrKey)
        const medal   = getMedal(i + 1)

        return (
          <div
            key={p.address}
            className={`
              card px-6 py-5 flex items-center justify-between border-3 border-black
              ${isFlash ? 'row-flash' : ''}
              ${isMe ? 'bg-gradient-to-r from-cyan-100 to-cyan-50 border-cyan-600 shadow-lg' : 'bg-white hover:bg-cyan-50'}
              transition-all duration-300 hover:shadow-2xl transform hover:scale-102
            `}
          >
            <div className="flex items-center gap-4 flex-1">
              {/* Rank / Medal */}
              <div className="w-10 text-center">
                {medal ? (
                  <span className="text-2xl">{medal}</span>
                ) : (
                  <span className="text-lg font-black text-black font-mono">#{i + 1}</span>
                )}
              </div>

              {/* Address */}
              <div className="flex-1">
                <div className="font-mono text-sm font-black text-black">
                  {shortAddr(p.address)}
                </div>
                {isMe && (
                  <div className="text-xs text-cyan-600 font-black mt-0.5 uppercase tracking-wider">You</div>
                )}
              </div>
            </div>

            {/* Score */}
            <div className="text-right mr-6">
              <div className="text-xs font-black text-black uppercase tracking-widest mb-1">Score</div>
              <div className="text-2xl font-black text-cyan-600 font-mono">
                {p.score ?? 0}
              </div>
            </div>

            {/* Choice */}
            <div className="text-right mr-6 min-w-16">
              <div className="text-xs font-black text-black uppercase tracking-widest mb-1">Choice</div>
              <div className="text-lg font-black text-black font-mono">
                {revealed ? (
                  <span className="text-cyan-600 bg-yellow-300 px-2 py-1 font-black">{p.choice ?? '—'}</span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>
            </div>

            {/* Move count */}
            <div className="text-right">
              <div className="text-xs font-black text-black uppercase tracking-widest mb-1">Moves</div>
              <div className="text-lg font-black text-black font-mono">
                {p.moveCount ?? 1}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
