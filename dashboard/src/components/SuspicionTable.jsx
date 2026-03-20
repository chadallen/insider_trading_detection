// primary score: insider_trading_prob (Phase 3+), fall back to combined_score (legacy)
const getScore = (row) => row.insider_trading_prob ?? row.combined_score ?? 0
const level = (row) => {
  const s = getScore(row)
  return s >= 0.35 ? 'high' : s >= 0.25 ? 'medium' : 'low'
}

const BORDER = {
  high:   'border-l-4 border-red-700',
  medium: 'border-l-4 border-amber-600',
  low:    'border-l-4 border-emerald-700',
}

const BG = {
  high:   { closed: 'bg-red-50    hover:bg-red-100',    open: 'bg-red-100'    },
  medium: { closed: 'bg-amber-50  hover:bg-amber-100',  open: 'bg-amber-100'  },
  low:    { closed: 'bg-transparent hover:bg-stone-100', open: 'bg-stone-100'  },
}

const BADGE = {
  high:   'border border-red-700   text-red-800   bg-red-50',
  medium: 'border border-amber-700 text-amber-900 bg-amber-50',
  low:    'border border-emerald-700 text-emerald-900 bg-emerald-50',
}

const SCORE_COLOR = {
  high:   'text-red-800',
  medium: 'text-amber-900',
  low:    'text-emerald-800',
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
  if (value == null || isNaN(value)) {
    return <span className="tabular-nums text-stone-400 text-xs w-12 text-right">—</span>
  }
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-14 h-1.5 bg-stone-200 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-stone-700 text-xs w-12 text-right">{value.toFixed(3)}</span>
    </div>
  )
}

function DetailRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-baseline gap-2 py-1.5 border-b border-stone-200 last:border-0">
      <span className="text-stone-500 text-sm">{label}</span>
      <span className={`text-sm tabular-nums font-semibold text-right ${highlight ? 'text-amber-700' : 'text-stone-900'}`}>
        {value}
      </span>
    </div>
  )
}

function DetailSection({ title, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">{title}</p>
      {children}
    </div>
  )
}

