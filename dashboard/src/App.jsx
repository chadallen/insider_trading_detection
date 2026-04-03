import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import SuspicionTable from './components/SuspicionTable'
import ModelScatter from './components/ModelScatter'
import VolumeScatter from './components/VolumeScatter'

function parseCsv(text) {
  return Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data
}

export default function App() {
  const [data, setData]       = useState([])
  const [scored, setScored]   = useState({})
  const [wallet, setWallet]   = useState({})
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
        const scoredRows = parseCsv(scoredCsv)
        const scoredMap = {}
        scoredRows.forEach((row) => { scoredMap[row.question] = row })
        setScored(scoredMap)

        const walletMap = {}
        parseCsv(walletCsv).forEach((row) => { walletMap[row.question] = row })
        setWallet(walletMap)

        const getScore = (d) => d.insider_trading_prob ?? d.combined_score ?? 0
        const allRows = parseCsv(combined)
        // Filter to markets that resolved "yes" (final_price >= 0.5).
        // Markets without price data in df_scored are kept (can't confirm either way).
        const filtered = allRows.filter((d) => {
          const fp = scoredMap[d.question]?.final_price
          return fp == null || fp >= 0.5
        })
        const sorted = [...filtered].sort((a, b) => getScore(b) - getScore(a))
        setData(sorted)

        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* ── Header ── */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex flex-col gap-2">
            <div className="shrink-0">
              <h1 className="text-base font-bold text-zinc-900 tracking-tight font-mono uppercase">
                Prediction Market Forensics
              </h1>
            </div>
            <p className="text-zinc-700 text-[13px] leading-relaxed">
              Ensemble model (PU-LightGBM + IsolationForest + OC-SVM) scoring resolved Polymarket political markets on{' '}
              <span className="text-zinc-700 font-medium">price anomaly</span> and{' '}
              <span className="text-zinc-700 font-medium">on-chain wallet behavior</span>{' '}
              to surface potential insider trading.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-5">
        {loading && <LoadingState />}
        {error && <ErrorState msg={error} />}
        {!loading && !error && (
          <>
            {data.length > 0 && (
              <>
                {/* Two-chart row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <section className="bg-white border border-zinc-200 rounded-lg p-5">
                    <ChartHeader
                      title="Model Agreement"
                      meta="PU-LightGBM vs IsolationForest · dots colored by ensemble score"
                    />
                    <div style={{ height: 310 }}>
                      <ModelScatter data={data} />
                    </div>
                  </section>

                  <section className="bg-white border border-zinc-200 rounded-lg p-5">
                    <ChartHeader
                      title="Volume vs. Suspicion"
                      meta="market volume (log) vs ensemble score · high-volume anomalies are stronger signals"
                    />
                    <div style={{ height: 310 }}>
                      <VolumeScatter data={data} />
                    </div>
                  </section>
                </div>

</>
            )}

            {/* Table */}
            <section className="bg-white border border-zinc-200 rounded-lg">
              <div className="px-6 pt-4 pb-3 border-b border-zinc-100">
                <h2 className="text-[13px] font-medium text-zinc-700">
                  Resolved Markets — Ranked by Insider Trading Probability
                </h2>
                <p className="text-zinc-700 text-[12px] mt-0.5">
                  Click any row to expand signal detail. Click column headers to sort.
                </p>
              </div>
              <SuspicionTable data={data} scored={scored} wallet={wallet} onRowClick={setSelected} selected={selected} />
            </section>

            <Footer />
          </>
        )}
      </main>
    </div>
  )
}

function ChartHeader({ title, meta }) {
  return (
    <div className="mb-4">
      <h2 className="text-[13px] font-medium text-zinc-700">{title}</h2>
      <p className="text-zinc-700 text-[11px] font-mono mt-0.5">{meta}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-64 text-zinc-400 text-sm font-mono">
      loading market data…
    </div>
  )
}

function ErrorState({ msg }) {
  return (
    <div className="flex items-center justify-center h-64 text-rose-500 text-sm font-mono">
      error: {msg}
    </div>
  )
}

function Footer() {
  return <footer className="pb-6" />
}
