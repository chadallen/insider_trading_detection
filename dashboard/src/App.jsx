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

  // Historical data
  const [data, setData]       = useState([])
  const [scored, setScored]   = useState({})
  const [wallet, setWallet]   = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [selected, setSelected] = useState(null)

  // Live data
  const [liveData, setLiveData]       = useState(null)  // null = not loaded yet
  const [liveScored, setLiveScored]   = useState({})
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError]     = useState(null)
  const [liveSelected, setLiveSelected] = useState(null)

  // Load historical on mount
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

  // Load live data when tab switches to 'live'
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

  return (
    <div className="min-h-screen text-stone-900" style={{ backgroundColor: '#f7f3ed' }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-stone-300" style={{ backgroundColor: '#f7f3ed' }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <h1 className="text-base font-bold text-stone-900 tracking-tight">
              Polymarket Insider Trading Detector
            </h1>
            <span className="text-[10px] font-medium border border-stone-400 text-stone-500 px-1.5 py-0.5 uppercase tracking-widest">
              POC
            </span>
          </div>
          <p className="text-stone-600 text-xs leading-relaxed max-w-3xl">
            Proof-of-concept detector for informed trading in prediction markets.
            Combines{' '}
            <span className="text-stone-800">VPIN</span> (Volume-Synchronized Probability of
            Informed Trading),{' '}
            <span className="text-stone-800">price volatility</span>, and{' '}
            <span className="text-stone-800">anomaly detection</span> to flag markets where
            insiders may have traded ahead of outcomes.
          </p>

          {/* ── Tabs ── */}
          <div className="mt-3 flex gap-1">
            <TabButton active={tab === 'historical'} onClick={() => { setTab('historical'); setSelected(null) }}>
              Historical
            </TabButton>
            <TabButton active={tab === 'live'} onClick={() => { setTab('live'); setLiveSelected(null) }}>
              Live Markets
              <span className="ml-1.5 text-[9px] font-medium border border-stone-400 text-stone-500 px-1 py-0.5 uppercase">
                ending soon
              </span>
            </TabButton>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── Historical tab ── */}
        {tab === 'historical' && (
          <>
            {loading && <LoadingState />}
            {error && <ErrorState msg={error} />}
            {!loading && !error && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard count={high}   label="High Suspicion"  sub="≥ 0.35 combined score" colorClass="text-red-800"    borderClass="border-stone-300 bg-stone-50" />
                  <StatCard count={medium} label="Medium Suspicion" sub="0.25 – 0.35 combined score" colorClass="text-amber-900" borderClass="border-stone-300 bg-stone-50" />
                  <StatCard count={low}    label="Low / Clean"      sub="< 0.25 combined score" colorClass="text-emerald-800"  borderClass="border-stone-300 bg-stone-50" />
                </div>
                <section className="border border-stone-300 bg-stone-50 rounded p-6">
                  <SectionTitle>Resolved Markets — Ranked by Combined Score</SectionTitle>
                  <p className="text-stone-500 text-xs mb-4">
                    Sorted highest → lowest. Click any row to see full signal detail.
                  </p>
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
            {/* ── Stats bar ── */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard
                count={high}
                label="High Suspicion"
                sub="≥ 0.35 combined score"
                colorClass="text-red-800"
                borderClass="border-stone-300 bg-stone-50"
              />
              <StatCard
                count={medium}
                label="Medium Suspicion"
                sub="0.25 – 0.35 combined score"
                colorClass="text-amber-900"
                borderClass="border-stone-300 bg-stone-50"
              />
              <StatCard
                count={low}
                label="Low / Clean"
                sub="< 0.25 combined score"
                colorClass="text-emerald-800"
                borderClass="border-stone-300 bg-stone-50"
              />
            </div>

            {/* ── Scatter plot ── */}
            <section className="border border-stone-300 bg-stone-50 rounded p-6">
              <SectionTitle>Price Score vs Wallet Score</SectionTitle>
              <p className="text-stone-500 text-xs mb-4">
                Markets in the upper-right corner show anomalous signals in both dimensions.
                Bubble size reflects combined score magnitude.
              </p>
              <ScatterPlot data={data.filter((d) => d.wallet_score != null && !isNaN(d.wallet_score))} />
            </section>

            {/* ── Ranked table ── */}
            <section className="border border-stone-300 bg-stone-50 rounded p-6">
              <SectionTitle>Markets Ranked by Combined Score</SectionTitle>
              <p className="text-stone-500 text-xs mb-4">
                Sorted highest → lowest. Click any row to see full signal detail.
              </p>
              <SuspicionTable data={data} scored={scored} wallet={wallet} onRowClick={setSelected} selected={selected} />
            </section>

            {/* ── Footer ── */}
            <footer className="text-center text-stone-400 text-xs pb-6">
              POC · for research purposes only · data sourced from Polymarket public API
            </footer>
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
      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-stone-200 text-stone-900'
          : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/60'
      }`}
    >
      {children}
    </button>
  )
}

function StatCard({ count, label, sub, colorClass, borderClass }) {
  return (
    <div className={`border p-4 text-center ${borderClass}`}>
      <div className={`text-3xl font-bold tabular-nums ${colorClass}`}>{count}</div>
      <div className="text-stone-700 text-sm font-medium mt-1">{label}</div>
      <div className="text-stone-400 text-xs mt-0.5">{sub}</div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-1">
      {children}
    </h2>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-64 text-stone-500 text-sm">
      <span>Loading market data…</span>
    </div>
  )
}

function ErrorState({ msg }) {
  return (
    <div className="flex items-center justify-center h-64 text-red-700 text-sm">
      Failed to load CSV: {msg}
    </div>
  )
}

function Footer() {
  return (
    <footer className="text-center text-stone-400 text-xs pb-6">
      POC · for research purposes only · data sourced from Polymarket public API
    </footer>
  )
}
