import { useState } from "react";
import { login, register, type User } from "../api";

type Props = {
  onLogin: (token: string, user: User) => void;
};

function Login({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(mode: "login" | "register") {
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await register(username, password);
      }
      // After registering we log in straight away, so both paths end the same way
      const result = await login(username, password);
      onLogin(result.token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault(); // stop the browser from reloading the page
        submit("login");
      }}
    >
      <h1>Chat App</h1>

      <input
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoFocus
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && <p className="error">{error}</p>}

      <div className="row">
        <button type="submit" disabled={loading}>
          Log in
        </button>
        <button type="button" disabled={loading} onClick={() => submit("register")}>
          Register
        </button>
      </div>
    </form>
  );
}

export default Login;