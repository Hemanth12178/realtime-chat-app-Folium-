import type { OnlineUser } from "../ws";

type Props = {
  users: OnlineUser[];
  currentUserId: number;
};

function OnlineUsers({ users, currentUserId }: Props) {
  return (
    <aside className="online">
      <h2>Online ({users.length})</h2>
      <ul>
        {users.map((user) => (
          <li key={user.id}>
            {user.username}
            {user.id === currentUserId && " (you)"}
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default OnlineUsers;