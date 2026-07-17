import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { Search, Plus, Trash2, Edit } from 'lucide-react';

interface Location {
  id: string;
  name: string;
}

interface Box {
  id: string;
  internal_sn: string;
  mac_address: string;
  ip_address: string | null;
  status: 'NEW' | 'STAGING' | 'INSTALLING' | 'ACTIVE' | 'MAINTENANCE';
  location: Location | null;
}

export default function InventoryTab() {
  const { t } = useTranslation();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBox, setNewBox] = useState({
    internal_sn: '',
    mac_address: '',
    ip_address: '',
    location_id: ''
  });

  const fetchData = async () => {
    try {
      const [boxRes, locRes] = await Promise.all([
        fetch('/api/boxes/'),
        fetch('/api/locations/')
      ]);
      if (boxRes.ok) setBoxes(await boxRes.json());
      if (locRes.ok) setLocations(await locRes.json());
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddBox = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/boxes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBox)
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewBox({ internal_sn: '', mac_address: '', ip_address: '', location_id: '' });
        fetchData();
      } else {
        const errorData = await res.json();
        alert(`Failed to add box: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to add box:', err);
    }
  };

  const handleDeleteBox = async (id: string) => {
    if (!confirm('Are you sure you want to delete this box?')) return;
    try {
      const res = await fetch(`/api/boxes/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Failed to delete box:', err);
    }
  };

  const getStatusBadge = (status: Box['status']) => {
    const badges = {
      NEW: 'bg-zinc-800 text-zinc-400 border-zinc-700/50',
      STAGING: 'bg-indigo-950/20 text-indigo-400 border-indigo-900/30',
      INSTALLING: 'bg-amber-950/20 text-amber-400 border-amber-900/30',
      ACTIVE: 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30',
      MAINTENANCE: 'bg-rose-950/20 text-rose-450 border-rose-900/30'
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badges[status] || badges.NEW}`}>
        {status}
      </span>
    );
  };

  const filteredBoxes = boxes.filter(box => 
    box.internal_sn.toLowerCase().includes(search.toLowerCase()) ||
    box.mac_address.toLowerCase().includes(search.toLowerCase()) ||
    (box.ip_address && box.ip_address.includes(search))
  );

  if (loading) {
    return <div className="text-zinc-500 text-sm animate-pulse">{t('loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('inventoryTitle')}</h1>
          <p className="text-zinc-400 text-xs mt-1">{t('inventorySub')}</p>
        </div>
        
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3.5 py-1.8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-[0_0_12px_rgba(99,102,241,0.2)] hover:shadow-[0_0_16px_rgba(99,102,241,0.4)]"
        >
          <Plus size={14} />
          <span>{t('addBox')}</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 w-full max-w-md shadow-sm">
        <Search size={14} className="text-zinc-500 mr-2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="bg-transparent border-none outline-none text-xs text-zinc-200 placeholder-zinc-500 w-full"
        />
      </div>

      {/* Data Table */}
      <div className="overflow-hidden border border-zinc-800/80 bg-zinc-950/40 rounded-xl shadow-sm">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-bold">
              <th className="p-4">Internal SN</th>
              <th className="p-4">{t('macAddress')}</th>
              <th className="p-4">{t('ipAddress')}</th>
              <th className="p-4">{t('location')}</th>
              <th className="p-4">{t('status')}</th>
              <th className="p-4 text-right">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filteredBoxes.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-500 italic">No devices found.</td>
              </tr>
            ) : (
              filteredBoxes.map((box) => (
                <tr key={box.id} className="hover:bg-zinc-900/20 text-zinc-300">
                  <td className="p-4 font-bold text-zinc-200">{box.internal_sn}</td>
                  <td className="p-4 font-mono">{box.mac_address}</td>
                  <td className="p-4 font-mono">{box.ip_address || '—'}</td>
                  <td className="p-4">{box.location ? box.location.name : '—'}</td>
                  <td className="p-4">{getStatusBadge(box.status)}</td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleDeleteBox(box.id)}
                      className="p-1.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 text-rose-450 hover:text-rose-400 rounded transition-all cursor-pointer"
                      title={t('delete')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Box Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-modal-in">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-200">{t('addBox')}</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-zinc-500 hover:text-zinc-300 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddBox} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Internal SN</label>
                <input
                  type="text"
                  required
                  value={newBox.internal_sn}
                  onChange={(e) => setNewBox({...newBox, internal_sn: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="e.g. BOX-001"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">{t('macAddress')}</label>
                <input
                  type="text"
                  required
                  value={newBox.mac_address}
                  onChange={(e) => setNewBox({...newBox, mac_address: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="e.g. 00:11:22:33:44:55"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">{t('ipAddress')}</label>
                <input
                  type="text"
                  value={newBox.ip_address}
                  onChange={(e) => setNewBox({...newBox, ip_address: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none"
                  placeholder="e.g. 192.168.1.100"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">{t('location')}</label>
                <select
                  value={newBox.location_id}
                  onChange={(e) => setNewBox({...newBox, location_id: e.target.value})}
                  className="w-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg focus:border-indigo-500 outline-none cursor-pointer"
                >
                  <option value="">None</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-850">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-md"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
