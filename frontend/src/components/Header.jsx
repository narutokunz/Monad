export default function Header({ roundId, wallet, onConnect, shortAddr }) {
  return (
    <header className="bg-gradient-to-r from-cyan-200 via-cyan-100 to-cyan-150 border-b-4 border-black px-8 py-6 flex-shrink-0 shadow-lg relative overflow-hidden">
      {/* Animated background blur */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
      </div>

      <div className="max-w-7xl mx-auto flex items-center justify-between relative z-10">
        
        {/* Logo / Branding */}
        <div className="flex items-center gap-3 group cursor-pointer transition-transform hover:scale-105">
          <div className="w-14 h-14 border-3 border-black bg-gradient-to-br from-white to-cyan-50 flex items-center justify-center transform -rotate-6 group-hover:rotate-0 transition-transform duration-300 shadow-lg hover:shadow-xl">
            <span className="text-black font-black text-2xl">MW</span>
          </div>
          <div>
            <h1 className="text-3xl font-black text-black leading-tight tracking-tighter drop-shadow-sm">MimicWar</h1>
            <p className="text-xs font-black text-black uppercase tracking-widest letter-spacing-wider opacity-75">Monad Testnet</p>
          </div>
        </div>

        {/* Center - Round Info */}
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <div className="bg-gradient-to-br from-white to-cyan-50 border-3 border-black px-8 py-4 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 group">
            <div className="text-xs font-black text-black uppercase tracking-widest letter-spacing-wider group-hover:scale-110 transition-transform">
              Round {roundId ? roundId : '—'}
            </div>
          </div>
        </div>

        {/* Right - Wallet Button */}
        <button
          onClick={onConnect}
          className={`
            px-7 py-3 font-black text-sm uppercase tracking-wider transition-all duration-300 whitespace-nowrap border-3 transform
            ${wallet
              ? 'bg-gradient-to-r from-white to-cyan-50 text-black border-black hover:from-cyan-100 hover:to-white shadow-lg hover:shadow-xl hover:scale-105'
              : 'bg-gradient-to-br from-black to-gray-800 text-white border-black hover:from-gray-900 hover:to-black shadow-lg hover:shadow-xl hover:scale-105 hover:-translate-y-1'}
          `}
        >
          {wallet ? (
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-lime-500 animate-pulse shadow-lg" />
              <span className="font-mono font-black">{shortAddr(wallet)}</span>
            </div>
          ) : (
            'CONNECT WALLET'
          )}
        </button>

      </div>
    </header>
  )
}
