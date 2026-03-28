export default function MoveGraph({ moves }) {
  if (!moves || moves.length === 0) return null

  const maxValue = 100

  return (
    <div className="w-full">
      {/* Container with chart */}
      <div className="p-6 bg-pink-50 border-3 border-black shadow-lg">
        {/* Y-axis label */}
        <div className="flex gap-4">
          {/* Left axis labels */}
          <div className="flex flex-col justify-between text-right text-xs font-black text-black font-mono pt-2 pb-6 pr-3">
            <span className="drop-shadow-sm">100</span>
            <span className="drop-shadow-sm">50</span>
            <span className="drop-shadow-sm">0</span>
          </div>

          {/* Bar chart */}
          <div className="flex-1 flex items-end gap-4 h-32 pb-6 border-b-3 border-l-3 border-black">
            {moves.map((v, i) => {
              const heightPercent = (v / maxValue) * 100
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end gap-3 group hover:scale-110 transition-transform"
                >
                  <div
                    className="w-full  bg-gradient-to-t from-pink-600 to-pink-500 border-3 border-black
                               transition-all duration-300 hover:from-pink-700 hover:to-pink-600
                               shadow-lg hover:shadow-2xl transform hover:scale-y-110"
                    style={{ height: `calc((${heightPercent}% - 12px))` }}
                  />
                  <span className="font-mono text-xs font-black text-black group-hover:text-pink-600 
                                   transition-colors uppercase tracking-wider drop-shadow-sm">
                    {v}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Title below */}
        <p className="text-xs font-black text-black uppercase tracking-widest mt-4 drop-shadow-sm">
          📈 Your Last {moves.length} Moves
        </p>
      </div>
    </div>
  )
}
