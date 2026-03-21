
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import HomeView from './views/HomeView';
import LiveView from './views/LiveView';
import AIView from './views/AIView';
import RobotView from './views/RobotView';
import AllActivitiesView from './views/AllActivitiesView';
import LoginView from './views/LoginView';
import RegisterView from './views/RegisterView';
import SettingsView from './views/SettingsView';
import { Insight } from './types';
import { 
  Home, 
  Camera, 
  Sparkles, 
  Bot, 
  Settings,
  Sun,
  Moon,
  User as UserIcon
} from 'lucide-react';

const Navigation = ({ isLoggedIn }: { isLoggedIn: boolean }) => {
  const location = useLocation();
  const navItems = [
    { path: '/', label: '首页', icon: Home },
    { path: '/live', label: '实时', icon: Camera },
    { path: '/ai', label: '分析', icon: Sparkles },
    { path: '/robot', label: '机器人', icon: Bot },
    { path: '/settings', label: '设置', icon: Settings },
  ];

  // Hide navigation on auth views
  if (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/all-activities') return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 flex justify-around items-center h-20 safe-bottom z-50 transition-colors">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center justify-center w-full h-full transition-all ${
              isActive ? 'text-blue-600 dark:text-blue-400 scale-110' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-bold">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  user: any;
}

const Header: React.FC<HeaderProps> = ({ isDark, onToggleTheme, user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Hide header on auth views
  if (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/all-activities') return null;

  return (
    <header className="sticky top-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-40 border-b border-slate-100 dark:border-slate-900 px-4 pt-8 pb-3 flex justify-between items-center transition-colors">
      <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">视净</h1>
      <div className="flex gap-2">
        <button 
          onClick={onToggleTheme}
          className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all active:rotate-12"
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button 
          onClick={() => navigate('/settings')}
          className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors overflow-hidden"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="Avatar" className="w-5 h-5 rounded-full object-cover" />
          ) : (
            <UserIcon size={20} />
          )}
        </button>
      </div>
    </header>
  );
};

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [insights, setInsights] = useState<Insight[]>(() => {
    const saved = localStorage.getItem('insights');
    if (saved) return JSON.parse(saved);
    return [
      { id: '1', time: '10:30', event: '检测到桌面咖啡渍', action: '已生成清理任务', type: 'warn' },
      { id: '2', time: '09:15', event: '桌面整洁度评分：A', action: '环境良好', type: 'info' },
      { id: '3', time: '昨天', event: '机器人完成常规清理', action: '耗时5分钟', type: 'success' }
    ];
  });

  useEffect(() => {
    localStorage.setItem('insights', JSON.stringify(insights));
  }, [insights]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const handleLogin = (userData: any) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  const toggleTheme = () => setIsDark(!isDark);

  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        <Header isDark={isDark} onToggleTheme={toggleTheme} user={user} />
        <main className="flex-1 overflow-x-hidden pb-24">
          <Routes>
            <Route path="/login" element={<LoginView onLogin={handleLogin} />} />
            <Route path="/register" element={<RegisterView />} />
            
            {/* Protected Routes */}
            <Route path="/" element={user ? <HomeView insights={insights} /> : <Navigate to="/login" />} />
            <Route path="/live" element={user ? <LiveView /> : <Navigate to="/login" />} />
            <Route path="/ai" element={user ? <AIView setInsights={setInsights} /> : <Navigate to="/login" />} />
            <Route path="/robot" element={user ? <RobotView /> : <Navigate to="/login" />} />
            <Route path="/settings" element={user ? <SettingsView user={user} onLogout={handleLogout} /> : <Navigate to="/login" />} />
            <Route path="/all-activities" element={user ? <AllActivitiesView insights={insights} /> : <Navigate to="/login" />} />
          </Routes>
        </main>
        <Navigation isLoggedIn={!!user} />
      </div>
    </Router>
  );
};

export default App;