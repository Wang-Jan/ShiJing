import React from 'react';
import { CheckSquare, Square, Trash2, X } from 'lucide-react';

interface RecordDeleteBarProps {
  totalCount: number;
  selectedCount: number;
  selectionMode: boolean;
  disabled?: boolean;
  onToggleMode: () => void;
  onToggleAll: () => void;
  onDeleteSelected: () => void;
  onDeleteAll: () => void;
}

const RecordDeleteBar: React.FC<RecordDeleteBarProps> = ({
  totalCount,
  selectedCount,
  selectionMode,
  disabled = false,
  onToggleMode,
  onToggleAll,
  onDeleteSelected,
  onDeleteAll,
}) => (
  <div className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
    <div className="text-xs font-bold text-slate-400">
      {selectionMode ? `已选择 ${selectedCount} / ${totalCount} 条记录` : `共 ${totalCount} 条可管理记录`}
    </div>
    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
      {selectionMode ? (
        <>
          <button
            type="button"
            onClick={onToggleAll}
            disabled={disabled || totalCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-50 dark:border-slate-800 dark:text-slate-200"
          >
            {selectedCount === totalCount && totalCount > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
            {selectedCount === totalCount && totalCount > 0 ? '取消全选' : '全选'}
          </button>
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={disabled || selectedCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            <Trash2 size={14} />
            删除所选
          </button>
          <button
            type="button"
            onClick={onDeleteAll}
            disabled={disabled || totalCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-200"
          >
            <Trash2 size={14} />
            删除全部
          </button>
          <button
            type="button"
            onClick={onToggleMode}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
          >
            <X size={14} />
            取消
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onToggleMode}
            disabled={disabled || totalCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 disabled:opacity-50 dark:border-slate-800 dark:text-slate-200"
          >
            <CheckSquare size={14} />
            选择记录
          </button>
          <button
            type="button"
            onClick={onDeleteAll}
            disabled={disabled || totalCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-200"
          >
            <Trash2 size={14} />
            删除全部
          </button>
        </>
      )}
    </div>
  </div>
);

export default RecordDeleteBar;
