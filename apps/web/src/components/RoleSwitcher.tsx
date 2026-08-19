import React from "react";
import { useRoleContext } from "../context/RoleContext.js";

export function RoleSwitcher() {
  const { users, currentUser, setCurrentUser } = useRoleContext();

  if (!currentUser) return null;

  return (
    <select
      role="combobox"
      value={currentUser.id}
      onChange={(e) => {
        const selected = users.find((u) => u.id === e.target.value);
        if (selected) setCurrentUser(selected);
      }}
    >
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name} ({user.role})
        </option>
      ))}
    </select>
  );
}
