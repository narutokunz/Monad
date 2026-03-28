import { useState } from 'react'

export default function JoinScreen({
  timeLeft,
  pot,
  playerCount,
  wallet,
  submitted,
  onSubmit,
}) {
  const [choice,   setChoice]   = useState(50)
  const [loading,  setLoading]  = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const roundReady = timeLeft !== null && timeLeft !== undefined
  const roundLive  = roundReady && timeLeft > 0

  const handleSubmit = async () => {
    if (!wallet || submitted || loading || !roundLive) return
    setLoading(true)
    setErrorMsg('')
    try {
      await onSubmit(choice)
    } catch (err) {
      const reason = err?.errorName ?? err?.reason ?? err?.shortMessage ?? err?.message ?? ''
      if      (reason.includes('AlreadySubmitted'))         setErrorMsg('Already submitted this round.')
      else if (reason.includes('RoundNotActive'))           setErrorMsg('Round expired — wait for the next one.')
      else if (reason.includes('InsufficientStake'))        setErrorMsg('Need at least 0.001 MON to enter.')
      else if (reason.includes('InvalidChoice'))            setErrorMsg('Choice must be between 1 and 100.')
      else if (reason.includes('insufficient balance') ||
               reason.includes('Signer had insufficient')) setErrorMsg('Not enough MON for gas + stake.')
      else if (reason.includes('execution reverted'))       setErrorMsg('Round expired — wait for the next one.')
      else setErrorMsg(reason.slice(0, 140) || 'Transaction failed.')
    } finally {
      setLoading(false)
    }
  }

  let btnLabel    = ''
  let btnDisabled = false

  if (!wallet) {
    btnLabel    = 'Connect wallet to play'
    btnDisabled = true
  } else if (!roundReady) {
    btnLabel    = 'Waiting for round data...'
    btnDisabled = true
  } else if (timeLeft === 0) {
    btnLabel    = 'Round ended — wait'
    btnDisabled = true
  } else if (submitted) {
    btnLabel    = 'Submitted'
    btnDisabled = true
  } else if (loading) {
    btnLabel    = 'Confirming on Monad...'
    btnDisabled = true
  } else {
    btnLabel    = 'Submit + Stake 0.001 MON'
    btnDisabled = false
  }

  const isHot = roundLive && timeLeft <= 10

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
      </div>

      <div className="w-full max-w-[500px] space-y-6 relative z-10">

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-3 gap-4 animate-in">
          <div className={`stat-box border-3 border-black ${isHot ? 'bg-red-100 border-red-600 shadow-glow-lg' : 'bg-cyan-50'}`}>
            <div className="stat-label">Time Left</div>
            <div className={`stat-value font-black ${isHot ? 'text-red-600 animate-pulse' : 'text-cyan-600'}`}>
              {timeLeft !== null && timeLeft !== undefined ? `${timeLeft}` : '—'}
            </div>
            <div className="stat-unit font-black">seconds</div>
          </div>

          <div className="stat-box border-3 border-black bg-cyan-50 hover:glow">
            <div className="stat-label">Prize Pool</div>
            <div>
              <span className="stat-value font-black text-cyan-600">${pot ? parseFloat(pot).toFixed(3) : '—'}</span>
              <span className="stat-unit font-black">MON</span>
            </div>
          </div>

          <div className="stat-box border-3 border-black bg-cyan-50 hover:glow">
            <div className="stat-label">Players</div>
            <div className="stat-value font-black text-black">{playerCount ?? '—'}</div>
          </div>
        </div>

        {/* ── Number Picker Card ── */}
        <div className="card border-3 border-black bg-cyan-50 p-10 shadow-lg">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-black text-black mb-2 uppercase tracking-widest drop-shadow-sm">Choose Your Number</h2>
            <p className="text-sm font-black text-black uppercase tracking-widest opacity-75">Pick any number from 1 to 100</p>
          </div>

          {/* Giant number display */}
          <div className="text-center py-10 bg-gradient-to-br from-cyan-100 to-cyan-200 border-3 border-cyan-600 transform -rotate-2 hover:rotate-0 transition-all duration-300 mb-6 shadow-lg hover:shadow-2xl">
            <div className="font-mono text-8xl font-black text-cyan-700 leading-none select-none drop-shadow-lg hover:scale-110 transition-transform">
              {choice}
            </div>
          </div>

          {/* Range slider */}
          <div className="w-full">
            <input
              type="range"
              min={1}
              max={100}
              value={choice}
              onChange={e => setChoice(Number(e.target.value))}
              disabled={submitted || loading || !roundLive}
              className="w-full"
            />
            <div className="flex justify-between mt-2 font-mono text-[10px] text-muted">
              <span>1</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
        </div>

        {/* ── Error message ── */}
        {errorMsg && (
          <div className="p-4 bg-red-100 border-3 border-red-600 shadow-lg animate-in">
            <p className="text-sm font-black text-red-700 uppercase tracking-wider">{errorMsg}</p>
          </div>
        )}

        {/* ── Submit button ── */}
        <button
          onClick={handleSubmit}
          disabled={btnDisabled}
          className={`
            w-full py-4 px-4 font-black text-sm uppercase tracking-widest transition-all duration-300 border-3 transform
            ${btnDisabled
              ? 'bg-gray-300 text-black cursor-not-allowed border-black opacity-60'
              : 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white border-black hover:from-cyan-700 hover:to-cyan-800 shadow-lg hover:shadow-2xl hover:scale-105 hover:-translate-y-1'}
          `}
        >
          {btnLabel}
        </button>

        {/* ── Footer info ── */}
        <p className="text-xs font-black text-black text-center uppercase tracking-widest drop-shadow-sm">
          Stake: <span className="font-black text-cyan-600">0.001 MON</span> · Duration: <span className="font-black text-cyan-600">30 seconds</span>
        </p>

      </div>
    </div>
  )
}
