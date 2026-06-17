import React, { useState, useMemo } from 'react';
import { TimelineItem } from '../types';
import { Calendar, Filter, ArrowDownCircle, ArrowUpCircle, User, Info, Clock } from 'lucide-react';

interface TimelineScreenProps {
  timeline: TimelineItem[];
}

export default function TimelineScreen({ timeline }: TimelineScreenProps) {
  const [filterType, setFilterType] = useState<'all' | 'received' | 'issued'>('all');
  const [daysFilter, setDaysFilter] = useState<'all' | '7days'>('all');

  // Dynamically filter timelines
  const filteredTimeline = useMemo(() => {
    let result = timeline;

    if (filterType === 'received') {
      result = result.filter(item => item.type === 'RECEIVED');
    } else if (filterType === 'issued') {
      result = result.filter(item => item.type === 'ISSUED');
    }

    if (daysFilter === '7days') {
      result = result.filter(item => item.dateGroup.includes('Today') || item.dateGroup.includes('Yesterday'));
    }

    return result;
  }, [timeline, filterType, daysFilter]);

  // Group filtered records by date header for beautiful sectioning
  const groupedTimeline = useMemo(() => {
    const groups: { [key: string]: TimelineItem[] } = {};
    filteredTimeline.forEach(item => {
      if (!groups[item.dateGroup]) {
        groups[item.dateGroup] = [];
      }
      groups[item.dateGroup].push(item);
    });
    return groups;
  }, [filteredTimeline]);

  return (
    <div className="flex flex-col flex-grow text-[#191c1e] gap-6">
      
      {/* Header and description info */}
      <section className="flex flex-col gap-1 relative">
        <h1 className="text-xl font-bold tracking-tight text-gray-900">Timeline</h1>
        <p className="text-xs text-gray-500">Review recent inventory movements in Plant 4.</p>
        
        {/* Decorative backdrop background card mimicking image */}
        <div 
          aria-hidden="true" 
          className="w-full h-32 rounded-xl overflow-hidden mt-2 opacity-15 pointer-events-none absolute top-0 right-0 z-[-1] bg-cover bg-center"
          style={{ 
            backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuD_ykLvb8ZCDQOqIzTY0FJ0EG0STTaSYt6W-abqWnd_ZJedF7F1PQ9dlRdiZry3SVEQzMZa_OJ5e5ol43v-1Qpz2hrSN0y3TyeznE7X2nrRosop04ED5_zxGfkHTtEiDX8DXvMPVCHdOwDvHm9oKK2UMOebpuZIFdSiyK49XdvlCmBVFv8lho6ZlA1ede7z92OupdktpgWQPThkdkOot4uljgqHW33yXDoW3jrl7kAusAsqZ03LjjvNNrJVJFFIbRm_omv28qVQzl_y')`, 
          }}
        ></div>
      </section>

      {/* Filters pill controls */}
      <section className="flex gap-2 overflow-x-auto pb-1 scrollbar-none shrink-0">
        <button
          onClick={() => setDaysFilter(daysFilter === '7days' ? 'all' : '7days')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full border border-gray-200 transition-all text-xs font-bold whitespace-nowrap min-h-[40px] shadow-sm select-none ${
            daysFilter === '7days'
              ? 'bg-brand-teal text-white border-brand-teal'
              : 'bg-white hover:bg-gray-50 text-gray-600'
          }`}
        >
          <Calendar size={14} />
          <span>Last 7 Days</span>
        </button>

        <button
          onClick={() => {
            setFilterType('all');
            setDaysFilter('all');
          }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full border border-gray-200 transition-all text-xs font-bold whitespace-nowrap min-h-[40px] shadow-sm select-none ${
            filterType === 'all' && daysFilter === 'all'
              ? 'bg-brand-teal text-white border-brand-teal'
              : 'bg-white hover:bg-gray-50 text-gray-600'
          }`}
        >
          <Filter size={14} />
          <span>All Types</span>
        </button>

        <button
          onClick={() => setFilterType(filterType === 'received' ? 'all' : 'received')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full border border-gray-200 transition-all text-xs font-bold whitespace-nowrap min-h-[40px] shadow-sm select-none ${
            filterType === 'received'
              ? 'bg-brand-teal text-white border-brand-teal'
              : 'bg-white hover:bg-emerald-50 text-emerald-700'
          }`}
        >
          <ArrowDownCircle size={14} />
          <span>Received</span>
        </button>

        <button
          onClick={() => setFilterType(filterType === 'issued' ? 'all' : 'issued')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full border border-gray-200 transition-all text-xs font-bold whitespace-nowrap min-h-[40px] shadow-sm select-none ${
            filterType === 'issued'
              ? 'bg-brand-teal-light text-white border-brand-teal'
              : 'bg-white hover:bg-brand-error-container text-brand-brand-error'
          }`}
        >
          <ArrowUpCircle size={14} />
          <span>Issued</span>
        </button>
      </section>

      {/* Grouped Logs lists */}
      <section className="flex flex-col gap-2">
        {Object.keys(groupedTimeline).length === 0 ? (
          <div className="bg-white border border-dashed border-[#bdc9c7]/65 rounded-xl p-8 text-center text-gray-500 my-4 shadow-sm">
            <Info size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-semibold">No recent logs recorded.</p>
            <p className="text-xs mt-1">Change filter mode or process new counts to view records.</p>
          </div>
        ) : (
          (Object.entries(groupedTimeline) as [string, TimelineItem[]][]).map(([dateGroup, items]) => (
            <div key={dateGroup} className="flex flex-col gap-2">
              
              {/* Date Section Header */}
              <div className="sticky top-14 bg-[#f7f9fb]/90 backdrop-blur-sm py-2 px-1 z-10 border-b border-gray-200">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest leading-none">
                  {dateGroup}
                </span>
              </div>

              {/* Transaction elements */}
              {items.map((item) => {
                const isReceive = item.type === 'RECEIVED';
                return (
                  <article
                    key={item.id}
                    className="bg-white border border-[#bdc9c7]/40 rounded-xl p-4 flex flex-col gap-2.5 hover:shadow-md transition-all cursor-pointer shadow-sm relative overflow-hidden"
                  >
                    <div className="flex justify-between items-start w-full">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          isReceive 
                            ? 'bg-emerald-50 text-brand-teal' 
                            : 'bg-brand-error-container text-brand-error'
                        }`}>
                          {isReceive ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-900 leading-tight">
                            {item.itemName}
                          </span>
                          <span className="text-[10px] font-semibold text-gray-400 mt-0.5 font-mono">
                            SKU_TRACK: {item.sku}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end">
                        <span className={`text-base font-extrabold ${isReceive ? 'text-brand-teal' : 'text-brand-error'}`}>
                          {isReceive ? `+${item.quantityChange}` : item.quantityChange}
                        </span>
                        <span className="text-[9px] font-bold text-gray-400 mt-1 flex items-center gap-0.5">
                          <Clock size={9} /> {item.timestamp}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2.5 border-t border-gray-100">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        isReceive 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-brand-error-container text-brand-brand-error'
                      }`}>
                        {item.type}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-500 flex items-center gap-0.5">
                        <User size={10} className="text-gray-400" />
                        {item.reference}
                      </span>
                    </div>
                  </article>
                );
              })}

            </div>
          ))
        )}
      </section>

    </div>
  );
}
