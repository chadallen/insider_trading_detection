import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from 'recharts'

const getColor = (score) =>
  score >= 0.35 ? '#dc2626' : score >= 0.25 ? '#d97706' : '#3b82f6'

const getLevelLabel = (score) =>
  score >= 0.35 ? 'HIGH' : score >= 0.25 ? 'MEDIUM' : 'LOW'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const ens = d.insider_trading_prob ?? d.combined_score ?? 0
  const color = getColor(ens)
  return (
    <div className="border border-blue-200 rounded-lg p-3 shadow-lg text-xs max-w-[280px] bg-white">
      <p className="text-slate-800 font-semibold mb-2 leading-snug">{d.question}</p>
      <div className="space-y-1">
        {[
          ['Price IF Score',  d.suspicion_score != null ? (d.suspicion_score + 0.5).toFixed(3) : '—'],
          ['IsoForest Score', d.iso_score != null ? d.iso_score.toFixed(3) : '—'],
          ['PU-LGB',          d.pu_prob != null ? d.pu_prob.toFixed(3) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6">
            <span className="text-slate-400">{k}</span>
            <span className="text-slate-700 tabular-nums">{v}</span>
          </div>
        ))}
        <div className="flex justify-between gap-6 pt-1 border-t border-slate-100">
          <span className="text-slate-400">Insider Prob</span>
          <span style={{ color }} className="font-bold tabular-nums">
            {(ens * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-slate-400">Level</span>
          <span style={{ color }} className="font-bold">{getLevelLabel(ens)}</span>
        </div>
      </div>
    </div>
  )
}

function CustomDot({ cx, cy, payload, minScore, range }) {
  if (cx == null || cy == null) return null
  const ens = payload.insider_trading_prob ?? payload.combined_score ?? 0
  const normalized = range > 0 ? (ens - minScore) / range : 0.5
  const r = 5 + normalized * 18
  const color = getColor(ens)
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      fillOpacity={0.55}
      stroke={color}
      strokeWidth={1}
      strokeOpacity={0.8}
    />
  )
}

export default function ScatterPlot({ data }) {
  if (!data.length) return null

  // x: suspicion_score normalized to [0,1] (price-only IsoForest)
  // y: iso_score [0,1] (full-feature IsoForest)
  const plotData = data.map((d) => ({
    ...d,
    x: Math.max(0, Math.min(1, (d.suspicion_score ?? 0) + 0.5)),
    y: d.iso_score ?? 0,
  }))

  const scores = data.map((d) => d.insider_trading_prob ?? d.combined_score ?? 0)
  const minScore = Math.min(...scores)
  const maxScore = Math.max(...scores)
  const range = maxScore - minScore

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-6 mb-4 text-xs text-slate-400 flex-wrap">
        <span>Risk level →</span>
        {[
          ['#dc2626', 'High  (≥35%)'],
          ['#d97706', 'Medium (25–35%)'],
          ['#3b82f6', 'Low (<25%)'],
        ].map(([color, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: color, opacity: 0.7 }} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-slate-300">Bubble size = ensemble insider prob</span>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 10, right: 40, bottom: 44, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

          <XAxis
            type="number"
            dataKey="x"
            domain={[0, 1]}
            tickFormatter={(v) => v.toFixed(2)}
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
            tickLine={{ stroke: '#cbd5e1' }}
            axisLine={{ stroke: '#cbd5e1' }}
          >
            <Label
              value="Price Anomaly Score (IsoForest — price only)"
              position="insideBottom"
              offset={-26}
              fill="#94a3b8"
              fontSize={11}
            />
          </XAxis>

          <YAxis
            type="number"
            dataKey="y"
            domain={[0, 1]}
            tickFormatter={(v) => v.toFixed(2)}
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
            tickLine={{ stroke: '#cbd5e1' }}
            axisLine={{ stroke: '#cbd5e1' }}
            width={55}
          >
            <Label
              value="IsoForest Score (all 14 features)"
              angle={-90}
              position="insideLeft"
              offset={-10}
              fill="#94a3b8"
              fontSize={11}
            />
          </YAxis>

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#bfdbfe', strokeWidth: 1, strokeDasharray: '4 4' }}
          />

          <ReferenceLine
            x={0.5}
            stroke="#bfdbfe"
            strokeDasharray="5 3"
            label={{ value: 'Price 0.5', fill: '#93c5fd', fontSize: 10, position: 'insideTopRight' }}
          />
          <ReferenceLine
            y={0.5}
            stroke="#bfdbfe"
            strokeDasharray="5 3"
            label={{ value: 'ISO 0.5', fill: '#93c5fd', fontSize: 10, position: 'insideTopRight' }}
          />

          <Scatter
            data={plotData}
            shape={(props) => (
              <CustomDot {...props} minScore={minScore} range={range} />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
