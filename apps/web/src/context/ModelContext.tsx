import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listModels, type ModelInfo } from "../api/client.js";

interface ModelContextValue {
  models: ModelInfo[];
  selectedModel: string | null;
  setSelectedModel: (model: string) => void;
  error: string | null;
}

const ModelContext = createContext<ModelContextValue | null>(null);

export function ModelProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listModels()
      .then((fetched) => {
        setModels(fetched);
        if (fetched.length > 0) setSelectedModel(fetched[0].name);
      })
      .catch((err) => {
        console.error("Failed to load models:", err);
        setError("Failed to load models. Is Ollama reachable?");
      });
  }, []);

  return (
    <ModelContext.Provider value={{ models, selectedModel, setSelectedModel, error }}>
      {children}
    </ModelContext.Provider>
  );
}

export function useModelContext(): ModelContextValue {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error("useModelContext must be used within a ModelProvider");
  return ctx;
}
