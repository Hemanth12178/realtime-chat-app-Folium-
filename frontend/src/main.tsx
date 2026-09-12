import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// No <StrictMode>: in dev it mounts components twice, which would open and
// immediately close an extra WebSocket (causing fake "joined/left" events).
createRoot(document.getElementById("root")!).render(<App />);