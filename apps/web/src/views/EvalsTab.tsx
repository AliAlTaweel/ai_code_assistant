import { useEffect, useState } from "react";
import { getLatestEvals, type EvalRun } from "../api/client.js";

export function EvalsTab() {
  const [run, setRun] = useState<EvalRun | null | undefined>(undefined);

  useEffect(() => {
    getLatestEvals().then(setRun);
  }, []);

  if (run === undefined) return null;
  if (run === null) return <p className="text-sm text-gray-500">No eval runs yet.</p>;

  return (
    <div>
      <p className="mb-3 text-sm font-medium text-gray-700">
        Pass rate: {(run.summary.passRate * 100).toFixed(0)}% · Avg latency:{" "}
        {run.summary.avgLatencyMs.toFixed(0)}ms
      </p>
      <table className="w-full border-collapse overflow-hidden rounded-lg border border-gray-200 text-sm">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-700">Scenario</th>
            <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-700">Passed</th>
            <th className="border-b border-gray-200 px-3 py-2 font-semibold text-gray-700">Latency (ms)</th>
          </tr>
        </thead>
        <tbody>
          {run.results.map((result) => (
            <tr key={result.id} className="odd:bg-white even:bg-gray-50">
              <td className="border-b border-gray-100 px-3 py-2 text-gray-800">{result.id}</td>
              <td className="border-b border-gray-100 px-3 py-2">{result.passed ? "✅" : "❌"}</td>
              <td className="border-b border-gray-100 px-3 py-2 text-gray-800">{result.latencyMs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
