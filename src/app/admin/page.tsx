"use client";

import { useState, useEffect, useCallback } from "react";

interface SourceMetrics {
  source_id: string;
  total_fetches: number;
  successful: number;
  failed: number;
  success_rate: number;
  avg_response_ms: number;
  avg_extracted_length: number;
  last_fetch_at: string | null;
}

interface AgentRunSummary {
  agent_name: string;
  total_runs: number;
  completed: number;
  failed: number;
  avg_actions: number;
}

interface ExceptionSummary {
  reason_code: string;
  count: number;
  top_sources: string[];
}

interface FreshnessLag {
  source_id: string;
  hours_since_last: number;
  signal_count_7d: number;
}

interface AdminData {
  source_metrics: SourceMetrics[];
  agent_runs: AgentRunSummary[];
  exceptions: ExceptionSummary[];
  freshness: FreshnessLag[];
  totals: {
    total_diagnostics_24h: number;
    total_exceptions_24h: number;
    total_signals_24h: number;
    total_agent_runs_24h: number;
  };
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"7d" | "30d">("7d");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/metrics?period=${period}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !data) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Ingestion Observability</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Ingestion Observability</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Failed to load metrics: {error}</p>
          <button onClick={loadData} className="mt-2 btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const topFailing = data.source_metrics
    .filter((s) => s.total_fetches > 0)
    .sort((a, b) => a.success_rate - b.success_rate)
    .slice(0, 10);

  const staleSources = data.freshness
    .filter((f) => f.hours_since_last > 72)
    .sort((a, b) => b.hours_since_last - a.hours_since_last);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Ingestion Observability</h1>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "7d" | "30d")}
            className="input text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <button onClick={loadData} className="btn btn-secondary text-sm" disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Fetches (24h)" value={data.totals.total_diagnostics_24h} />
        <SummaryCard label="Signals (24h)" value={data.totals.total_signals_24h} />
        <SummaryCard label="Exceptions (24h)" value={data.totals.total_exceptions_24h} color={data.totals.total_exceptions_24h > 100 ? "red" : undefined} />
        <SummaryCard label="Agent Runs (24h)" value={data.totals.total_agent_runs_24h} />
      </div>

      {/* Top failing sources */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Top Failing Sources</h2>
        {topFailing.length === 0 ? (
          <p className="text-gray-500 text-sm">No failures in this period.</p>
        ) : (
          <div className="card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium text-right">Fetches</th>
                  <th className="pb-2 font-medium text-right">Success</th>
                  <th className="pb-2 font-medium text-right">Failed</th>
                  <th className="pb-2 font-medium text-right">Rate</th>
                  <th className="pb-2 font-medium text-right">Avg ms</th>
                </tr>
              </thead>
              <tbody>
                {topFailing.map((s) => (
                  <tr key={s.source_id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{s.source_id}</td>
                    <td className="py-2 text-right">{s.total_fetches}</td>
                    <td className="py-2 text-right text-green-700">{s.successful}</td>
                    <td className="py-2 text-right text-red-700">{s.failed}</td>
                    <td className="py-2 text-right">
                      <span className={s.success_rate < 0.5 ? "text-red-700 font-semibold" : s.success_rate < 0.8 ? "text-yellow-700" : "text-green-700"}>
                        {(s.success_rate * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-2 text-right text-gray-500">{s.avg_response_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Exception breakdown */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Exception Breakdown</h2>
        {data.exceptions.length === 0 ? (
          <p className="text-gray-500 text-sm">No exceptions recorded.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {data.exceptions.map((e) => (
              <div key={e.reason_code} className="card card-body">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-gray-700">{e.reason_code}</span>
                  <span className="badge badge-warning">{e.count}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Top sources: {e.top_sources.join(", ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stale sources */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Stale Sources (&gt;72h)</h2>
        {staleSources.length === 0 ? (
          <p className="text-gray-500 text-sm">All sources fresh.</p>
        ) : (
          <div className="card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium text-right">Hours Since Last</th>
                  <th className="pb-2 font-medium text-right">Signals (7d)</th>
                </tr>
              </thead>
              <tbody>
                {staleSources.map((f) => (
                  <tr key={f.source_id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{f.source_id}</td>
                    <td className="py-2 text-right">
                      <span className={f.hours_since_last > 168 ? "text-red-700 font-semibold" : "text-yellow-700"}>
                        {Math.round(f.hours_since_last)}h
                      </span>
                    </td>
                    <td className="py-2 text-right text-gray-500">{f.signal_count_7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Agent runs */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Agent Runs</h2>
        {data.agent_runs.length === 0 ? (
          <p className="text-gray-500 text-sm">No agent runs in this period.</p>
        ) : (
          <div className="card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                  <th className="pb-2 font-medium text-right">Completed</th>
                  <th className="pb-2 font-medium text-right">Failed</th>
                  <th className="pb-2 font-medium text-right">Avg Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.agent_runs.map((a) => (
                  <tr key={a.agent_name} className="border-b last:border-0">
                    <td className="py-2 font-medium">{a.agent_name}</td>
                    <td className="py-2 text-right">{a.total_runs}</td>
                    <td className="py-2 text-right text-green-700">{a.completed}</td>
                    <td className="py-2 text-right text-red-700">{a.failed}</td>
                    <td className="py-2 text-right text-gray-500">{a.avg_actions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="card card-body">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color === "red" ? "text-red-700" : ""}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
