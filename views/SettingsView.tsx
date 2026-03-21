import React, { useState } from 'react';
import { 
  Settings, 
  Bot, 
  Camera, 
  Key, 
  LogOut, 
  ChevronRight, 
  ShieldCheck, 
  Zap, 
  Cpu,
  User,
  Bell,
  Moon,
  Sun
} from 'lucide-react';
import { motion } from 'framer-motion';

interface SettingsViewProps {
  user: any;
  onLogout: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ user, onLogout }) => {
  const [gardenKey, setGardenKey] = useState(localStorage.getItem('garden_api_key') || '');
  const [robotConnected, setRobotConnected] = useState(false);
  const [cameraConnected, setCameraConnected] = useState(false);

  const handleSaveGardenKey = () => {
    localStorage.setItem('garden_api_key', gardenKey);
    alert('Garden API Key 已保存');
  };

  const SettingItem = ({ icon: Icon, label, value, onClick, color = "text-slate-400" }: any) => (
    <button 
      onClick={onClick}
      className="w-full p-4 bg-white dark:bg-slate-900 border-b border-slate-50 dark:border-slate-800 last:border-0 flex items-center justify-between active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-xl bg-slate-50 dark:bg-slate-800 ${color}`}>
          <Icon size={20} />
        </div>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {value && <span className="text-xs text-slate-400 font-medium">{value}</span>}
        <ChevronRight size={16} className="text-slate-300" />
      </div>
    </button>
  );

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="px-1">
        <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">设置</h2>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">系统配置与账户管理</p>
      </div>

      {/* 用户信息卡片 */}
      <section className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 border-2 border-white dark:border-slate-800 overflow-hidden shrink-0">
          {user?.avatar ? (
            <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-blue-600 font-black text-2xl italic">
              {user?.nickname?.charAt(0) || 'U'}
            </div>
          )}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">{user?.nickname || '未登录'}</h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">账号: {user?.accountId || '-------'}</p>
        </div>
        <button 
          onClick={onLogout}
          className="p-3 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-2xl hover:bg-red-100 transition-colors"
        >
          <LogOut size={20} />
        </button>
      </section>

      {/* 设备连接 */}
      <section className="space-y-3">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">设备连接</h3>
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden border border-slate-100 dark:border-slate-800">
          <SettingItem 
            icon={Bot} 
            label="人性清洁机器人" 
            value={robotConnected ? "已连接" : "未连接"} 
            color="text-blue-500"
            onClick={() => setRobotConnected(!robotConnected)}
          />
          <SettingItem 
            icon={Camera} 
            label="实时监控摄像头" 
            value={cameraConnected ? "已连接" : "未连接"} 
            color="text-green-500"
            onClick={() => setCameraConnected(!cameraConnected)}
          />
        </div>
      </section>

      {/* AI 模型配置 */}
      <section className="space-y-3">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">AI 引擎配置</h3>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-purple-500">
              <Cpu size={20} />
            </div>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Garden 大模型 API Key</span>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Key className="text-slate-400" size={16} />
            </div>
            <input
              type="password"
              value={gardenKey}
              onChange={(e) => setGardenKey(e.target.value)}
              className="block w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
              placeholder="请输入您的 Garden API Key"
            />
          </div>
          <button 
            onClick={handleSaveGardenKey}
            className="w-full bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 py-3 rounded-xl font-bold text-xs active:scale-95 transition-all"
          >
            保存配置
          </button>
          <p className="text-[10px] text-slate-400 text-center italic">保存后系统将优先使用自研 Garden 模型进行分析</p>
        </div>
      </section>

      {/* 通用设置 */}
      <section className="space-y-3">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">通用</h3>
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden border border-slate-100 dark:border-slate-800">
          <SettingItem icon={Bell} label="消息通知" onClick={() => {}} />
          <SettingItem icon={ShieldCheck} label="隐私与安全" onClick={() => {}} />
          <SettingItem icon={User} label="个人资料" onClick={() => {}} />
        </div>
      </section>

      <div className="text-center pb-10">
        <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">视净 Shi Jing v1.2.0</p>
      </div>
    </div>
  );
};

export default SettingsView;
