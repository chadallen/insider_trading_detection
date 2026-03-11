import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import SuspicionTable from './components/SuspicionTable'
import ScatterPlot from './components/ScatterPlot'

function parseCsv(text) {
  return Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data
}

export default function App() {
  const [data, setData]       = useState([])
  const [scored, setScored]   = useState({})   // keyed by question
  const [wallet, setWallet]   = useState({})   // keyed by question
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/df_combined.csv').then((r) => r.text()),
      fetch('/df_scored.csv').then((r) => r.text()),
      fetch('/df_wallet_agg.csv').then((r) => r.text()),
    ])
      .then(([combined, scoredCsv, walletCsv]) => {
        const sorted = [...parseCsv(combined)].sort((a, b) => b.combined_score - a.combined_score)
        setData(sorted)

        const scoredMap = {}
        parseCsv(scoredCsv).forEach((row) => { scoredMap[row.question] = row })
        setScored(scoredMap)

        const walletMap = {}
        parseCsv(walletCsv).forEach((row) => { walletMap[row.question] = row })
        setWallet(walletMap)

        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const high   = data.filter((d) => d.combined_score >= 0.35).length
  const medium = data.filter((d) => d.combined_score >= 0.25 && d.combined_score < 0.35).length
  const low    = data.filter((d) => d.combined_score <  0.25).length

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <span className="text-red-500 text-lg select-none">▲</span>
            <h1 className="text-lg font-bold text-white tracking-tight">
              Polymarket Insider Trading Detector
            </h1>
            <span className="text-[11px] font-semibold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full ring-1 ring-red-500/30 uppercase tracking-widest">
              POC
            </span>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed ml-7 max-w-3xl">
            Proof-of-concept detector for informed trading in prediction markets.
            Combines{' '}
            <span className="text-gray-300">VPIN</span> (Volume-Synchronized Probability of
            Informed Trading),{' '}
            <span className="text-gray-300">price volatility</span>, and{' '}
            <span className="text-gray-300">anomaly detection</span> to flag markets where
            insiders may have traded ahead of outcomes.
            High suspicion scores (&gt;0.08) warrant further investigation.
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {loading && (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
            <span className="animate-pulse">Loading market data…</span>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-64 text-red-400 text-sm">
            Failed to load CSV: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Stats bar ── */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                count={high}
                label="High Suspicion"
                sub="≥ 0.35 combined score"
                colorClass="text-red-400"
                borderClass="border-red-900/50 bg-red-950/25"
              />
              <StatCard
                count={medium}
                label="Medium Suspicion"
                sub="0.25 – 0.35 combined score"
                colorClass="text-yellow-400"
                borderClass="border-yellow-900/50 bg-yellow-950/15"
              />
              <StatCard
                count={low}
                label="Low / Clean"
                sub="< 0.25 combined score"
                colorClass="text-green-400"
                borderClass="border-green-900/40 bg-green-950/15"
              />
            </div>

            {/* ── Scatter plot ── */}
            <section className="bg-gray-900/40 border border-gray-800 rounded-xl p-6">
              <SectionTitle>Price Score vs Wallet Score</SectionTitle>
              <p className="text-gray-500 text-xs mb-4">
                Markets in the upper-right corner show anomalous signals in both dimensions.
                Bubble size reflects combined score magnitude.
              </p>
              <ScatterPlot data={data.filter((d) => d.wallet_score != null && !isNaN(d.wallet_score))} />
            </section>

            {/* ── Ranked table ── */}
            <section className="bg-gray-900/40 border border-gray-800 rounded-xl p-6">
              <SectionTitle>Markets Ranked by Combined Score</SectionTitle>
              <p className="text-gray-500 text-xs mb-4">
                Sorted highest → lowest. Click any row to see full signal detail.
              </p>
              <SuspicionTable data={data} scored={scored} wallet={wallet} onRowClick={setSelected} selected={selected} />
            </section>

            {/* ── Footer ── */}
            <footer className="text-center text-gray-700 text-xs pb-6">
              POC · for research purposes only · data sourced from Polymarket public API
            </footer>
          </>
        )}
      </main>

    </div>
  )
}

function StatCard({ count, label, sub, colorClass, borderClass }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${borderClass}`}>
      <div className={`text-3xl font-bold tabular-nums ${colorClass}`}>{count}</div>
      <div className="text-gray-200 text-sm font-medium mt-1">{label}</div>
      <div className="text-gray-500 text-xs mt-0.5">{sub}</div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
      {children}
    </h2>
  )
}
