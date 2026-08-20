import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.js";

interface Consultant {
  id: string;
  full_name: string;
  title: string;
}

interface Skill {
  id: string;
  skill_name: string;
  proficiency_level: number;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

export function AdminPanel() {
  const { logout } = useAuth();
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [selectedConsultantId, setSelectedConsultantId] = useState<string>("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillName, setSkillName] = useState("");
  const [proficiencyLevel, setProficiencyLevel] = useState<number>(3);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch consultants on mount
  useEffect(() => {
    const fetchConsultants = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/admin/consultants`);
        if (!response.ok) throw new Error("Failed to fetch consultants");
        const data = await response.json();
        setConsultants(data);
      } catch (err) {
        setError(`Failed to load consultants: ${(err as Error).message}`);
      }
    };
    fetchConsultants();
  }, []);

  // Fetch skills when consultant is selected
  useEffect(() => {
    if (!selectedConsultantId) {
      setSkills([]);
      return;
    }
    const fetchSkills = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/admin/consultants/${selectedConsultantId}/skills`);
        if (!response.ok) throw new Error("Failed to fetch skills");
        const data = await response.json();
        setSkills(data);
      } catch (err) {
        setError(`Failed to load skills: ${(err as Error).message}`);
      }
    };
    fetchSkills();
  }, [selectedConsultantId]);

  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConsultantId || !skillName.trim()) {
      setError("Please select a consultant and enter a skill name");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_BASE}/api/admin/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultant_id: selectedConsultantId,
          skill_name: skillName.trim(),
          proficiency_level: proficiencyLevel,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Failed to add skill");
      }

      const newSkill = await response.json();
      setSkills([...skills, newSkill]);
      setSkillName("");
      setProficiencyLevel(3);
      setSuccess("Skill added successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(`Error adding skill: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
          <button
            onClick={logout}
            className="rounded bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Logout
          </button>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-6 text-xl font-semibold text-gray-900">Add Skills to Consultant</h2>

          {error && <p className="mb-4 rounded bg-red-100 p-3 text-red-700">{error}</p>}
          {success && <p className="mb-4 rounded bg-green-100 p-3 text-green-700">{success}</p>}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700">
              Select Consultant
            </label>
            <select
              value={selectedConsultantId}
              onChange={(e) => setSelectedConsultantId(e.target.value)}
              className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              <option value="">-- Choose a consultant --</option>
              {consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.title})
                </option>
              ))}
            </select>
          </div>

          {selectedConsultantId && (
            <>
              <div className="mb-6">
                <h3 className="mb-3 text-lg font-medium text-gray-900">Current Skills</h3>
                {skills.length === 0 ? (
                  <p className="text-sm text-gray-600">No skills added yet</p>
                ) : (
                  <div className="space-y-2">
                    {skills.map((skill) => (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between rounded bg-gray-50 p-3"
                      >
                        <span className="font-medium text-gray-900">{skill.skill_name}</span>
                        <span className="text-sm text-gray-600">
                          Proficiency: {skill.proficiency_level}/5
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleAddSkill} className="space-y-4 border-t pt-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Skill Name
                  </label>
                  <input
                    type="text"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., Python, React, AWS"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Proficiency Level
                  </label>
                  <select
                    value={proficiencyLevel}
                    onChange={(e) => setProficiencyLevel(Number(e.target.value))}
                    className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none"
                  >
                    <option value={1}>1 - Beginner</option>
                    <option value={2}>2 - Basic</option>
                    <option value={3}>3 - Intermediate</option>
                    <option value={4}>4 - Advanced</option>
                    <option value={5}>5 - Expert</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Adding..." : "Add Skill"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
