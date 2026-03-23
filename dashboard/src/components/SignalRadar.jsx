import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

// Features shown on the radar, normalized to [0, 1].
// abs: true means take absolute value before normalizing (signed features).
const FEATURES = [
  { key: 'surprise_score',       label: 'Surprise',    max: 1.0, abs: false },
  { key: 'late_move_ratio',      label: 'Late Move',   max: 1.0, abs: false },
  { key: 'max_single_move',      label: 'Max Move',    max: 0.5, abs: false },
  { key: 'price_momentum_6h',    label: 'Mom 6h',      max: 0.3, abs: true  },
  { key: 'new_wallet_ratio',     label: 'New Wallets', max: 1.0, abs: false },
  { key: 'order_flow_imbalance', label: 'Flow Imbal',  max: 1.0, abs: true  },
  { key: 'wallet_concentration', label: 'Conc.',       max: 1.0, abs: false },
  { key: 'burst_score',          label: 'Burst',       max: 100, abs: false },
]

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { feature, raw } = payload[0]?.payload ?? {}
  return (
    <div className="bg-white border border-zinc-200 rounded px-2.5 py-1.5 text-xs shadow-sm">
      <span className="text-zinc-500">{feature}: </span>
      <span className="font-mono text-zinc-800">{raw != null ? Number(raw).toFixed(3) : '—'}</span>
    </div>
  )
}

export default function SignalRadar({ row }) {
  const data = FEATURES.map(({ key, label, max, abs }) => {
    const val = row[key]
    if (val == null || isNaN(val)) {
      return { feature: label, value: 0, raw: null }
    }
    const v = abs ? Math.abs(val) : val
    return {
      feature: label,
      value: Math.min(1, Math.max(0, v / max)),
      raw: val,
    }
  })

  const hasData = data.some((d) => d.raw != null)
  if (!hasData) return null

  return (
    <div>
      <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1">
        Signal Radar
        <span className="ml-1 normal-case font-normal text-zinc-300">(normalized)</span>
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <RadarChart data={data} margin={{ top: 4, right: 24, bottom: 4, left: 24 }}>
          <PolarGrid stroke="#e4e4e7" />
          <PolarAngleAxis
            dataKey="feature"
            tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'ui-monospace, monospace' }}
          />
          <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Radar
            dataKey="value"
            stroke="#f97316"
            fill="#f97316"
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={{ fill: '#f97316', r: 2 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
