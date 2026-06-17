import React from 'react';
import { User as UserType } from '../types';
import { Shield, Server, RefreshCw, LogOut, Cpu, FileSpreadsheet, MapPin } from 'lucide-react';

interface ProfileScreenProps {
  user: UserType;
  onLogout: () => void;
  onResetDatabase: () => void;
  inspectionsCount: number;
}

export default function ProfileScreen({ user, onLogout, onResetDatabase, inspectionsCount }: ProfileScreenProps) {
  return (
    <div className="flex flex-col flex-grow text-[#191c1e] gap-6">
      
      {/* Profile summary header */}
      <div className="bg-white border border-[#bdc9c7]/50 rounded-xl p-5 flex items-center gap-4 shadow-sm">
        {/* Operator initials logo representation */}
        <div className="w-16 h-16 rounded-full bg-brand-teal text-white flex items-center justify-center font-black text-xl shadow-inner border border-white/20">
          {user.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-col">
          <span className="text-base font-bold text-gray-900 leading-tight">{user.name}</span>
          <span className="text-xs font-semibold text-[#505f76] mt-0.5">{user.role}</span>
          <div className="flex items-center gap-1 mt-1.5 text-xs text-brand-teal font-medium">
            <Shield size={12} />
            <span>Authorized Level 2 access</span>
          </div>
        </div>
      </div>

      {/* Terminal details bento section */}
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">
        Active Environment Information
      </h3>

      <div className="flex flex-col gap-3">
        {/* Plant ID */}
        <div className="bg-white border border-[#bdc9c7]/40 rounded-xl p-4 flex gap-3 shadow-sm">
          <div className="text-brand-teal p-1 bg-teal-50 rounded-lg shrink-0 flex items-center justify-center h-8 w-8">
            <MapPin size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Facility Plant</span>
            <span className="text-sm font-bold text-gray-800">{user.plantId}</span>
          </div>
        </div>

        {/* Operating Terminal */}
        <div className="bg-white border border-[#bdc9c7]/40 rounded-xl p-4 flex gap-3 shadow-sm">
          <div className="text-brand-teal p-1 bg-teal-50 rounded-lg shrink-0 flex items-center justify-center h-8 w-8">
            <Cpu size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Scannable Terminal</span>
            <span className="text-sm font-bold text-gray-800 font-mono">Terminal_Aida_Build_P4_409</span>
          </div>
        </div>

        {/* Session Stats */}
        <div className="bg-white border border-[#bdc9c7]/40 rounded-xl p-4 flex gap-3 shadow-sm">
          <div className="text-brand-teal p-1 bg-teal-50 rounded-lg shrink-0 flex items-center justify-center h-8 w-8">
            <FileSpreadsheet size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Shift Inspection logs</span>
            <span className="text-sm font-bold text-gray-800">
              {inspectionsCount} batches received / adjusted this shift
            </span>
          </div>
        </div>
      </div>

      {/* Database Diagnostic and testing tools */}
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none mt-2">
        Diagnostic Controls
      </h3>

      <div className="bg-white border border-[#bdc9c7]/50 rounded-xl p-4 shadow-sm flex flex-col gap-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          Need to test the initial plant layout parameters or reset inventory counts during evaluation? Use the command below to repopulate seed records.
        </p>

        <button
          onClick={() => {
            if (confirm('Are you sure you want to repopulate initial Bühler seed variables and timeline logs?')) {
              onResetDatabase();
            }
          }}
          className="flex items-center justify-center gap-2 w-full h-[40px] border border-[#bdc9c7] rounded-lg text-xs font-bold text-brand-teal hover:bg-slate-50 transition-colors active:scale-95"
        >
          <RefreshCw size={14} />
          <span>Reset Inventory Seed Data</span>
        </button>
      </div>

      {/* Logout Command */}
      <div className="mt-auto pt-6">
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-2 w-full h-[44px] bg-brand-error-container text-brand-brand-error hover:bg-brand-brand-error hover:text-white border border-brand-error/20 rounded-lg font-bold text-sm transition-all shadow-sm active:scale-[0.98]"
        >
          <LogOut size={16} />
          <span>Terminate Active Terminal Session</span>
        </button>
      </div>

    </div>
  );
}
