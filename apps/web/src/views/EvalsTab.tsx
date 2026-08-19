import { useEffect, useState } from "react";
import { getLatestEvals, type EvalRun } from "../api/client.js";

export function EvalsTab() {
  const [run, setRun] = useState<EvalRun | null | undefined>(undefined);

  useEffect(() => {
    getLatestEvals().then(setRun);
  }, []);

  if (run === undefined) return null;
  if (run === null) return <p>No eval runs yet.</p>;

  return (
    <div>
      <p>
        Pass rate: {(run.summary.passRate * 100).toFixed(0)}% · Avg latency:{" "}
        {run.summary.avgLatencyMs.toFixed(0)}ms
      </p>
      <table>
        <thead>
          <tr>
            <th>Scenario</th>
            <th>Passed</th>
            <th>Latency (ms)</th>
          </tr>
        </thead>
        <tbody>
          {run.results.map((result) => (
            <tr key={result.id}>
              <td>{result.id}</td>
              <td>{result.passed ? "✅" : "❌"}</td>
              <td>{result.latencyMs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
