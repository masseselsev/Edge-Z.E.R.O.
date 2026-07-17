import React, { useState, useEffect } from 'react';
import { TranslationProvider } from './context/TranslationContext';
import Layout from './components/Layout';
import Login from './components/Login';
import DashboardTab from './components/DashboardTab';
import InventoryTab from './components/InventoryTab';
import LibraryTab from './components/LibraryTab';
import InitScriptsTab from './components/InitScriptsTab';
import LogsTab from './components/LogsTab';
import SettingsTab from './components/SettingsTab';
import { Loader2 } from 'lucide-react';

export function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Validate active session on boot
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch('/api/auth/me', {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const user = await res.json();
          setCurrentUser(user);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('Session validation error:', err);
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  const handleLoginSuccess = (data: any) => {
    if (data.access_token) {
      localStorage.setItem('token', data.access_token);
    }
    setCurrentUser({
      username: data.username,
      role: data.role
    });
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('token');
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('token');
      setCurrentUser(null);
      setIsAuthenticated(false);
    }
  };

  if (isAuthenticated === null) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[rgb(var(--body-bg))] text-zinc-400">
        <Loader2 className="animate-spin text-indigo-400 mb-3" size={32} />
        <span className="text-xs font-bold uppercase tracking-wider">Verifying Session...</span>
      </div>
    );
  }

  if (isAuthenticated === false) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab />;
      case 'inventory':
        return <InventoryTab />;
      case 'library':
        return <LibraryTab />;
      case 'scripts':
        return <InitScriptsTab />;
      case 'logs':
        return <LogsTab />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <DashboardTab />;
    }
  };

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      currentUser={currentUser}
      onLogout={handleLogout}
    >
      {renderContent()}
    </Layout>
  );
}

export default function App() {
  return (
    <TranslationProvider>
      <AppContent />
    </TranslationProvider>
  );
}
