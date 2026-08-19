import { useModelContext } from "../context/ModelContext.js";

// qwen2.5-coder:32b has repeatedly hung/timed out on real chat requests in this
// environment (see project notes) — flag it in the picker so it isn't picked blind.
const OVERSIZED_MODEL_NAME = "qwen2.5-coder:32b";

function isOversized(name: string) {
  return name === OVERSIZED_MODEL_NAME;
}

export function ModelSelector() {
  const { models, selectedModel, setSelectedModel, error } = useModelContext();

  if (!selectedModel) {
    return error ? <p className="text-sm text-red-600">{error}</p> : null;
  }

  const selectedIsOversized = isOversized(selectedModel);

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="Select model"
        className={
          selectedIsOversized
            ? "rounded border border-red-400 bg-red-100 px-2 py-1 text-sm text-red-900"
            : "rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800"
        }
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
      >
        {models.map((model) => (
          <option
            key={model.name}
            value={model.name}
            style={isOversized(model.name) ? { backgroundColor: "#fecaca", color: "#7f1d1d" } : undefined}
          >
            {model.name}
            {model.parameterSize ? ` (${model.parameterSize})` : ""}
            {isOversized(model.name) ? " — too large, may hang" : ""}
          </option>
        ))}
      </select>
      {selectedIsOversized && (
        <p className="text-xs font-medium text-red-700">
          Warning: this model is large and may hang or time out on this machine.
        </p>
      )}
    </div>
  );
}
