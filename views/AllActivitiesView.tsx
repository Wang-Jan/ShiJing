
import React from 'react';
import { Insight } from '../types';
import { Activity, ChevronLeft, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AllActivitiesViewProps {
  insights: Insight[];
}

const AllActivitiesView: React.FC<AllActivitiesViewProps> = ({ insights }) => {
  const navigate = useNavigate();

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 bg-white dark:bg-slate-900 rounded-full shadow-sm border border-slate-100 dark:border-slate-800"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">所有动态</h2>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        {insights.length === 0 ? (
          <div className="p-10 text-center text-slate-400 italic">暂无动态</div>
        ) : (
          insights.map((item) => (
            <div key={item.id} className="p-4 border-b border-slate-50 dark:border-slate-800 last:border-0 flex gap-4 active:bg-slate-50 dark:active:bg-slate-800 transition-colors">
              <div className="text-[10px] font-bold text-slate-300 dark:text-slate-600 w-10 pt-1 uppercase shrink-0">{item.time}</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.event}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.action}</div>
                {item.score !== undefined && (
                  <div className="mt-2 inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-[10px] font-black">
                    评分：{item.score}
                  </div>
                )}
              </div>
              <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                item.type === 'warn' ? 'bg-orange-400' : 
                item.type === 'success' ? 'bg-green-400' : 
                'bg-blue-400'
              }`} />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AllActivitiesView;
