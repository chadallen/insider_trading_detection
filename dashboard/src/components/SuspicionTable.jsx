import { useState } from 'react'

const getScore = (row) => row.insider_trading_prob ?? row.combined_score ?? 0

const level = (row) => {
  const s = getScore(row)
  return s >= 0.35 ? 'high' : s >= 0.25 ? 'medium' : 'low'
}

const LEVEL_COLORS = {
  high:   { bar: 'bg-red-500',   badge: 'border border-red-300 text-red-700 bg-red-50',   left: 'border-l-4 border-red-500',   score: 'text-red-700'   },
  medium: { bar: 'bg-amber-500', badge: 'border border-amber-300 text-amber-700 bg-amber-50', left: 'border-l-4 border-amber-400', score: 'text-amber-700' },
  low:    { bar: 'bg-blue-400',  badge: 'border border-blue-200 text-blue-700 bg-blue-50',  left: 'border-l-4 border-blue-300',  score: 'text-blue-700'  },
}

// ── formatting helpers ────────────────────────────────────────────────────────
const fmtVol = (n) =>
  n == null ? '—'
  : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000     ? `$${(n / 1_000).toFixed(1)}K`
  :                  `$${Number(n).toFixed(0)}`

const fmtPct  = (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
const fmtNum  = (n, dec = 3) => (n == null ? '—' : Number(n).toFixed(dec))
const fmtDate = (s) => {
  if (!s) return '—'
  const d = new Date(s.replace(' UTC', 'Z'))
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── column definitions ────────────────────────────────────────────────────────
// key = field to sort on, label = header text
const COLUMNS = [
  { key: null,                  label: '#',             width: 'w-7',     align: 'text-left'  },
  { key: null,                  label: 'Market',        width: 'flex-1',  align: 'text-left'  },
  { key: 'suspicion_score',     label: 'Price IF',      width: 'w-28',    align: 'text-right', tooltip: 'IsolationForest on price features only' },
  { key: 'iso_score',           label: 'IsoForest',     width: 'w-28',    align: 'text-right', tooltip: 'IsolationForest on all 14 features' },
  { key: 'pu_prob',             label: 'PU-LGB',        width: 'w-20',    align: 'text-right', tooltip: 'PU-LightGBM adjusted probability' },
  { key: 'insider_trading_prob',label: 'Insider Prob',  width: 'w-28',    align: 'text-right', tooltip: 'Ensemble: 0.5×PU + 0.3×ISO + 0.2×OCSVM' },
  { key: null,                  label: 'Level',         width: 'w-24',    align: 'text-center' },
]

// ── sub-components ────────────────────────────────────────────────────────────
function MiniBar({ value, colorClass }) {
  if (value == null || isNaN(value)) return <span className="text-slate-300 text-xs">—</span>
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-slate-600 text-xs w-10 text-right">{Number(value).toFixed(3)}</span>
    </div>
  )
}

function ScoreBreakdown({ row }) {
  const pu   = row.pu_prob   ?? null
  const iso  = row.iso_score ?? null
  const ocsvm = row.ocsvm_score ?? null
  const ens  = getScore(row)
  const lvl  = level(row)

  const bars = [
    { label: 'PU-LightGBM', value: pu,    weight: '×0.5', color: 'bg-blue-500' },
    { label: 'IsoForest',   value: iso,   weight: '×0.3', color: 'bg-indigo-400' },
    { label: 'OC-SVM',      value: ocsvm, weight: '×0.2', color: 'bg-violet-400' },
  ]

  return (
    <div className="mb-5 p-4 rounded-lg border border-blue-100 bg-blue-50">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Ensemble Score</span>
        <span className={`text-2xl font-bold tabular-nums ${LEVEL_COLORS[lvl].score}`}>
          {(ens * 100).toFixed(1)}%
        </span>
      </div>
      <div className="space-y-2">
        {bars.map(({ label, value, weight, color }) => {
          const pct = value != null ? Math.max(0, Math.min(1, value)) * 100 : null
          return (
            <div key={label} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-24 shrink-0">{label} <span className="text-slate-300">{weight}</span></span>
              <div className="flex-1 h-2 bg-white rounded-full overflow-hidden border border-blue-100">
                {pct != null
                  ? <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                  : <div className="h-full rounded-full bg-slate-100" style={{ width: '50%' }} />
                }
              </div>
              <span className="tabular-nums text-xs text-slate-500 w-10 text-right">
                {value != null ? value.toFixed(3) : '0.5*'}
              </span>
            </div>
          )
        })}
      </div>
      {ocsvm == null && (
        <p className="text-[10px] text-slate-400 mt-2">* OC-SVM fell back to neutral (insufficient CONFIRMED matches)</p>
      )}
    </div>
  )
}

// Flag anomalous wallet values for highlighting
function isAnomalous(field, value) {
  if (value == null) return false
  switch (field) {
    case 'wallet_concentration': return value > 0.4
    case 'order_flow_imbalance': return value > 0.7 || value < -0.7
    case 'burst_score':          return value > 40
    case 'new_wallet_ratio':     return value > 0.5
    case 'cross_market_wallet_flag': return value > 2
    case 'wallet_age_median_days':   return value < 30
    default: return false
  }
}

function isAnomalousPrice(field, value) {
  if (value == null) return false
  switch (field) {
    case 'surprise_score':    return value > 0.6
    case 'late_move_ratio':   return value > 0.5
    case 'max_single_move':   return value > 0.2
    case 'price_momentum_6h': return Math.abs(value) > 0.15
    default: return false
  }
}

function DetailRow({ label, value, anomalous }) {
  return (
    <div className={`flex justify-between items-baseline gap-2 py-1.5 border-b border-slate-100 last:border-0 ${anomalous ? 'rounded px-1 -mx-1 bg-amber-50' : ''}`}>
      <span className="text-slate-400 text-xs">{label}</span>
      <span className={`text-xs tabular-nums font-medium text-right ${anomalous ? 'text-amber-700 font-semibold' : 'text-slate-700'}`}>
        {value}
        {anomalous && <span className="ml-1 text-amber-400">▲</span>}
      </span>
    </div>
  )
}

function DetailSection({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-200">{title}</p>
      {children}
    </div>
  )
}

function SortIcon({ direction }) {
  if (!direction) return <span className="text-slate-300 ml-0.5 text-[10px]">↕</span>
  return <span className="text-blue-400 ml-0.5 text-[10px]">{direction === 'asc' ? '↑' : '↓'}</span>
}

// ── main component ────────────────────────────────────────────────────────────
export default function SuspicionTable({ data, scored = {}, wallet = {}, onRowClick, selected }) {
  const [sortKey, setSortKey]   = useState('insider_trading_prob')
  const [sortDir, setSortDir]   = useState('desc')

  function handleSort(key) {
    if (!key) return
    if (key === sortKey) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity
    const bv = b[sortKey] ?? -Infinity
    return sortDir === 'desc' ? bv - av : av - bv
  })

  if (!data.length) return (
    <div className="px-6 py-12 text-center text-slate-400 text-sm">No market data loaded.</div>
  )

  return (
    <div>
      {/* ── Column header row ── */}
      <div className="hidden sm:flex items-center gap-x-3 px-4 py-2.5 border-b border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none">
        <span className="w-7 shrink-0">#</span>
        <span className="flex-1">Market</span>
        {COLUMNS.slice(2).map((col) => (
          <button
            key={col.label}
            onClick={() => handleSort(col.key)}
            disabled={!col.key}
            title={col.tooltip}
            className={`${col.width} shrink-0 ${col.align} flex items-center justify-end gap-0.5 ${
              col.key ? 'hover:text-blue-600 cursor-pointer' : 'cursor-default'
            } ${sortKey === col.key ? 'text-blue-500' : ''}`}
          >
            {col.label}
            {col.key && <SortIcon direction={sortKey === col.key ? sortDir : null} />}
          </button>
        ))}
      </div>

      {/* ── Rows ── */}
      <div className="divide-y divide-slate-100">
        {sorted.map((row, i) => {
          const lvl   = level(row)
          const isOpen = selected?.question === row.question
          const s     = scored[row.question]
          const w     = wallet[row.question]
          const colors = LEVEL_COLORS[lvl]

          // Normalize suspicion_score (IsoForest returns [-0.5, 0.5] range roughly)
          const priceIF = row.suspicion_score != null
            ? Math.max(0, Math.min(1, row.suspicion_score + 0.5))
            : null

          return (
            <div key={i} className={colors.left}>
              {/* ── Collapsed row ── */}
              <button
                onClick={() => onRowClick(isOpen ? null : row)}
                className={`w-full text-left px-4 py-3 transition-colors duration-100 ${
                  isOpen ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
                aria-expanded={isOpen}
              >
                {/* Desktop */}
                <div className="hidden sm:flex items-center gap-x-3">
                  <span className="w-7 shrink-0 text-slate-300 text-xs tabular-nums">{i + 1}</span>
                  <span className="flex-1 text-slate-800 text-sm truncate pr-2">{row.question}</span>

                  <div className="w-28 shrink-0">
                    <MiniBar value={priceIF} colorClass="bg-slate-400" />
                  </div>
                  <div className="w-28 shrink-0">
                    <MiniBar value={row.iso_score} colorClass="bg-indigo-400" />
                  </div>
                  <div className="w-20 shrink-0 text-right">
                    <span className="tabular-nums text-xs text-slate-500">
                      {row.pu_prob != null ? row.pu_prob.toFixed(3) : '—'}
                    </span>
                  </div>
                  <div className="w-28 shrink-0 text-right">
                    <span className={`tabular-nums font-bold text-sm ${colors.score}`}>
                      {(getScore(row) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-24 shrink-0 flex items-center justify-between gap-1">
                    <span className={`text-[10px] px-2 py-0.5 font-semibold tracking-wide rounded ${colors.badge}`}>
                      {lvl.toUpperCase()}
                    </span>
                    <span className={`text-slate-400 text-sm transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                      ▾
                    </span>
                  </div>
                </div>

                {/* Mobile */}
                <div className="sm:hidden flex items-start gap-3">
                  <span className="text-slate-300 text-xs tabular-nums mt-0.5 shrink-0 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 text-sm leading-snug mb-1.5">{row.question}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 font-semibold tracking-wide rounded ${colors.badge}`}>
                        {lvl.toUpperCase()}
                      </span>
                      <span className={`tabular-nums font-bold text-sm ${colors.score}`}>
                        {(getScore(row) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <span className={`text-slate-400 text-sm mt-0.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                </div>
              </button>

              {/* ── Expanded detail panel ── */}
              {isOpen && (
                <div className="px-4 pb-5 pt-3 bg-slate-50 border-t border-blue-100">
                  <ScoreBreakdown row={row} />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                    {s ? (
                      <DetailSection title="Price Signals">
                        <DetailRow label="Volume"            value={fmtVol(s.volume)} />
                        <DetailRow label="Starting Price"    value={fmtNum(s.starting_price)} />
                        <DetailRow label="Final Price"       value={fmtNum(s.final_price)} />
                        <DetailRow label="Total Price Move"  value={fmtPct(s.total_price_move)}   anomalous={isAnomalousPrice('total_price_move', s.total_price_move)} />
                        <DetailRow label="Max Single Move"   value={fmtPct(s.max_single_move)}    anomalous={isAnomalousPrice('max_single_move', s.max_single_move)} />
                        <DetailRow label="Surprise Score"    value={fmtNum(s.surprise_score)}     anomalous={isAnomalousPrice('surprise_score', s.surprise_score)} />
                        <DetailRow label="Late Move Ratio"   value={fmtNum(s.late_move_ratio)}    anomalous={isAnomalousPrice('late_move_ratio', s.late_move_ratio)} />
                        <DetailRow label="Momentum 6h"       value={fmtNum(s.price_momentum_6h)}  anomalous={isAnomalousPrice('price_momentum_6h', s.price_momentum_6h)} />
                        <DetailRow label="Momentum 12h"      value={fmtNum(s.price_momentum_12h)} />
                        <DetailRow label="Price Volatility"  value={fmtNum(s.price_volatility)} />
                        <DetailRow label="Price IF Flag"     value={s.anomaly_score === -1 ? 'ANOMALOUS' : 'normal'} anomalous={s.anomaly_score === -1} />
                      </DetailSection>
                    ) : (
                      <DetailSection title="Price Signals">
                        <p className="text-slate-300 text-xs py-2">No price data available.</p>
                      </DetailSection>
                    )}

                    {w ? (
                      <DetailSection title="Wallet Signals">
                        <DetailRow label="Unique Wallets"       value={w.unique_wallets} />
                        <DetailRow label="Trade Count"          value={w.trade_count} />
                        <DetailRow label="Total Volume"         value={fmtVol(w.total_volume)} />
                        <DetailRow label="New Wallet Ratio"     value={fmtPct(w.new_wallet_ratio)}      anomalous={isAnomalous('new_wallet_ratio', w.new_wallet_ratio)} />
                        <DetailRow label="New Wallet Ratio 6h"  value={fmtPct(w.new_wallet_ratio_6h)} />
                        <DetailRow label="Order Flow Imbalance" value={fmtNum(w.order_flow_imbalance)}  anomalous={isAnomalous('order_flow_imbalance', w.order_flow_imbalance)} />
                        <DetailRow label="Burst Score"          value={w.burst_score != null ? fmtNum(w.burst_score, 1) : '—'} anomalous={isAnomalous('burst_score', w.burst_score)} />
                        <DetailRow label="Wallet Concentration" value={fmtNum(w.wallet_concentration)}  anomalous={isAnomalous('wallet_concentration', w.wallet_concentration)} />
                        <DetailRow label="Wallet Age (median)"  value={w.wallet_age_median_days != null ? `${Math.round(w.wallet_age_median_days)}d` : '—'} anomalous={isAnomalous('wallet_age_median_days', w.wallet_age_median_days)} />
                        <DetailRow label="Cross-Market Wallets" value={w.cross_market_wallet_flag ?? '—'} anomalous={isAnomalous('cross_market_wallet_flag', w.cross_market_wallet_flag)} />
                      </DetailSection>
                    ) : (
                      <DetailSection title="Wallet Signals">
                        <p className="text-slate-300 text-xs py-2">No wallet data available.</p>
                      </DetailSection>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
