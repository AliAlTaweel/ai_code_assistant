import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listUsers, type User } from "../api/client.js";

interface RoleContextValue {
  users: User[];
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
  error: string | null;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then((fetched) => {
        setUsers(fetched);
        if (fetched.length > 0) setCurrentUser(fetched[0]);
      })
      .catch((err) => {
        console.error("Failed to load users:", err);
        setError("Failed to load users. Is the agent API reachable?");
      });
  }, []);

  return (
    <RoleContext.Provider value={{ users, currentUser, setCurrentUser, error }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRoleContext(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRoleContext must be used within a RoleProvider");
  return ctx;
}

export function useCurrentUser(): User | null {
  return useRoleContext().currentUser;
}