function timeUntil(isoStr) {
  if (!isoStr) return null
  const ms = new Date(isoStr) - Date.now()
  if (isNaN(ms) || ms < 0) return null
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── main component ───────────────────────────────────────────────────────────
export default function SuspicionTable({ data, scored = {}, wallet = {}, onRowClick, selected, showProb = false }) {
  return (
    <div className="divide-y divide-stone-200">
      {/* Column headers — hidden on small screens */}
      <div className="hidden sm:grid sm:grid-cols-[2rem_1fr_auto_auto_auto_auto_auto] gap-x-4 px-3 pb-2 text-[10px] font-semibold text-stone-500 uppercase tracking-widest">
        <span>#</span>
        <span>Market Question</span>
        <span className="text-right">Price</span>
        <span className="text-right">Anomaly</span>
        <span className="text-right">Ensemble</span>
        <span className="text-right">PU Prob</span>
        <span className="text-center">Risk</span>
      </div>

      {data.map((row, i) => {
        const lvl = level(row)
        const isOpen = selected?.question === row.question
        const s = scored[row.question]
        const w = wallet[row.question]
        const until = timeUntil(row.end_date)

        return (
          <div key={i} className={`${BORDER[lvl]} transition-colors duration-100`}>
            {/* ── Collapsed header row ── */}
            <button
              onClick={() => onRowClick(isOpen ? null : row)}
              className={`w-full text-left px-3 py-3 transition-colors duration-100 ${isOpen ? BG[lvl].open : BG[lvl].closed}`}
              aria-expanded={isOpen}
            >
              {/* Desktop layout */}
              <div className="hidden sm:grid sm:grid-cols-[2rem_1fr_auto_auto_auto_auto_auto] gap-x-4 items-center">
                <span className="text-stone-400 text-xs tabular-nums">{i + 1}</span>
                <span className="text-stone-800 text-sm truncate pr-2">{row.question}</span>
                <ScoreBar
                  value={row.suspicion_score != null ? Math.max(0, Math.min(1, (row.suspicion_score + 0.5))) : null}
                  colorClass="bg-stone-600"
                />
                <ScoreBar
                  value={row.iso_score ?? row.wallet_score ?? null}
                  colorClass="bg-stone-500"
                />
                <span className={`tabular-nums font-semibold text-sm text-right ${SCORE_COLOR[lvl]}`}>
                  {getScore(row).toFixed(4)}
                </span>
                <span className="tabular-nums text-xs text-right text-stone-500">
                  {row.pu_prob != null ? row.pu_prob.toFixed(3) : '—'}
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs px-2 py-0.5 font-medium tracking-wide ${BADGE[lvl]}`}>
                    {lvl.toUpperCase()}
                  </span>
                  <span className={`text-stone-400 text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                </div>
              </div>

              {/* Mobile layout */}
              <div className="sm:hidden flex items-start gap-3">
                <span className="text-stone-400 text-xs tabular-nums mt-0.5 shrink-0 w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-stone-800 text-sm leading-snug mb-1.5">{row.question}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 font-medium tracking-wide ${BADGE[lvl]}`}>
                      {lvl.toUpperCase()}
                    </span>
                    {showProb && until && (
                      <span className="text-emerald-700 text-xs tabular-nums">{until}</span>
                    )}
                    <span className={`tabular-nums font-semibold text-sm ${SCORE_COLOR[lvl]}`}>
                      {getScore(row).toFixed(4)}
                    </span>
                  </div>
                </div>
                <span className={`text-stone-400 text-sm mt-0.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
              </div>
            </button>

            {/* ── Expanded detail panel ── */}
            {isOpen && (
              <div className="px-4 pb-5 pt-3 bg-stone-100">
                {/* Score bars (mobile only — desktop already shows them in header) */}
                <div className="sm:hidden mb-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-stone-500">Price Signal</span>
                    <ScoreBar value={row.suspicion_score != null ? Math.max(0, Math.min(1, row.suspicion_score + 0.5)) : null} colorClass="bg-stone-600" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-stone-500">Anomaly Score</span>
                    <ScoreBar value={row.iso_score ?? null} colorClass="bg-stone-500" />
                  </div>
                </div>

                {/* RF probability — full-width summary row */}
                {row.insider_trading_prob != null && (
                  <div className="mb-4 flex items-center justify-between border border-stone-300 px-4 py-2.5 bg-stone-50">
                    <span className="text-xs text-stone-500">Ensemble Score (PU-LightGBM + IsoForest + OC-SVM)</span>
                    <span className="tabular-nums font-bold text-sm text-stone-800">
                      {(row.insider_trading_prob * 100).toFixed(1)}%
                    </span>
                  </div>
                )}

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
                      <DetailRow label="Momentum 6h"        value={fmtNum(s.price_momentum_6h)} />
                      <DetailRow label="Momentum 12h"       value={fmtNum(s.price_momentum_12h)} />
                      <DetailRow label="Anomaly Flag"       value={s.anomaly_score === -1 ? 'ANOMALOUS' : 'normal'} highlight={s.anomaly_score === -1} />
                      <DetailRow label="Suspicion Score"    value={fmtNum(s.suspicion_score)} />
                    </DetailSection>
                  ) : (
                    <DetailSection title="Price Signals">
                      <p className="text-stone-400 text-xs py-2">No price data available.</p>
                    </DetailSection>
                  )}

                  {w ? (
                    <DetailSection title="Wallet Signals">
                      <DetailRow label="Unique Wallets"        value={w.unique_wallets} />
                      <DetailRow label="Trade Count"           value={w.trade_count} />
                      <DetailRow label="Total Volume"          value={fmtVol(w.total_volume)} />
                      <DetailRow label="Wallet Concentration"  value={fmtNum(w.wallet_concentration)} highlight={w.wallet_concentration > 0.2} />
                      <DetailRow label="Order Flow Imbalance"  value={fmtNum(w.order_flow_imbalance)} highlight={w.order_flow_imbalance > 0.7} />
                      <DetailRow label="Burst Score"           value={w.burst_score} highlight={w.burst_score > 40} />
                      <DetailRow label="New Wallet Ratio"      value={fmtPct(w.new_wallet_ratio)} highlight={w.new_wallet_ratio > 0.5} />
                      <DetailRow label="New Wallet Ratio 6h"   value={fmtPct(w.new_wallet_ratio_6h)} />
                      <DetailRow label="Wallet Age (median)"   value={w.wallet_age_median_days != null ? `${Math.round(w.wallet_age_median_days)}d` : '—'} />
                      <DetailRow label="Cross-Market Wallets"  value={w.cross_market_wallet_flag ?? '—'} highlight={w.cross_market_wallet_flag > 2} />
                    </DetailSection>
                  ) : (
                    <DetailSection title="Wallet Signals">
                      <p className="text-stone-400 text-xs py-2">No wallet data available.</p>
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
