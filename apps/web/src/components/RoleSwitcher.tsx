import { useRoleContext } from "../context/RoleContext.js";

export function RoleSwitcher() {
  const { users, currentUser, setCurrentUser, error } = useRoleContext();

  if (!currentUser) {
    return error ? <p className="text-sm text-red-600">{error}</p> : null;
  }

  return (
    <select
      aria-label="Select user"
      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800"
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
