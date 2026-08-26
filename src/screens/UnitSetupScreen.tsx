import { useMemo, useState } from 'react';
import { getUnit, getEnrichment, getPracticableEntries } from '@/lib/data';
import {
  filterEntries,
  buildBatch,
  BATCH_SIZES,
  DEFAULT_BATCH_SIZE,
  type FilterMode,
  type BatchSize,
} from '@/lib/selection';
import { useProgress } from '@/progressStore';
import { WordPicker } from '@/components/WordPicker';
import { saveSession } from '@/session';
import type { QuestionType } from '@/types/index';

const QUESTION_TYPES: { key: QuestionType | 'mixed'; label: string }[] = [
  { key: 'flashcard', label: '單字卡' },
  { key: 'en2zh', label: '英選中' },
  { key: 'zh2en', label: '中選英' },
  { key: 'cloze', label: '情境填空' },
  { key: 'spelling', label: '拼字' },
  { key: 'mixed', label: '混合' },
];

export function UnitSetupScreen({
  unit,
  navigate,
}: {
  unit: string;
  navigate: (to: string) => void;
}) {
  const vocabUnit = getUnit(unit);
  const progress = useProgress();
  const [mode, setMode] = useState<FilterMode>('important');
  const [customIds, setCustomIds] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState<BatchSize>(DEFAULT_BATCH_SIZE);
  const [qType, setQType] = useState<QuestionType | 'mixed'>('mixed');

  const enrichment = getEnrichment(unit);
  const practicableEntries = useMemo(
    () => getPracticableEntries(unit),
    [unit],
  );

  const filtered = useMemo(
    () =>
      filterEntries(
        vocabUnit?.entries ?? [],
        progress.entries,
        { mode, customIds: [...customIds] },
        true,
      ),
    [vocabUnit, progress.entries, mode, customIds],
  );

  const batch = useMemo(() => buildBatch(filtered, batchSize), [filtered, batchSize]);

  if (!vocabUnit) {
    return (
      <>
        <button className="back-btn" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <div className="empty">找不到此單元</div>
      </>
    );
  }

  const toggleCustom = (id: string) => {
    setCustomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const start = () => {
    if (batch.length === 0) return;
    saveSession({
      unit,
      entryIds: batch.map((e) => e.entryId),
      type: qType,
      batchSize,
    });
    navigate('/practice');
  };

  const filters: { key: FilterMode; label: string }[] = [
    { key: 'important', label: '重要字' },
    { key: 'review', label: '待複習' },
    { key: 'wrong', label: '錯題' },
    { key: 'custom', label: '自訂' },
    { key: 'all', label: '全部瀏覽' },
  ];

  const availableForType = (type: QuestionType | 'mixed'): number => {
    // All practiceable entries support all question types (enrichment is complete).
    void type;
    return filtered.length;
  };

  return (
    <>
      <div className="app-header">
        <div>
          <h1>{vocabUnit.title}</h1>
          <div className="sub">
            共 {vocabUnit.total} 字 · 重要 {vocabUnit.importantCount} 字
          </div>
        </div>
        <button className="back-btn" onClick={() => navigate('/')}>
          ← 返回
        </button>
      </div>

      <div className="section-title">篩選</div>
      <div className="chip-row">
        {filters.map((f) => (
          <button
            key={f.key}
            className={`chip${mode === f.key ? ' active' : ''}`}
            onClick={() => setMode(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="section-title">
        目前可練習 {practicableEntries.length} / {vocabUnit.total} 字
      </div>

      {mode === 'custom' && (
        <WordPicker
          entries={vocabUnit.entries}
          selected={customIds}
          onToggle={toggleCustom}
        />
      )}

      <div className="section-title">批次大小</div>
      <div className="segment">
        {BATCH_SIZES.map((s) => (
          <button
            key={s}
            className={batchSize === s ? 'active' : ''}
            onClick={() => setBatchSize(s)}
          >
            {s} 題
          </button>
        ))}
      </div>

      <div className="section-title">題型</div>
      <div className="segment">
        {QUESTION_TYPES.map((t) => {
          const count = availableForType(t.key);
          const disabled = count === 0;
          return (
            <button
              key={t.key}
              className={qType === t.key ? 'active' : ''}
              disabled={disabled}
              onClick={() => setQType(t.key)}
            >
              {t.label}
              {disabled ? ' (0)' : ''}
            </button>
          );
        })}
      </div>

      <div className="card">
        本次將練習 <strong>{batch.length}</strong> 字
        {batch.length < batchSize && filtered.length > 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            符合篩選的字數少於批次大小
          </div>
        )}
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            目前沒有符合條件的可練習單字，請調整篩選
          </div>
        )}
        {enrichment && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
            含完整練習內容：{enrichment.entries.length} 字
          </div>
        )}
      </div>

      <button
        className="btn"
        disabled={batch.length === 0}
        onClick={start}
      >
        開始練習
      </button>
    </>
  );
}