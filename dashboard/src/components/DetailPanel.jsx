import { useEffect } from 'react'

const fmtVol = (n) =>
  n == null ? '—'
  : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000     ? `$${(n / 1_000).toFixed(1)}K`
  :                  `$${Number(n).toFixed(0)}`

const fmtPct = (n) => (n == null ? '—' : `${(n * 100).toFixed(2)}%`)
const fmtNum = (n, dec = 4) => (n == null ? '—' : Number(n).toFixed(dec))
const fmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(s.replace(' UTC', 'Z'))
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-1.5 border-b border-gray-800/60 last:border-0">
      <span className="text-gray-500 text-xs shrink-0">{label}</span>
      <span className={`text-xs tabular-nums font-medium text-right ${highlight ? 'text-orange-300' : 'text-gray-200'}`}>
        {value}
      </span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">{title}</h3>
      <div>{children}</div>
    </div>
  )
}

export default function DetailPanel({ row, scored, wallet, onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const s = scored  // df_scored row
  const w = wallet  // df_wallet_agg row

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-gray-950 border-l border-gray-800 z-40 overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gray-950 border-b border-gray-800 px-5 py-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Market Detail</p>
            <p className="text-sm text-gray-100 font-medium leading-snug">{row.question}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-gray-600 hover:text-gray-300 text-lg leading-none mt-0.5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-5">
          {/* Combined scores */}
          <Section title="Combined Scores">
            <Row label="Price Score"    value={fmtNum(row.price_score)} />
            <Row label="Wallet Score"   value={fmtNum(row.wallet_score)} />
            <Row label="Combined Score" value={fmtNum(row.combined_score)} highlight />
          </Section>

          {/* Price / market data from df_scored */}
          {s && (
            <Section title="Price Signals">
              <Row label="Volume"            value={fmtVol(s.volume)} />
              <Row label="Starting Price"    value={fmtNum(s.starting_price)} />
              <Row label="Final Price"       value={fmtNum(s.final_price)} />
              <Row label="Total Price Move"  value={fmtPct(s.total_price_move)} />
              <Row label="Max Single Move"   value={fmtPct(s.max_single_move)} />
              <Row label="Price Volatility"  value={fmtNum(s.price_volatility)} />
              <Row label="Surprise Score"    value={fmtNum(s.surprise_score)} />
              <Row label="Late Move Ratio"   value={fmtNum(s.late_move_ratio)} />
              <Row label="VPIN Score"        value={fmtNum(s.vpin_score)} highlight={s.vpin_score > 0.8} />
              <Row label="Time-Weighted VPIN" value={fmtNum(s.time_weighted_vpin)} />
              <Row label="Anomaly Signal"    value={s.anomaly_score === -1 ? 'ANOMALOUS' : 'normal'} highlight={s.anomaly_score === -1} />
              <Row label="Suspicion Score"   value={fmtNum(s.suspicion_score)} />
            </Section>
          )}

          {/* Wallet data from df_wallet_agg */}
          {w && (
            <Section title="Wallet Signals">
              <Row label="Unique Wallets"       value={w.unique_wallets} />
              <Row label="Trade Count"          value={w.trade_count} />
              <Row label="Total Volume"         value={fmtVol(w.total_volume)} />
              <Row label="Top-3 Wallet Volume"  value={fmtVol(w.top3_volume)} />
              <Row label="Wallet Concentration" value={fmtNum(w.wallet_concentration)} highlight={w.wallet_concentration > 0.2} />
              <Row label="Trade VPIN"           value={fmtNum(w.trade_vpin)} />
              <Row label="Directional Consensus" value={fmtNum(w.directional_consensus)} />
              <Row label="Burst Score"          value={w.burst_score} highlight={w.burst_score > 40} />
              <Row label="New Wallet Ratio 6h"  value={fmtPct(w.new_wallet_ratio_6h)} />
              <Row label="New Wallet Ratio 12h" value={fmtPct(w.new_wallet_ratio_12h)} />
              <Row label="First Trade"          value={fmtDate(w.first_trade_time)} />
              <Row label="Last Trade"           value={fmtDate(w.last_trade_time)} />
            </Section>
          )}

          {!s && !w && (
            <p className="text-gray-600 text-xs text-center py-8">No additional detail available for this market.</p>
          )}
        </div>
      </div>
    </>
  )
}
