import React, { useState } from 'react';
import { TranslationProvider } from './context/TranslationContext';
import Layout from './components/Layout';
import DashboardTab from './components/DashboardTab';
import InventoryTab from './components/InventoryTab';
import LibraryTab from './components/LibraryTab';
import InitScriptsTab from './components/InitScriptsTab';
import LogsTab from './components/LogsTab';
import SettingsTab from './components/SettingsTab';

export default function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');

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
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}

export function App() {
  return (
    <TranslationProvider>
      <AppContent />
    </TranslationProvider>
  );
}
