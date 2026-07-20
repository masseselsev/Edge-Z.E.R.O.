import React, { useState, useEffect } from 'react';
import { useTranslation } from '../context/TranslationContext';
import { Upload, Plus, Trash2, Library, Disc, Layers, FileCode } from 'lucide-react';
import InitScriptsTab from './InitScriptsTab';

interface OsImage {
  id: string;
  filename: string;
  os_type: string;
  is_active: boolean;
  status: string;
}

interface ComponentDefinition {
  id: string;
  name: string;
  model: string;
  description: string;
}

interface ComponentGroup {
  id: string;
  name: string;
  description: string;
}

interface LibraryTabProps {
  initialSubTab?: 'images' | 'scripts' | 'components' | 'templates';
}

export default function LibraryTab({ initialSubTab = 'images' }: LibraryTabProps) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<'images' | 'scripts' | 'components' | 'templates'>(initialSubTab);
  
  // Data State
  const [images, setImages] = useState<OsImage[]>([]);
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [osType, setOsType] = useState('DEBIAN');
  const [isActive, setIsActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [newComponent, setNewComponent] = useState({
    name: '',
    model: '',
    description: ''
  });

  const [newGroup, setNewGroup] = useState({
    name: '',
    description: ''
  });

  const fetchData = async () => {
    try {
      const [imgRes, compRes, grpRes] = await Promise.all([
        fetch('/api/library/images'),
        fetch('/api/library/components'),
        fetch('/api/library/groups')
      ]);
      if (imgRes.ok) setImages(await imgRes.json());
      if (compRes.ok) setComponents(await compRes.json());
      if (grpRes.ok) setGroups(await grpRes.json());
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Upload ISO
  const handleUploadIso = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('os_type', osType);
    formData.append('is_active', String(isActive));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/library/images');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      setUploading(false);
      setUploadProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadFile(null);
        fetchData();
      } else {
        alert('Failed to upload ISO image.');
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadProgress(null);
      alert('Upload failed due to a network error.');
    };

    xhr.send(formData);
  };

  // Add Component Definition
  const handleAddComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/library/components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newComponent)
      });
      if (res.ok) {
        setNewComponent({ name: '', model: '', description: '' });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add Template Group
  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/library/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newGroup, items: [] })
      });
      if (res.ok) {
        setNewGroup({ name: '', description: '' });
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteImage = async (id: string) => {
    if (!confirm('Delete this image?')) return;
    await fetch(`/api/library/images/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleDeleteComponent = async (id: string) => {
    if (!confirm('Delete this component definition?')) return;
    await fetch(`/api/library/components/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Delete this template group?')) return;
    await fetch(`/api/library/groups/${id}`, { method: 'DELETE' });
    fetchData();
  };



  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">{t('tabLibrary')}</h2>
        </div>
      </div>

      {/* Sub-tabs Row */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setSubTab('images')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'images' ? 'bg-zinc-900 border border-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-350'
          }`}
        >
          <Disc size={13} />
          <span>OS ISO Images</span>
        </button>
        <button
          onClick={() => setSubTab('scripts')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'scripts' ? 'bg-zinc-900 border border-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-350'
          }`}
        >
          <FileCode size={13} />
          <span>Init Scripts</span>
        </button>
        <button
          onClick={() => setSubTab('components')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'components' ? 'bg-zinc-900 border border-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-350'
          }`}
        >
          <Layers size={13} />
          <span>Components</span>
        </button>
        <button
          onClick={() => setSubTab('templates')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'templates' ? 'bg-zinc-900 border border-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-350'
          }`}
        >
          <Library size={13} />
          <span>Templates</span>
        </button>
      </div>

      {/* Init Scripts panel */}
      {subTab === 'scripts' && <InitScriptsTab embedded />}

      {/* OS Images panel */}
      {subTab === 'images' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Available Images</h3>
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
              <table className="min-w-full divide-y divide-zinc-800 text-left text-sm text-zinc-300">
                <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
                  <tr className="border-b border-zinc-800 text-zinc-400 font-bold">
                    <th className="px-6 py-3">Filename</th>
                    <th className="px-6 py-3">OS Type</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic animate-pulse">Loading ISO images...</td>
                    </tr>
                  ) : images.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic">No ISO images uploaded.</td>
                    </tr>
                  ) : (
                    images.map(img => (
                      <tr key={img.id} className="hover:bg-zinc-800/30 text-zinc-300 transition-colors">
                        <td className="px-6 py-4 font-bold text-zinc-200">{img.filename}</td>
                        <td className="px-6 py-4">{img.os_type}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            img.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                          }`}>{img.status}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDeleteImage(img.id)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded cursor-pointer"
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
          </div>

          {/* Upload Form */}
          <div className="bg-zinc-905 border border-zinc-800 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Upload new ISO</h3>
            <form onSubmit={handleUploadIso} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Select ISO File</label>
                <input
                  key={uploadFile ? 'loaded' : 'empty'}
                  type="file"
                  required
                  accept=".iso,.ISO"
                  onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-xs bg-zinc-950 border border-zinc-800 p-2.5 rounded-lg text-zinc-400 file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-[11px] file:font-bold file:bg-zinc-900 file:text-zinc-300 file:hover:bg-zinc-800 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">OS Type</label>
                <select
                  value={osType}
                  onChange={(e) => setOsType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none cursor-pointer"
                >
                  <option value="DEBIAN">Debian</option>
                  <option value="UBUNTU">Ubuntu</option>
                </select>
              </div>

              {uploading && uploadProgress !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-zinc-400 font-bold uppercase">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden border border-zinc-800">
                    <div 
                      className="bg-indigo-500 h-1.5 transition-all duration-150" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                <Upload size={14} />
                <span>{uploading ? 'Uploading...' : 'Upload Image'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Components panel */}
      {subTab === 'components' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Component Definitions</h3>
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
              <table className="min-w-full divide-y divide-zinc-800 text-left text-sm text-zinc-300">
                <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
                  <tr className="border-b border-zinc-800 text-zinc-400 font-bold">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Model</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic animate-pulse">Loading component definitions...</td>
                    </tr>
                  ) : components.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 italic">No component definitions found.</td>
                    </tr>
                  ) : (
                    components.map(comp => (
                      <tr key={comp.id} className="hover:bg-zinc-800/30 text-zinc-300 transition-colors">
                        <td className="px-6 py-4 font-bold text-zinc-200">{comp.name}</td>
                        <td className="px-6 py-4">{comp.model}</td>
                        <td className="px-6 py-4 text-zinc-400">{comp.description || '—'}</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDeleteComponent(comp.id)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded cursor-pointer"
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
          </div>

          {/* Add Component Form */}
          <div className="bg-zinc-905 border border-zinc-800 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Add component type</h3>
            <form onSubmit={handleAddComponent} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newComponent.name}
                  onChange={(e) => setNewComponent({...newComponent, name: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                  placeholder="e.g. HDD 2TB"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Model</label>
                <input
                  type="text"
                  required
                  value={newComponent.model}
                  onChange={(e) => setNewComponent({...newComponent, model: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                  placeholder="e.g. Seagate ST2000LM015"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Description</label>
                <textarea
                  value={newComponent.description}
                  onChange={(e) => setNewComponent({...newComponent, description: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                  placeholder="Optional details"
                />
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                <Plus size={14} />
                <span>Create Component</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Templates panel */}
      {subTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Template Groups</h3>
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50 backdrop-blur-md">
              <table className="min-w-full divide-y divide-zinc-800 text-left text-sm text-zinc-300">
                <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
                  <tr className="border-b border-zinc-800 text-zinc-400 font-bold">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-zinc-500 italic animate-pulse">Loading template groups...</td>
                    </tr>
                  ) : groups.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-zinc-500 italic">No template groups found.</td>
                    </tr>
                  ) : (
                    groups.map(grp => (
                      <tr key={grp.id} className="hover:bg-zinc-800/30 text-zinc-300 transition-colors">
                        <td className="px-6 py-4 font-bold text-zinc-200">{grp.name}</td>
                        <td className="px-6 py-4 text-zinc-400">{grp.description || '—'}</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDeleteGroup(grp.id)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded cursor-pointer"
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
          </div>

          {/* Add Group Form */}
          <div className="bg-zinc-905 border border-zinc-800 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Create Template Group</h3>
            <form onSubmit={handleAddGroup} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({...newGroup, name: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                  placeholder="e.g. Standard Video-Box"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Description</label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({...newGroup, description: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 p-2.5 rounded-lg outline-none"
                  placeholder="Optional details"
                />
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                <Plus size={14} />
                <span>Create Group</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
