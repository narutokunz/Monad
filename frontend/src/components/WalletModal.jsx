export default function WalletModal({ wallets, onSelect, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'rgba(0, 0, 0, 0.8)' }}
      onClick={onClose}
    >
      <div
        className="bg-cyan-50 border-4 border-black shadow-2xl w-full max-w-sm overflow-hidden animate-in transform"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 py-6 border-b-4 border-black bg-gradient-to-r from-cyan-200 to-cyan-100 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-black uppercase tracking-wider drop-shadow-sm">Connect Wallet</h2>
            <p className="text-xs font-black text-black mt-1 uppercase tracking-widest opacity-75">Select your wallet</p>
          </div>
          <button
            onClick={onClose}
            className="text-black hover:text-pink-600 text-4xl leading-none transition-colors font-black hover:scale-125 transform"
          >
            ×
          </button>
        </div>

        {/* Wallet list */}
        <div className="flex flex-col space-y-2 p-5">
          {wallets.map((w) => (
            <button
              key={w.info?.uuid ?? w.info?.name ?? Math.random()}
              onClick={() => onSelect(w)}
              className="flex items-center gap-4 px-5 py-4 text-left
                         border-3 border-black hover:border-cyan-600 hover:bg-cyan-100
                         transition-all duration-300 group shadow-md hover:shadow-lg transform hover:scale-105 hover:-translate-y-1"
            >
              {w.info?.icon ? (
                <img
                  src={w.info.icon}
                  alt={w.info.name}
                  className="w-12 h-12 border-2 border-black rounded flex-shrink-0 shadow-md group-hover:shadow-lg"
                />
              ) : (
                <div className="w-12 h-12 border-3 border-black flex-shrink-0 flex items-center justify-center bg-white shadow-md group-hover:shadow-lg hover:bg-pink-50">
                  <span className="text-black text-lg font-black">?</span>
                </div>
              )}
              <div className="flex-1">
                <div className="font-black text-black group-hover:text-cyan-600 transition-colors uppercase tracking-wide drop-shadow-sm text-sm">
                  {w.info?.name ?? 'Browser Wallet'}
                </div>
                {w.info?.rdns && (
                  <div className="text-xs font-bold text-black mt-1 opacity-75">{w.info.rdns}</div>
                )}
              </div>
              <div className="text-black group-hover:text-cyan-600 transition-colors font-black text-2xl group-hover:scale-150 transform">
                →
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t-4 border-black bg-gradient-to-r from-cyan-100 to-cyan-50">
          <p className="text-xs font-black text-black text-center uppercase tracking-widest drop-shadow-sm">
            Don't have one? <br />
            <a
              href="https://metamask.io"
              target="_blank"
              rel="noopener noreferrer"
              className="font-black text-cyan-600 hover:text-cyan-700 transition-colors hover:underline"
            >
              Get MetaMask
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
