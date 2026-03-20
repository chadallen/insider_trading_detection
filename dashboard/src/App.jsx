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
  const high   = data.filter((d) => rowScore(d) >= 0.35).length
  const medium = data.filter((d) => rowScore(d) >= 0.25 && rowScore(d) < 0.35).length
  const low    = data.filter((d) => rowScore(d) <  0.25).length

  // scatter needs both axes to exist
  const scatterData = data.filter(
    (d) => d.suspicion_score != null && !isNaN(d.suspicion_score) &&
           d.iso_score != null && !isNaN(d.iso_score)
  )

  return (
    <div className="min-h-screen text-slate-900" style={{ backgroundColor: '#f0f5ff' }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-blue-200 bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-base font-bold text-white tracking-tight">
              Polymarket Insider Trading Detector
            </h1>
            <span className="text-[10px] font-semibold border border-blue-400 text-blue-300 px-1.5 py-0.5 uppercase tracking-widest rounded">
              POC
            </span>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed max-w-3xl">
            Ensemble model (PU-LightGBM + IsolationForest + One-Class SVM) scoring resolved Polymarket
            political markets on <span className="text-slate-200">price anomaly</span> and{' '}
            <span className="text-slate-200">on-chain wallet behavior</span> to flag potential insider trading.
          </p>
          <div className="mt-3 flex gap-1">
            <TabButton active={tab === 'historical'} onClick={() => { setTab('historical'); setSelected(null) }}>
              Historical Markets
            </TabButton>
            <TabButton active={tab === 'live'} onClick={() => { setTab('live'); setLiveSelected(null) }}>
              Live Markets
              <span className="ml-1.5 text-[9px] font-semibold border border-blue-500 text-blue-300 px-1 py-0.5 uppercase rounded">
                ending soon
              </span>
            </TabButton>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* ── Historical tab ── */}
        {tab === 'historical' && (
          <>
            {loading && <LoadingState />}
            {error && <ErrorState msg={error} />}
            {!loading && !error && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard count={high}   label="High Suspicion"   sub="insider prob ≥ 0.35" colorClass="text-red-600"    borderClass="border-red-200 bg-red-50" />
                  <StatCard count={medium} label="Medium Suspicion"  sub="insider prob 0.25–0.35" colorClass="text-amber-600" borderClass="border-amber-200 bg-amber-50" />
                  <StatCard count={low}    label="Low / Inconclusive" sub="insider prob < 0.25" colorClass="text-blue-600"   borderClass="border-blue-200 bg-blue-50" />
                </div>

                <section className="border border-blue-200 bg-white rounded-lg">
                  <div className="px-6 pt-5 pb-3 border-b border-blue-100">
                    <h2 className="text-sm font-semibold text-slate-700">
                      Resolved Markets — Ranked by Insider Trading Probability
                    </h2>
                    <p className="text-slate-400 text-xs mt-1">
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
            <div className="grid grid-cols-3 gap-4">
              <StatCard count={high}   label="High Suspicion"    sub="insider prob ≥ 0.35" colorClass="text-red-600"    borderClass="border-red-200 bg-red-50" />
              <StatCard count={medium} label="Medium Suspicion"   sub="insider prob 0.25–0.35" colorClass="text-amber-600" borderClass="border-amber-200 bg-amber-50" />
              <StatCard count={low}    label="Low / Inconclusive"  sub="insider prob < 0.25" colorClass="text-blue-600"   borderClass="border-blue-200 bg-blue-50" />
            </div>

            {scatterData.length > 0 && (
              <section className="border border-blue-200 bg-white rounded-lg p-6">
                <h2 className="text-sm font-semibold text-slate-700 mb-1">
                  Price Anomaly vs Full-Feature Isolation Score
                </h2>
                <p className="text-slate-400 text-xs mb-4">
                  Markets in the upper-right corner are anomalous on both price and wallet dimensions.
                  Bubble size reflects ensemble insider probability.
                </p>
                <ScatterPlot data={scatterData} />
              </section>
            )}

            <section className="border border-blue-200 bg-white rounded-lg">
              <div className="px-6 pt-5 pb-3 border-b border-blue-100">
                <h2 className="text-sm font-semibold text-slate-700">
                  Live Markets — Ranked by Insider Trading Probability
                </h2>
                <p className="text-slate-400 text-xs mt-1">
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

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-slate-400 hover:text-white hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function StatCard({ count, label, sub, colorClass, borderClass }) {
  return (
    <div className={`border rounded-lg p-4 text-center ${borderClass}`}>
      <div className={`text-3xl font-bold tabular-nums ${colorClass}`}>{count}</div>
      <div className="text-slate-700 text-sm font-medium mt-1">{label}</div>
      <div className="text-slate-400 text-xs mt-0.5">{sub}</div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
      Loading market data…
    </div>
  )
}

function ErrorState({ msg }) {
  return (
    <div className="flex items-center justify-center h-64 text-red-600 text-sm">
      Failed to load CSV: {msg}
    </div>
  )
}

function Footer() {
  return (
    <footer className="text-center text-slate-400 text-xs pb-6">
      POC · for research purposes only · data sourced from Polymarket public API
    </footer>
  )
}
