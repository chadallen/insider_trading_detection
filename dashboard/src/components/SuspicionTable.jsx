const level = (score) =>
  score >= 0.35 ? 'high' : score >= 0.25 ? 'medium' : 'low'

const BORDER = {
  high:   'border-l-4 border-red-500',
  medium: 'border-l-4 border-yellow-400',
  low:    'border-l-4 border-green-700',
}

const BG = {
  high:   { closed: 'bg-red-950/20    hover:bg-red-950/35',   open: 'bg-red-950/35'    },
  medium: { closed: 'bg-yellow-950/10 hover:bg-yellow-950/25', open: 'bg-yellow-950/25' },
  low:    { closed: 'bg-transparent   hover:bg-gray-800/25',   open: 'bg-gray-800/25'   },
}

const BADGE = {
  high:   'bg-red-500/20    text-red-400    ring-1 ring-red-500/40',
  medium: 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/40',
  low:    'bg-green-500/20  text-green-400  ring-1 ring-green-600/40',
}

const SCORE_COLOR = {
  high:   'text-red-400',
  medium: 'text-yellow-400',
  low:    'text-green-400',
}

// ── formatting helpers ───────────────────────────────────────────────────────
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

// ── sub-components ───────────────────────────────────────────────────────────
function ScoreBar({ value, colorClass }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-14 h-1.5 bg-gray-800 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-gray-300 text-xs w-12 text-right">{value.toFixed(3)}</span>
    </div>
  )
}

function DetailRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-baseline gap-2 py-1.5 border-b border-gray-700/60 last:border-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className={`text-sm tabular-nums font-semibold text-right ${highlight ? 'text-orange-300' : 'text-gray-100'}`}>
        {value}
      </span>
    </div>
  )
}

