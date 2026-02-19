import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About';
import './App.css';

export default function App() {
  return (
    <HashRouter>
      <header>
        <h1>GeneralStore <span className="tech-badge">React</span></h1>
        <nav>
          <NavLink to="/" className="nav-link" end>Home</NavLink>
          <NavLink to="/about" className="nav-link">About</NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>

      <footer>
        <p>&copy; 2026 GeneralStore — React Test Target</p>
      </footer>
    </HashRouter>
  );
}
