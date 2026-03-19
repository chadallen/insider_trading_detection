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
  score >= 0.35 ? '#8b2635' : score >= 0.25 ? '#92400e' : '#15523a'

const getLevelLabel = (score) =>
  score >= 0.35 ? 'HIGH' : score >= 0.25 ? 'MEDIUM' : 'LOW'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const color = getColor(d.combined_score)
  return (
    <div className="border border-stone-300 rounded p-3 shadow-md text-xs max-w-[260px]" style={{ backgroundColor: '#f7f3ed' }}>
      <p className="text-stone-900 font-semibold mb-2 leading-snug">{d.question}</p>
      <div className="space-y-1">
        {[
          ['Price Score',    d.price_score.toFixed(4)],
          ['Wallet Score',   d.wallet_score.toFixed(4)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6">
            <span className="text-stone-500">{k}</span>
            <span className="text-stone-800 tabular-nums">{v}</span>
          </div>
        ))}
        <div className="flex justify-between gap-6 pt-1 border-t border-stone-200">
          <span className="text-stone-500">Combined</span>
          <span style={{ color }} className="font-bold tabular-nums">
            {d.combined_score.toFixed(4)}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-stone-500">Risk Level</span>
          <span style={{ color }} className="font-bold">{getLevelLabel(d.combined_score)}</span>
        </div>
      </div>
    </div>
  )
}

function CustomDot({ cx, cy, payload, minScore, range }) {
  if (cx == null || cy == null) return null
  const normalized = range > 0 ? (payload.combined_score - minScore) / range : 0.5
  const r = 5 + normalized * 18
  const color = getColor(payload.combined_score)
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      fillOpacity={0.65}
      stroke={color}
      strokeWidth={1}
      strokeOpacity={0.85}
    />
  )
}

export default function ScatterPlot({ data }) {
  if (!data.length) return null

  const scores = data.map((d) => d.combined_score)
  const minScore = Math.min(...scores)
  const maxScore = Math.max(...scores)
  const range = maxScore - minScore

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-6 mb-4 text-xs text-stone-500">
        <span className="text-stone-400">Risk level →</span>
        {[
          ['#8b2635', 'High  (≥0.35)'],
          ['#92400e', 'Medium (≥0.25)'],
          ['#15523a', 'Low (<0.25)'],
        ].map(([color, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: color, opacity: 0.75 }}
            />
            {label}
          </span>
        ))}
        <span className="ml-auto text-stone-400">Bubble size = combined score magnitude</span>
      </div>

      <ResponsiveContainer width="100%" height={420}>
        <ScatterChart margin={{ top: 10, right: 40, bottom: 40, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2dbd2" />

          <XAxis
            type="number"
            dataKey="price_score"
            domain={['auto', 'auto']}
            tickFormatter={(v) => v.toFixed(2)}
            tick={{ fill: '#78716c', fontSize: 11, fontFamily: 'monospace' }}
            tickLine={{ stroke: '#d5cdc3' }}
            axisLine={{ stroke: '#d5cdc3' }}
          >
            <Label
              value="Price Score"
              position="insideBottom"
              offset={-20}
              fill="#78716c"
              fontSize={12}
            />
          </XAxis>

          <YAxis
            type="number"
            dataKey="wallet_score"
            domain={[0, 1]}
            tickFormatter={(v) => v.toFixed(2)}
            tick={{ fill: '#78716c', fontSize: 11, fontFamily: 'monospace' }}
            tickLine={{ stroke: '#d5cdc3' }}
            axisLine={{ stroke: '#d5cdc3' }}
            width={55}
          >
            <Label
              value="Wallet Score"
              angle={-90}
              position="insideLeft"
              offset={-10}
              fill="#78716c"
              fontSize={12}
            />
          </YAxis>

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#c4bdb4', strokeWidth: 1, strokeDasharray: '4 4' }}
          />

          <ReferenceLine
            y={0.5}
            stroke="#c4bdb4"
            strokeDasharray="6 3"
            label={{ value: 'Wallet 0.5', fill: '#a09890', fontSize: 10, position: 'insideTopRight' }}
          />
          <ReferenceLine
            y={0.8}
            stroke="#b5a99e"
            strokeDasharray="6 3"
            label={{ value: 'Wallet 0.8', fill: '#8b7d72', fontSize: 10, position: 'insideTopRight' }}
          />

          <Scatter
            data={data}
            shape={(props) => (
              <CustomDot {...props} minScore={minScore} range={range} />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
