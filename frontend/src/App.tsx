import { useEffect, useState } from "react";
import { clearToken, getMe, getToken, saveToken, type User } from "./api";
import Login from "./components/Login";
import ChatRoom from "./components/ChatRoom";

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  // On page load: if a token was saved earlier, ask the server who it belongs to
  useEffect(() => {
    const savedToken = getToken();
    if (!savedToken) {
      setChecking(false);
      return;
    }
    getMe(savedToken)
      .then((me) => {
        setToken(savedToken);
        setUser(me);
      })
      .catch(() => clearToken()) // invalid or old token: forget it
      .finally(() => setChecking(false));
  }, []);

  function handleLogin(newToken: string, loggedInUser: User) {
    saveToken(newToken);
    setToken(newToken);
    setUser(loggedInUser);
  }

  function handleLogout() {
    clearToken();
    setToken(null);
    setUser(null);
  }

  if (checking) {
    return <p className="center">Loading...</p>;
  }

  if (!token || !user) {
    return <Login onLogin={handleLogin} />;
  }

  return <ChatRoom token={token} user={user} onLogout={handleLogout} />;
}

export default App;
