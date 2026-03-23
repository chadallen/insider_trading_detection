// Features shown as columns, in display order.
// abs: take absolute value before normalizing (signed features)
// invert: high raw value = low suspicion (e.g. old wallet age is less suspicious)
const FEATURES = [
  { key: 'surprise_score',        label: 'Surprise',    abs: false, invert: false },
  { key: 'late_move_ratio',       label: 'Late Move',   abs: false, invert: false },
  { key: 'new_wallet_ratio',      label: 'New Wallets', abs: false, invert: false },
  { key: 'burst_score',           label: 'Burst',       abs: false, invert: false },
  { key: 'order_flow_imbalance',  label: 'Flow Imbal',  abs: true,  invert: false },
  { key: 'wallet_concentration',  label: 'Conc.',       abs: false, invert: false },
  { key: 'wallet_age_median_days',label: 'Wallet Age',  abs: false, invert: true  },
  { key: 'cross_market_wallet_flag', label: 'Cross-Mkt',abs: false, invert: false },
]

// White (#fff7ed, orange-50) → orange (#f97316, orange-500)
function cellColor(norm) {
  if (norm == null) return '#f4f4f5' // zinc-100, missing data
  const r = Math.round(255 + (249 - 255) * norm)
  const g = Math.round(247 + (115 - 247) * norm)
  const b = Math.round(237 + (22  - 237) * norm)
  return `rgb(${r},${g},${b})`
}

// Text color that stays readable over the gradient
function cellTextColor(norm) {
  return norm != null && norm > 0.55 ? '#7c2d12' : '#71717a'
}

export default function FeatureHeatmap({ data }) {
  if (!data.length) return null

  // Min-max per feature across all rows
  const ranges = {}
  FEATURES.forEach(({ key, abs }) => {
    const vals = data
      .map((d) => { const v = d[key]; return (v != null && !isNaN(v)) ? (abs ? Math.abs(v) : v) : null })
      .filter((v) => v != null)
    ranges[key] = vals.length
      ? { min: Math.min(...vals), max: Math.max(...vals) }
      : { min: 0, max: 1 }
  })

  const normalize = (key, val, abs, invert) => {
    if (val == null || isNaN(val)) return null
    const v = abs ? Math.abs(val) : val
    const { min, max } = ranges[key]
    const n = max === min ? 0 : (v - min) / (max - min)
    return invert ? 1 - n : n
  }

  const sorted = [...data].sort(
    (a, b) => (b.insider_trading_prob ?? 0) - (a.insider_trading_prob ?? 0)
  )

  const LABEL_W = 192
  const CELL_W  = 52
  const ENS_W   = 68
  const GAP     = 4

  return (
    <div className="overflow-x-auto">
      {/* Column headers */}
      <div className="flex items-end mb-1" style={{ paddingLeft: LABEL_W + GAP }}>
        {FEATURES.map((f) => (
          <div
            key={f.key}
            className="shrink-0 flex items-end justify-center"
            style={{ width: CELL_W, marginRight: GAP }}
          >
            <span
              className="text-[9px] font-mono text-zinc-400 block text-center leading-tight"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 52 }}
            >
              {f.label}
            </span>
          </div>
        ))}
        <div className="shrink-0 flex items-end justify-center" style={{ width: ENS_W }}>
          <span
            className="text-[9px] font-mono text-zinc-500 font-medium block text-center leading-tight"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 52 }}
          >
            Ensemble
          </span>
        </div>
      </div>

      {/* Data rows */}
      <div className="space-y-0.5">
        {sorted.map((row, i) => {
          const score = row.insider_trading_prob ?? row.combined_score ?? 0
          const ensNorm = score // already 0-1
          return (
            <div key={i} className="flex items-center">
              {/* Market label */}
              <div
                className="shrink-0 pr-3 text-right"
                style={{ width: LABEL_W }}
              >
                <span
                  className="text-[10px] text-zinc-500 font-mono block truncate"
                  title={row.question}
                >
                  {row.question}
                </span>
              </div>

              {/* Feature cells */}
              {FEATURES.map(({ key, abs, invert }) => {
                const norm = normalize(key, row[key], abs, invert)
                const bg   = cellColor(norm)
                const raw  = row[key]
                return (
                  <div
                    key={key}
                    className="shrink-0 rounded-sm"
                    style={{ width: CELL_W, height: 24, marginRight: GAP, backgroundColor: bg }}
                    title={`${key}: ${raw != null ? Number(raw).toFixed(3) : '—'}`}
                  />
                )
              })}

              {/* Ensemble score cell */}
              <div
                className="shrink-0 rounded-sm flex items-center justify-center"
                style={{ width: ENS_W, height: 24, backgroundColor: cellColor(ensNorm) }}
              >
                <span
                  className="text-[10px] font-mono font-semibold"
                  style={{ color: cellTextColor(ensNorm) }}
                >
                  {(score * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3" style={{ paddingLeft: LABEL_W + GAP }}>
        <span className="text-[9px] font-mono text-zinc-400">low</span>
        <div
          className="rounded-sm"
          style={{
            width: 80,
            height: 8,
            background: 'linear-gradient(to right, #fff7ed, #f97316)',
          }}
        />
        <span className="text-[9px] font-mono text-zinc-400">high suspicion</span>
        <span className="text-[9px] font-mono text-zinc-300 ml-3">· normalized per column · gray = missing data</span>
      </div>
    </div>
  )
}
