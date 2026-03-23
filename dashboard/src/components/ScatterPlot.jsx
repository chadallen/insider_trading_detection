import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  LabelList,
} from 'recharts'

const getScore = (d) => d.insider_trading_prob ?? d.combined_score ?? 0

const getColor = (score) =>
  score >= 0.35 ? '#e11d48' : score >= 0.25 ? '#d97706' : '#a1a1aa'

function truncate(str, n) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str ?? '')
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const ens = getScore(d)
  const color = getColor(ens)
  return (
    <div className="border border-zinc-200 rounded-lg p-3 shadow-sm text-xs max-w-[300px] bg-white">
      <p className="text-zinc-800 font-medium mb-2 leading-snug">{d.question}</p>
      <div className="space-y-1">
        {[
          ['Insider Prob', `${(ens * 100).toFixed(1)}%`],
          ['PU-LGB',      d.pu_prob    != null ? d.pu_prob.toFixed(3)                      : '—'],
          ['IsoForest',   d.iso_score  != null ? d.iso_score.toFixed(3)                    : '—'],
          ['Price IF',    d.suspicion_score != null ? (d.suspicion_score + 0.5).toFixed(3) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6">
            <span className="text-zinc-400">{k}</span>
            <span className="text-zinc-700 tabular-nums font-mono" style={{ color: k === 'Insider Prob' ? color : undefined }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ScatterPlot({ data }) {
  if (!data.length) return null

  // Sort ascending so highest probability is at top of chart
  const plotData = [...data]
    .sort((a, b) => getScore(a) - getScore(b))
    .map((d) => ({ ...d, prob: getScore(d) }))

  const barHeight = 28
  const chartHeight = plotData.length * barHeight + 32

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        layout="vertical"
        data={plotData}
        margin={{ top: 2, right: 64, bottom: 2, left: 8 }}
        barSize={12}
      >
        <CartesianGrid horizontal={false} stroke="#f4f4f5" />

        <XAxis
          type="number"
          domain={[0, 1]}
          tickFormatter={(v) => `${Math.round(v * 100)}%`}
          tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
          tickLine={false}
          axisLine={{ stroke: '#e4e4e7' }}
          tickCount={6}
        />

        <YAxis
          type="category"
          dataKey="question"
          width={260}
          tickFormatter={(v) => truncate(v, 42)}
          tick={{ fill: '#52525b', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
          tickLine={false}
          axisLine={false}
        />

        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />

        <ReferenceLine
          x={0.35}
          stroke="#fca5a5"
          strokeDasharray="4 3"
          label={{ value: '35%', position: 'top', fill: '#fca5a5', fontSize: 10, fontFamily: 'monospace' }}
        />
        <ReferenceLine
          x={0.25}
          stroke="#fcd34d"
          strokeDasharray="4 3"
          label={{ value: '25%', position: 'top', fill: '#fbbf24', fontSize: 10, fontFamily: 'monospace' }}
        />

        <Bar dataKey="prob" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {plotData.map((entry, i) => (
            <Cell key={i} fill={getColor(getScore(entry))} fillOpacity={0.8} />
          ))}
          <LabelList
            dataKey="prob"
            position="right"
            formatter={(v) => `${(v * 100).toFixed(1)}%`}
            style={{ fill: '#71717a', fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
