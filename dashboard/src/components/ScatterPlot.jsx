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
  score >= 0.35 ? '#ef4444' : score >= 0.25 ? '#eab308' : '#22c55e'

const getLevelLabel = (score) =>
  score >= 0.35 ? 'HIGH' : score >= 0.25 ? 'MEDIUM' : 'LOW'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const color = getColor(d.combined_score)
  return (
    <div className="bg-gray-900 border border-gray-600 rounded-lg p-3 shadow-2xl text-xs max-w-[260px]">
      <p className="text-gray-100 font-semibold mb-2 leading-snug">{d.question}</p>
      <div className="space-y-1">
        {[
          ['Price Score',    d.price_score.toFixed(4)],
          ['Wallet Score',   d.wallet_score.toFixed(4)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6">
            <span className="text-gray-500">{k}</span>
            <span className="text-gray-200 tabular-nums">{v}</span>
          </div>
        ))}
        <div className="flex justify-between gap-6 pt-1 border-t border-gray-700/50">
          <span className="text-gray-500">Combined</span>
          <span style={{ color }} className="font-bold tabular-nums">
            {d.combined_score.toFixed(4)}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-gray-500">Risk Level</span>
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
      fillOpacity={0.72}
      stroke={color}
      strokeWidth={1}
      strokeOpacity={0.9}
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
      <div className="flex items-center gap-6 mb-4 text-xs text-gray-400">
        <span className="text-gray-600">Risk level →</span>
        {[
          ['#ef4444', 'High  (≥0.35)'],
          ['#eab308', 'Medium (≥0.25)'],
          ['#22c55e', 'Low (<0.25)'],
        ].map(([color, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: color, opacity: 0.8 }}
            />
            {label}
          </span>
        ))}
        <span className="ml-auto text-gray-600">Bubble size = combined score magnitude</span>
      </div>

      <ResponsiveContainer width="100%" height={420}>
        <ScatterChart margin={{ top: 10, right: 40, bottom: 40, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />

          <XAxis
            type="number"
            dataKey="price_score"
            domain={['auto', 'auto']}
            tickFormatter={(v) => v.toFixed(2)}
            tick={{ fill: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}
            tickLine={{ stroke: '#374151' }}
            axisLine={{ stroke: '#374151' }}
          >
            <Label
              value="Price Score"
              position="insideBottom"
              offset={-20}
              fill="#6b7280"
              fontSize={12}
            />
          </XAxis>

          <YAxis
            type="number"
            dataKey="wallet_score"
            domain={[0, 1]}
            tickFormatter={(v) => v.toFixed(2)}
            tick={{ fill: '#6b7280', fontSize: 11, fontFamily: 'monospace' }}
            tickLine={{ stroke: '#374151' }}
            axisLine={{ stroke: '#374151' }}
            width={55}
          >
            <Label
              value="Wallet Score"
              angle={-90}
              position="insideLeft"
              offset={-10}
              fill="#6b7280"
              fontSize={12}
            />
          </YAxis>

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: '#374151', strokeWidth: 1, strokeDasharray: '4 4' }}
          />

          <ReferenceLine
            y={0.5}
            stroke="#374151"
            strokeDasharray="6 3"
            label={{ value: 'Wallet 0.5', fill: '#4b5563', fontSize: 10, position: 'insideTopRight' }}
          />
          <ReferenceLine
            y={0.8}
            stroke="#78350f"
            strokeDasharray="6 3"
            label={{ value: 'Wallet 0.8', fill: '#92400e', fontSize: 10, position: 'insideTopRight' }}
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
