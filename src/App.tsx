import { Routes, Route, Link, useLocation } from "react-router-dom";
import { Display } from "./routes/Display";
import { Control } from "./routes/Control";
import { Search } from "./routes/Search";
import { Logo } from "./components/Logo";

export function App() {
  const loc = useLocation();
  const isDisplay = loc.pathname.startsWith("/display");
  return (
    <div className={isDisplay ? "app app--display" : "app"}>
      {!isDisplay && (
        <header className="topbar">
          <Link to="/" className="brand">
            <Logo size={28} />
            <span>smutstream</span>
          </Link>
          <nav>
            <Link to="/">control</Link>
            <Link to="/search">new group</Link>
            <a href="/display" target="_blank" rel="noreferrer">display ↗</a>
          </nav>
        </header>
      )}
      <Routes>
        <Route path="/" element={<Control />} />
        <Route path="/search" element={<Search />} />
        <Route path="/display" element={<Display />} />
      </Routes>
    </div>
  );
}
