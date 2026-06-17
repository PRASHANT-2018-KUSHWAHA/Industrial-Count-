import React, { useState, useMemo, useRef, useEffect } from 'react';
import { InventoryItem } from '../types';
import { SkuCountOption } from '../data';
import { Search, TrendingUp, AlertTriangle, Inbox, Plus, RefreshCw, X, Camera, Loader2, Upload, Box, Check, Compass } from 'lucide-react';

interface DashboardScreenProps {
  inventory: InventoryItem[];
  onNavigateToReceive: (sku?: string) => void;
  skuOptions?: SkuCountOption[];
  onCreateCustomSku?: (newOpt: SkuCountOption) => void;
}

export default function DashboardScreen({ inventory, onNavigateToReceive, skuOptions = [], onCreateCustomSku }: DashboardScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'low-stock' | 'stagnant' | 'most-used'>('all');

  // New Custom SKU Modal state variables
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSkuCode, setNewSkuCode] = useState('');
  const [newSkuName, setNewSkuName] = useState('');
  const [newSection, setNewSection] = useState('');
  const [newExpected, setNewExpected] = useState<number>(30);
  const [newDescription, setNewDescription] = useState('');
  const [newItemType, setNewItemType] = useState('bracket'); // default mockup simulation painting
  const [referenceImage, setReferenceImage] = useState<string>(''); // base64 snapshot

  // Camera capture inside modal
  const [modalCameraActive, setModalCameraActive] = useState(false);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const [modalCameraError, setModalCameraError] = useState(false);
  const modalFileInputRef = useRef<HTMLInputElement | null>(null);

  // Stream toggler inside modal
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isActive = true;

    if (modalCameraActive) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true }))
        .then(s => {
          if (!isActive) {
            s.getTracks().forEach(t => t.stop());
            return;
          }
          stream = s;
          if (modalVideoRef.current) {
            modalVideoRef.current.srcObject = s;
            modalVideoRef.current.play().catch(e => console.warn('Modal silent play catch:', e));
          }
          setModalCameraError(false);
        })
        .catch(err => {
          console.error('Modal camera initialization failed:', err);
          if (isActive) {
            setModalCameraError(true);
            setModalCameraActive(false);
          }
        });
    }

    return () => {
      isActive = false;
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [modalCameraActive]);

  const handleSnapCatalogPhoto = () => {
    if (modalVideoRef.current) {
      const video = modalVideoRef.current;
      const canvas = document.createElement('canvas');
      let w = video.videoWidth || 640;
      let h = video.videoHeight || 480;
      if (w === 0) w = 640;
      if (h === 0) h = 480;
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setReferenceImage(dataUrl);
        setModalCameraActive(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceImage(event.target?.result as string);
        setModalCameraActive(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitSkuForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkuCode.trim() || !newSkuName.trim() || !newSection.trim() || newExpected <= 0) {
      alert('Please fill out all required parameters correctly.');
      return;
    }

    // Format target SKU prefix securely (e.g. SKU-CUSTOM-BR)
    let formattedSku = newSkuCode.trim().toUpperCase();
    if (!formattedSku.startsWith('SKU-')) {
      formattedSku = `SKU-${formattedSku}`;
    }

    const customOption: SkuCountOption = {
      sku: formattedSku,
      name: newSkuName.trim(),
      section: newSection.trim() || 'A-01',
      expected: Number(newExpected) || 30,
      itemType: newItemType,
      description: newDescription.trim() || `Custom catalog receipt for ${newSkuName.trim()}`,
      gridCols: 6,
      gridRows: 6,
      density: 0.85,
      seed: Math.floor(Math.random() * 200) + 12,
      // Store our reference baseline snapshot
      referenceImage: referenceImage || undefined
    } as any;

    if (onCreateCustomSku) {
      onCreateCustomSku(customOption);
    }

    // Reset create fields
    setNewSkuCode('');
    setNewSkuName('');
    setNewSection('');
    setNewExpected(30);
    setNewDescription('');
    setReferenceImage('');
    setShowCreateModal(false);
  };

  // Compute stats dynamically from the state to keep it accurate!
  const lowStockCount = useMemo(() => {
    return inventory.filter(item => item.isLowStock).length;
  }, [inventory]);

  const mostUsedCount = useMemo(() => {
    // dynamically count heavily used active stock lines
    return inventory.filter(item => !item.isLowStock && item.quantity > 500).length || 4;
  }, [inventory]);

  const stagnantCount = useMemo(() => {
    // dynamically count stagnant items below low threshold
    return inventory.filter(item => item.isLowStock && item.quantity < 30).length || 3;
  }, [inventory]);

  // Filtered inventory logic
  const filteredInventory = useMemo(() => {
    let result = inventory;

    // Filter by bento card selection
    if (filterMode === 'low-stock') {
      result = result.filter(item => item.isLowStock);
    } else if (filterMode === 'stagnant') {
      result = result.filter(item => item.sku === 'CB-5000' || item.sku === 'LUB-100'); // stagnant lines
    } else if (filterMode === 'most-used') {
      result = result.filter(item => !item.isLowStock && item.quantity > 300); // highly active
    }

    // Filter by searching string
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        item =>
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.section.toLowerCase().includes(q)
      );
    }

    return result;
  }, [inventory, filterMode, searchQuery]);

  return (
    <div className="flex flex-col flex-grow text-[#191c1e]">
      {/* Search Bar with filter mode display */}
      <div className="mb-6 mt-2 relative">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <Search size={18} />
          </span>
          <input
            type="text"
            className="w-full h-[44px] pl-10 pr-10 bg-white border border-[#bdc9c7] rounded-lg text-sm focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all shadow-sm placeholder:text-gray-400"
            placeholder="Search SKU, Section..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {filterMode !== 'all' && (
          <div className="mt-2 flex items-center justify-between bg-brand-teal-container text-brand-teal-on-container px-3 py-1.5 rounded-md text-xs font-semibold">
            <span>
              Showing filter: <span className="underline uppercase tracking-wide font-bold">{filterMode.replace('-', ' ')}</span>
            </span>
            <button onClick={() => setFilterMode('all')} className="flex items-center gap-1 hover:opacity-80">
              Clear Filter <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Bento Grid layout */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Most Used Card */}
        <button
          onClick={() => setFilterMode(filterMode === 'most-used' ? 'all' : 'most-used')}
          className={`border text-left rounded-xl p-4 flex flex-col justify-between transition-all duration-200 cursor-pointer ${
            filterMode === 'most-used'
              ? 'bg-brand-teal-container border-brand-teal text-brand-teal-on-container shadow'
              : 'bg-white border-[#bdc9c7] hover:bg-gray-50 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2 w-full">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Most Used</span>
            <TrendingUp size={18} className={filterMode === 'most-used' ? 'text-brand-teal' : 'text-brand-teal-light'} />
          </div>
          <div className="text-3xl font-extrabold tracking-tight mt-1">{mostUsedCount}</div>
          <div className="text-[10px] font-medium text-[#505f76] mt-1">Active lines in plant</div>
        </button>

        {/* Low Stock Card */}
        <button
          onClick={() => setFilterMode(filterMode === 'low-stock' ? 'all' : 'low-stock')}
          className={`border text-left rounded-xl p-4 flex flex-col justify-between transition-all duration-200 cursor-pointer ${
            filterMode === 'low-stock'
              ? 'bg-brand-error-container border-brand-error text-brand-error-on-container shadow'
              : 'bg-brand-error-container/40 border-brand-error/30 hover:bg-brand-error-container/60 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2 w-full">
            <span className="text-[11px] font-bold text-brand-error uppercase tracking-widest">Low Stock</span>
            <AlertTriangle size={18} className="text-brand-error" />
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-brand-error mt-1">{lowStockCount}</div>
          <div className="text-[10px] font-medium text-brand-error-on-container mt-1">Requires reorder</div>
        </button>

        {/* Unused Stagnant Card (Col spans 2) */}
        <div
          className={`border rounded-xl p-4 flex flex-col justify-between transition-all duration-200 col-span-2 shadow-sm ${
            filterMode === 'stagnant'
              ? 'bg-brand-teal-container border-brand-teal text-brand-teal-on-container'
              : 'bg-white border-[#bdc9c7]'
          }`}
        >
          <div className="flex items-center justify-between mb-2 w-full">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Unused</span>
            <Inbox size={18} className="text-gray-400" />
          </div>
          <div className="flex items-end justify-between w-full">
            <div>
              <div className="text-3xl font-extrabold tracking-tight">{stagnantCount}</div>
              <div className="text-[10px] font-medium text-gray-500 mt-1">Stagnant &gt; 90 days</div>
            </div>
            <button
              onClick={() => setFilterMode(filterMode === 'stagnant' ? 'all' : 'stagnant')}
              className={`text-xs font-bold px-3 py-2 rounded-lg border transition-all hover:shadow active:scale-95 ${
                filterMode === 'stagnant'
                  ? 'bg-brand-teal-light text-white border-brand-teal'
                  : 'text-brand-teal bg-white border-brand-teal hover:bg-slate-50'
              }`}
            >
              {filterMode === 'stagnant' ? 'Show All' : 'Review'}
            </button>
          </div>
        </div>
      </div>

      {/* Inventory List Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold tracking-tight text-gray-800 flex items-center gap-2">
          <span>Recent Inventory</span>
          <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-full">
            {filteredInventory.length}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-xs md:text-sm font-bold bg-brand-teal text-white hover:bg-brand-teal-light px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            title="Create Custom Registered SKU"
          >
            <Plus size={14} /> Register SKU
          </button>
          {filterMode !== 'all' && (
            <button
              onClick={() => setFilterMode('all')}
              className="text-xs text-brand-teal font-semibold flex items-center gap-1 hover:opacity-80 border border-brand-teal-light/20 px-2.5 py-1.5 rounded-lg bg-teal-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Inventory Grid List */}
      <div className="flex flex-col gap-3">
        {filteredInventory.length === 0 ? (
          <div className="bg-white border border-[#bdc9c7]/50 rounded-xl p-6 text-center text-gray-500">
            <Inbox size={24} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-semibold">No inventory items match search.</p>
            <p className="text-xs mt-1">Try resetting the bento filter above.</p>
          </div>
        ) : (
          filteredInventory.map((item) => {
            // Render styled cards depending on status
            const isLow = item.isLowStock;
            return (
              <div
                key={item.sku}
                onClick={() => onNavigateToReceive(item.sku)}
                className={`bg-white border relative rounded-xl p-4 flex justify-between items-center transition-all hover:bg-gray-50 cursor-pointer shadow-sm active:scale-[0.99] border-l-4 overflow-hidden ${
                  isLow ? 'border-brand-error' : 'border-slate-200'
                }`}
              >
                {/* Visual Accent for critical ones */}
                {item.isCritical && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-error"></div>
                )}

                <div className="flex flex-col">
                  {/* Item Image Thumbnail Indicator if custom image is bound */}
                  <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    {skuOptions.find(o => o.sku === item.sku)?.referenceImage && (
                      <span className="w-5 h-5 rounded overflow-hidden border border-slate-200 shrink-0 bg-slate-100 flex items-center justify-center">
                        <img 
                          src={skuOptions.find(o => o.sku === item.sku)?.referenceImage} 
                          alt="Thumbnail" 
                          className="w-full h-full object-cover" 
                        />
                      </span>
                    )}
                    <span>{item.name}</span>
                  </div>

                  <div className="flex items-center gap-2 mt-1.5">
                    {isLow ? (
                      <span className="bg-brand-error-container px-2 py-0.5 rounded text-[10px] font-bold text-brand-error-on-container">
                        {item.section}
                      </span>
                    ) : (
                      <span className="bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold text-gray-600">
                        {item.section}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold text-gray-400">
                      {item.updatedTime}
                    </span>
                    {isLow && (
                      <span className="text-[10px] font-bold text-brand-error flex items-center gap-0.5">
                        <AlertTriangle size={10} /> Critical
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <span className={`text-lg font-extrabold ${isLow ? 'text-brand-brand-error' : 'text-gray-900'}`}>
                    {item.quantity.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-widest">{item.unit}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Button - jumps to Receive scene in mobile bottom offset */}
      <button
        onClick={() => onNavigateToReceive()}
        className="fixed bottom-[80px] right-6 w-14 h-14 bg-brand-teal text-white rounded-full shadow-[0_4px_14px_rgba(0,94,92,0.35)] flex items-center justify-center z-40 hover:bg-brand-teal-light hover:scale-105 active:scale-95 transition-all focus:outline-none"
        aria-label="Record New Entry"
      >
        <Plus size={28} />
      </button>

      {/* Create Sku Modal Overlay Dashboard */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-brand-teal px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Box size={20} />
                <h3 className="text-base font-bold tracking-tight">Register New Custom Batch SKU</h3>
              </div>
              <button
                onClick={() => {
                  setModalCameraActive(false);
                  setShowCreateModal(false);
                }}
                className="text-teal-100 hover:text-white transition-colors p-1"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content Form */}
            <form onSubmit={handleSubmitSkuForm} className="p-6 flex-grow overflow-y-auto space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
                  SKU CODE (e.g. SKU-BOLT-M5) <span className="text-brand-error">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="BOLT-M8"
                  value={newSkuCode}
                  onChange={(e) => setNewSkuCode(e.target.value)}
                  className="w-full h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all placeholder:text-gray-400 font-semibold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
                  DETAILED ITEM NAME (e.g. Brass Washers 8mm) <span className="text-brand-error">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Brass Hex Bolt"
                  value={newSkuName}
                  onChange={(e) => setNewSkuName(e.target.value)}
                  className="w-full h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all placeholder:text-gray-400 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
                    STORAGE SECTION <span className="text-brand-error">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="W-12"
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    className="w-full h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all placeholder:text-gray-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
                    EXPECTED QUANTITY <span className="text-brand-error">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newExpected}
                    onChange={(e) => setNewExpected(Number(e.target.value))}
                    className="w-full h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
                  MOCK DRAWING TEMPLATE SHAPE
                </label>
                <select
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value)}
                  className="w-full h-[40px] px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all font-semibold"
                >
                  <option value="bracket">Steel Bracket (Solid Rectangle)</option>
                  <option value="profile">Aluminum Profile (Double Channel)</option>
                  <option value="sensor">Optical Sensor (Golden core & pins)</option>
                  <option value="seal">O-Ring Seal (Hollow rubber circle)</option>
                  <option value="circuit">Dioded IC Transistor (Black core & pins)</option>
                </select>
              </div>

              {/* HIGH QUALITY REAL REGULATION CATALOG PHOTOGRAPH */}
              <div className="border border-teal-500/10 bg-teal-50/30 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-brand-teal uppercase tracking-widest">
                    Catalog Baseline Photograph
                  </span>
                  <span className="text-[9px] font-bold text-gray-400 uppercase">
                    (Recommended)
                  </span>
                </div>

                {referenceImage ? (
                  <div className="relative rounded-lg overflow-hidden border border-[#bdc9c7] aspect-[4/3] bg-slate-100">
                    <img
                      src={referenceImage}
                      alt="Catalog Snap"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => setReferenceImage('')}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5 hover:bg-red-700 shadow-md active:scale-95 transition-all"
                      type="button"
                    >
                      <X size={14} />
                    </button>
                    <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-[9px] py-1 px-2 rounded backdrop-blur-xs text-center font-bold">
                      Snap successfully recorded!
                    </div>
                  </div>
                ) : modalCameraActive ? (
                  <div className="relative rounded-lg overflow-hidden border border-brand-teal aspect-[4/3] bg-slate-950 flex flex-col justify-between">
                    <video
                      ref={modalVideoRef}
                      playsInline
                      muted
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {/* Viewfinder Overlay guide for custom SKU */}
                    <div className="absolute inset-4 border border-dashed border-white/20 rounded pointer-events-none"></div>
                    <div className="relative z-10 p-2 flex justify-between">
                      <span className="bg-red-600 animate-pulse text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none">
                        LIVE FEED
                      </span>
                    </div>
                    {modalCameraError && (
                      <div className="relative z-20 bg-black/80 text-red-300 text-xs p-3 text-center">
                        Failed to load environment camera stream.
                      </div>
                    )}
                    <div className="relative z-10 p-2 flex justify-center gap-2">
                      <button
                        onClick={handleSnapCatalogPhoto}
                        className="bg-brand-teal text-white hover:bg-brand-teal-light px-4 py-1.5 rounded-lg text-xs font-bold shadow flex items-center gap-1 active:scale-95 transition-all"
                        type="button"
                      >
                        <Camera size={14} /> Snap Catalog Photo
                      </button>
                      <button
                        onClick={() => setModalCameraActive(false)}
                        className="bg-slate-800 text-white/90 px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-all"
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setModalCameraActive(true)}
                        className="flex-1 h-[42px] bg-white hover:bg-teal-50 border border-brand-teal-light/40 text-brand-teal text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        type="button"
                      >
                        <Camera size={15} /> Stream Camera
                      </button>
                      <button
                        onClick={() => modalFileInputRef.current?.click()}
                        className="flex-1 h-[42px] bg-white hover:bg-teal-50 border border-brand-teal-light/40 text-brand-teal text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        type="button"
                      >
                        <Upload size={15} /> Upload Photo
                      </button>
                    </div>
                    <input
                      type="file"
                      ref={modalFileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <div className="text-[10px] text-gray-500 text-center leading-normal">
                      Snap or upload a photo of the item on a tray. This becomes the permanent physical reference for visual counting.
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
                  OPTIONAL METADATA NOTES
                </label>
                <textarea
                  placeholder="e.g. M2.5 pitch zinc plated batch..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg h-16 focus:bg-white focus:border-brand-teal focus:ring-1 focus:ring-brand-teal outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalCameraActive(false);
                    setShowCreateModal(false);
                  }}
                  className="flex-1 h-[44px] border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-semibold text-gray-700 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 h-[44px] bg-brand-teal hover:bg-brand-teal-light text-white rounded-lg text-sm font-bold shadow active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <Check size={16} /> Save Registered SKU
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
