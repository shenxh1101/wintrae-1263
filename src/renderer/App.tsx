import { useAppStore } from './store/useAppStore';
import OverviewPanel from './components/OverviewPanel';
import ExhibitPanel from './components/ExhibitPanel';
import RoutePanel from './components/RoutePanel';
import PreviewPanel from './components/PreviewPanel';
import './styles/app.css';

function App() {
  const currentWindow = useAppStore((state) => state.currentWindow);
  const currentExhibition = useAppStore((state) => state.getCurrentExhibition());
  const setCurrentWindow = useAppStore((state) => state.setCurrentWindow);

  const navItems = [
    { id: 'overview', label: '展览总览', icon: '🏛️' },
    { id: 'exhibit', label: '展品编辑', icon: '🖼️', disabled: !currentExhibition },
    { id: 'route', label: '路线编排', icon: '🗺️', disabled: !currentExhibition },
    { id: 'preview', label: '试听发布', icon: '🎧', disabled: !currentExhibition },
  ];

  const renderPanel = () => {
    switch (currentWindow) {
      case 'overview':
        return <OverviewPanel />;
      case 'exhibit':
        return <ExhibitPanel />;
      case 'route':
        return <RoutePanel />;
      case 'preview':
        return <PreviewPanel />;
      default:
        return <OverviewPanel />;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-logo">
          <span className="logo-icon">🎙️</span>
          <h1>博物馆语音导览制作工具</h1>
        </div>
        {currentExhibition && (
          <div className="current-exhibition">
            <span className="label">当前展览：</span>
            <span className="name">{currentExhibition.name}</span>
          </div>
        )}
      </header>

      <nav className="app-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentWindow === item.id ? 'active' : ''} ${
              item.disabled ? 'disabled' : ''
            }`}
            onClick={() => !item.disabled && setCurrentWindow(item.id as any)}
            disabled={item.disabled}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <main className="app-main">{renderPanel()}</main>
    </div>
  );
}

export default App;