function DetailSection({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{title}</p>
      {children}
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────────────
export default function SuspicionTable({ data, scored = {}, wallet = {}, onRowClick, selected }) {
  return (
    <div className="divide-y divide-gray-800/40">
      {/* Column headers — hidden on small screens */}
      <div className="hidden sm:grid sm:grid-cols-[2rem_1fr_auto_auto_auto_auto] gap-x-4 px-3 pb-2 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
        <span>#</span>
        <span>Market Question</span>
        <span className="text-right">Price</span>
        <span className="text-right">Wallet</span>
        <span className="text-right">Combined</span>
        <span className="text-center">Risk</span>
      </div>

      {data.map((row, i) => {
        const lvl = level(row.combined_score)
        const isOpen = selected?.question === row.question
        const s = scored[row.question]
        const w = wallet[row.question]

        return (
          <div key={i} className={`${BORDER[lvl]} transition-colors duration-100`}>
            {/* ── Collapsed header row ── */}
            <button
              onClick={() => onRowClick(isOpen ? null : row)}
              className={`w-full text-left px-3 py-3 transition-colors duration-100 ${isOpen ? BG[lvl].open : BG[lvl].closed}`}
              aria-expanded={isOpen}
            >
              {/* Desktop layout */}
              <div className="hidden sm:grid sm:grid-cols-[2rem_1fr_auto_auto_auto_auto] gap-x-4 items-center">
                <span className="text-gray-600 text-xs tabular-nums">{i + 1}</span>
                <span className="text-gray-200 text-sm truncate pr-2">{row.question}</span>
                <ScoreBar
                  value={row.price_score}
                  colorClass={row.price_score > 0.08 ? 'bg-orange-400' : 'bg-blue-500'}
                />
                <ScoreBar
                  value={row.wallet_score}
                  colorClass={row.wallet_score >= 0.6 ? 'bg-purple-400' : 'bg-indigo-500'}
                />
                <span className={`tabular-nums font-semibold text-sm text-right ${SCORE_COLOR[lvl]}`}>
                  {row.combined_score.toFixed(4)}
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold tracking-wide ${BADGE[lvl]}`}>
                    {lvl.toUpperCase()}
                  </span>
                  <span className={`text-gray-500 text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                </div>
              </div>

              {/* Mobile layout */}
              <div className="sm:hidden flex items-start gap-3">
                <span className="text-gray-600 text-xs tabular-nums mt-0.5 shrink-0 w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 text-sm leading-snug mb-1.5">{row.question}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold tracking-wide ${BADGE[lvl]}`}>
                      {lvl.toUpperCase()}
                    </span>
                    <span className={`tabular-nums font-semibold text-sm ${SCORE_COLOR[lvl]}`}>
                      {row.combined_score.toFixed(4)}
                    </span>
                  </div>
                </div>
                <span className={`text-gray-500 text-sm mt-0.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
              </div>
            </button>

            {/* ── Expanded detail panel ── */}
            {isOpen && (
              <div className="px-4 pb-5 pt-3 bg-gray-900/60">
                {/* Score bars (mobile only — desktop already shows them in header) */}
                <div className="sm:hidden mb-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Price Score</span>
                    <ScoreBar value={row.price_score} colorClass={row.price_score > 0.08 ? 'bg-orange-400' : 'bg-blue-500'} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Wallet Score</span>
                    <ScoreBar value={row.wallet_score} colorClass={row.wallet_score >= 0.6 ? 'bg-purple-400' : 'bg-indigo-500'} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  {s ? (
                    <DetailSection title="Price Signals">
                      <DetailRow label="Volume"             value={fmtVol(s.volume)} />
                      <DetailRow label="Starting Price"     value={fmtNum(s.starting_price)} />
                      <DetailRow label="Final Price"        value={fmtNum(s.final_price)} />
                      <DetailRow label="Total Price Move"   value={fmtPct(s.total_price_move)} />
                      <DetailRow label="Max Single Move"    value={fmtPct(s.max_single_move)} />
                      <DetailRow label="Price Volatility"   value={fmtNum(s.price_volatility)} />
                      <DetailRow label="Surprise Score"     value={fmtNum(s.surprise_score)} />
                      <DetailRow label="Late Move Ratio"    value={fmtNum(s.late_move_ratio)} />
                      <DetailRow label="VPIN Score"         value={fmtNum(s.vpin_score)} highlight={s.vpin_score > 0.8} />
                      <DetailRow label="Time-Weighted VPIN" value={fmtNum(s.time_weighted_vpin)} />
                      <DetailRow label="Anomaly Signal"     value={s.anomaly_score === -1 ? 'ANOMALOUS' : 'normal'} highlight={s.anomaly_score === -1} />
                      <DetailRow label="Suspicion Score"    value={fmtNum(s.suspicion_score)} />
                    </DetailSection>
                  ) : (
                    <DetailSection title="Price Signals">
                      <p className="text-gray-600 text-xs py-2">No price data available.</p>
                    </DetailSection>
                  )}

                  {w ? (
                    <DetailSection title="Wallet Signals">
                      <DetailRow label="Unique Wallets"        value={w.unique_wallets} />
                      <DetailRow label="Trade Count"           value={w.trade_count} />
                      <DetailRow label="Total Volume"          value={fmtVol(w.total_volume)} />
                      <DetailRow label="Top-3 Wallet Volume"   value={fmtVol(w.top3_volume)} />
                      <DetailRow label="Wallet Concentration"  value={fmtNum(w.wallet_concentration)} highlight={w.wallet_concentration > 0.2} />
                      <DetailRow label="Trade VPIN"            value={fmtNum(w.trade_vpin)} />
                      <DetailRow label="Directional Consensus" value={fmtNum(w.directional_consensus)} />
                      <DetailRow label="Burst Score"           value={w.burst_score} highlight={w.burst_score > 40} />
                      <DetailRow label="New Wallet Ratio 6h"   value={fmtPct(w.new_wallet_ratio_6h)} />
                      <DetailRow label="New Wallet Ratio 12h"  value={fmtPct(w.new_wallet_ratio_12h)} />
                      <DetailRow label="First Trade"           value={fmtDate(w.first_trade_time)} />
                      <DetailRow label="Last Trade"            value={fmtDate(w.last_trade_time)} />
                    </DetailSection>
                  ) : (
                    <DetailSection title="Wallet Signals">
                      <p className="text-gray-600 text-xs py-2">No wallet data available.</p>
                    </DetailSection>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
