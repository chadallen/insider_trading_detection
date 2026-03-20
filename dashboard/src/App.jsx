import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import SuspicionTable from './components/SuspicionTable'
import ScatterPlot from './components/ScatterPlot'

function parseCsv(text) {
  return Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true }).data
}

async function tryFetch(url) {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return r.text()
  } catch {
    return null
  }
}

export default function App() {
  const [tab, setTab] = useState('historical')

  const [data, setData]       = useState([])
  const [scored, setScored]   = useState({})
  const [wallet, setWallet]   = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [selected, setSelected] = useState(null)

  const [liveData, setLiveData]       = useState(null)
  const [liveScored, setLiveScored]   = useState({})
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError]     = useState(null)
  const [liveSelected, setLiveSelected] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/df_combined.csv').then((r) => r.text()),
      fetch('/df_scored.csv').then((r) => r.text()),
      fetch('/df_wallet_agg.csv').then((r) => r.text()),
    ])
      .then(([combined, scoredCsv, walletCsv]) => {
        const getScore = (d) => d.insider_trading_prob ?? d.combined_score ?? 0
        const sorted = [...parseCsv(combined)].sort((a, b) => getScore(b) - getScore(a))
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

  useEffect(() => {
    if (tab !== 'live' || liveData !== null) return
    setLiveLoading(true)
    Promise.all([
      tryFetch('/df_live.csv'),
      tryFetch('/df_live_scored.csv'),
    ]).then(([liveCsv, liveScoredCsv]) => {
      if (!liveCsv) {
        setLiveData([])
        setLiveLoading(false)
        return
      }
      const sorted = [...parseCsv(liveCsv)].sort(
        (a, b) => (b.insider_trading_prob ?? b.combined_score) - (a.insider_trading_prob ?? a.combined_score)
      )
      setLiveData(sorted)
      if (liveScoredCsv) {
        const m = {}
        parseCsv(liveScoredCsv).forEach((row) => { m[row.question] = row })
        setLiveScored(m)
      }
      setLiveLoading(false)
    }).catch((e) => {
      setLiveError(e.message)
      setLiveLoading(false)
    })
  }, [tab, liveData])

  const rowScore = (d) => d.insider_trading_prob ?? d.combined_score ?? 0

  // Historical stats
  const high   = data.filter((d) => rowScore(d) >= 0.35).length
  const medium = data.filter((d) => rowScore(d) >= 0.25 && rowScore(d) < 0.35).length
  const low    = data.filter((d) => rowScore(d) <  0.25).length

  // Live stats (computed from liveData, not historical data)
  const liveArr    = liveData ?? []
  const liveHigh   = liveArr.filter((d) => rowScore(d) >= 0.35).length
  const liveMedium = liveArr.filter((d) => rowScore(d) >= 0.25 && rowScore(d) < 0.35).length
  const liveLow    = liveArr.filter((d) => rowScore(d) <  0.25).length

  // scatter: historical data only
  const scatterData = data.filter(
    (d) => d.suspicion_score != null && !isNaN(d.suspicion_score) &&
           d.iso_score != null && !isNaN(d.iso_score)
  )

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-8 py-3 border-b border-zinc-100">
            <div className="flex items-center gap-2 shrink-0">
              <h1 className="text-[13px] font-semibold text-zinc-900 tracking-tight">
                Insider Trading Detector
              </h1>
              <span className="text-[10px] font-medium border border-zinc-200 text-zinc-400 px-1.5 py-0.5 rounded">
                POC
              </span>
            </div>
            <p className="text-zinc-400 text-[12px] leading-relaxed hidden md:block">
              Ensemble model (PU-LightGBM + IsolationForest + OC-SVM) scoring resolved Polymarket political markets on{' '}
              <span className="text-zinc-600">price anomaly</span> and{' '}
              <span className="text-zinc-600">on-chain wallet behavior</span>.
            </p>
          </div>
          <div className="flex gap-5">
            <TabButton active={tab === 'historical'} onClick={() => { setTab('historical'); setSelected(null) }}>
              Historical Markets
            </TabButton>
            <TabButton active={tab === 'live'} onClick={() => { setTab('live'); setLiveSelected(null) }}>
              Live Markets
              <span className="text-[9px] font-medium bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">
                ending soon
              </span>
            </TabButton>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-5">

        {/* ── Historical tab ── */}
        {tab === 'historical' && (
          <>
            {loading && <LoadingState />}
            {error && <ErrorState msg={error} />}
            {!loading && !error && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard count={high}   label="High Suspicion"    sub="insider prob ≥ 0.35"    colorClass="text-rose-600" />
                  <StatCard count={medium} label="Medium Suspicion"   sub="insider prob 0.25–0.35" colorClass="text-amber-600" />
                  <StatCard count={low}    label="Low / Inconclusive" sub="insider prob < 0.25"    colorClass="text-zinc-400" />
                </div>

                {data.length > 0 && (
                  <section className="bg-white border border-zinc-200 rounded-lg p-6">
                    <h2 className="text-[13px] font-medium text-zinc-700 mb-0.5">
                      Insider Trading Probability by Market
                    </h2>
                    <p className="text-zinc-400 text-[12px] mb-5">
                      Dashed lines mark the high (35%) and medium (25%) suspicion thresholds.
                    </p>
                    <ScatterPlot data={data} />
                  </section>
                )}

                <section className="bg-white border border-zinc-200 rounded-lg">
                  <div className="px-6 pt-4 pb-3 border-b border-zinc-100">
                    <h2 className="text-[13px] font-medium text-zinc-700">
                      Resolved Markets — Ranked by Insider Trading Probability
                    </h2>
                    <p className="text-zinc-400 text-[12px] mt-0.5">
                      Click any row to expand signal detail. Click column headers to sort.
                    </p>
                  </div>
                  <SuspicionTable data={data} scored={scored} wallet={wallet} onRowClick={setSelected} selected={selected} />
                </section>

                <Footer />
              </>
            )}
          </>
        )}

        {/* ── Live tab ── */}
        {tab === 'live' && (
          <>
            {liveLoading && <LoadingState />}
            {liveError && <ErrorState msg={liveError} />}
            {!liveLoading && !liveError && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard count={liveHigh}   label="High Suspicion"    sub="insider prob ≥ 0.35"    colorClass="text-rose-600" />
                  <StatCard count={liveMedium} label="Medium Suspicion"   sub="insider prob 0.25–0.35" colorClass="text-amber-600" />
                  <StatCard count={liveLow}    label="Low / Inconclusive" sub="insider prob < 0.25"    colorClass="text-zinc-400" />
                </div>

                {liveArr.length === 0 ? (
                  <div className="bg-white border border-zinc-200 rounded-lg px-6 py-16 text-center">
                    <p className="text-zinc-400 text-sm">No live market data available.</p>
                    <p className="text-zinc-300 text-xs mt-1">
                      Run <code className="font-mono text-zinc-500">python run.py --live</code> to generate live scores.
                    </p>
                  </div>
                ) : (
                  <section className="bg-white border border-zinc-200 rounded-lg">
                    <div className="px-6 pt-4 pb-3 border-b border-zinc-100">
                      <h2 className="text-[13px] font-medium text-zinc-700">
                        Live Markets — Ranked by Insider Trading Probability
                      </h2>
                      <p className="text-zinc-400 text-[12px] mt-0.5">
                        Click any row to expand signal detail. Click column headers to sort.
                      </p>
                    </div>
                    <SuspicionTable data={liveArr} scored={liveScored} wallet={{}} onRowClick={setLiveSelected} selected={liveSelected} />
                  </section>
                )}

                <Footer />
              </>
            )}
          </>
        )}

      </main>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-indigo-500 text-zinc-900'
          : 'border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

function StatCard({ count, label, sub, colorClass }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg px-5 py-4">
      <div className={`text-3xl font-semibold tabular-nums leading-none ${colorClass}`}>{count}</div>
      <div className="text-zinc-700 text-[13px] font-medium mt-2.5">{label}</div>
      <div className="text-zinc-400 text-[11px] mt-0.5">{sub}</div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">
      Loading market data…
    </div>
  )
}

function ErrorState({ msg }) {
  return (
    <div className="flex items-center justify-center h-64 text-rose-500 text-sm">
      Failed to load CSV: {msg}
    </div>
  )
}

function Footer() {
  return (
    <footer className="text-center text-zinc-300 text-xs pb-6">
      POC · for research purposes only · data sourced from Polymarket public API
    </footer>
  )
}
