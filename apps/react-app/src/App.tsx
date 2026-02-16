import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About';
import './App.css';

export default function App() {
  return (
    <HashRouter>
      <header data-testid="app-header">
        <h1>GeneralStore <span className="tech-badge">React</span></h1>
        <nav>
          <NavLink to="/" data-testid="nav-home" className="nav-link" end>Home</NavLink>
          <NavLink to="/about" data-testid="nav-about" className="nav-link">About</NavLink>
        </nav>
      </header>

      <main data-testid="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>

      <footer data-testid="app-footer">
        <p>&copy; 2026 GeneralStore — React Test Target</p>
      </footer>
    </HashRouter>
  );
}
