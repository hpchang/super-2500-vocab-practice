import { useMemo, useState } from 'react';
import { getUnit, getEnrichment } from '@/lib/data';
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
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { saveSession } from '@/session';
import { clearCheckpoint } from '@/lib/checkpoint';
import type { DifficultyMode } from '@/lib/questions';
import type { QuestionType } from '@/types/index';

const QUESTION_TYPES: { key: QuestionType | 'mixed'; label: string }[] = [
  { key: 'flashcard', label: '單字卡' },
  { key: 'en2zh', label: '英選中' },
  { key: 'zh2en', label: '中選英' },
  { key: 'cloze', label: '情境填空' },
  { key: 'spelling', label: '拼字' },
  { key: 'mixed', label: '混合' },
];

const DIFFICULTY_OPTIONS: { key: DifficultyMode; label: string }[] = [
  { key: 'adaptive', label: '適性' },
  { key: 'easy', label: '簡易' },
  { key: 'medium', label: '中等' },
  { key: 'hard', label: '艱難' },
];

export function UnitSetupScreen({
  unit,
  navigate,
  type,
  filter,
  difficulty: initialDifficulty,
}: {
  unit: string;
  navigate: (to: string) => void;
  /** Pre-selected question type (from "下一批"), falls back to 'mixed'. */
  type?: QuestionType | 'mixed';
  /** Pre-selected filter mode (deep-link, e.g. Home「繼續學習」→ review/wrong). */
  filter?: FilterMode;
  /** Pre-selected cloze difficulty (P0-7: keep a fixed difficulty across batches). */
  difficulty?: DifficultyMode;
}) {
  const vocabUnit = getUnit(unit);
  const progress = useProgress();
  // Deep-linked params (filter/type/difficulty) imply "進階設定" intent, so
  // start with the drawer open instead of hiding the pre-selections.
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(
    Boolean(filter || (type && type !== 'mixed') || initialDifficulty),
  );
  const [mode, setMode] = useState<FilterMode>(filter ?? 'important');
  const [customIds, setCustomIds] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState<BatchSize>(DEFAULT_BATCH_SIZE);
  const [qType, setQType] = useState<QuestionType | 'mixed'>(type ?? 'mixed');
  const [difficulty, setDifficulty] = useState<DifficultyMode>(
    initialDifficulty ?? 'adaptive',
  );

  const enrichment = getEnrichment(unit);

  const filtered = useMemo(
    () =>
      filterEntries(vocabUnit?.entries ?? [], progress.entries, {
        mode,
        customIds: [...customIds],
      }),
    [vocabUnit, progress.entries, mode, customIds],
  );

  const batch = useMemo(
    () => buildBatch(filtered, batchSize, progress.entries),
    [filtered, batchSize, progress.entries],
  );

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
    // A brand-new session invalidates any in-flight resume checkpoint (P2-1).
    clearCheckpoint();
    saveSession({
      unit,
      entryIds: batch.map((e) => e.entryId),
      type: qType,
      batchSize,
      difficulty,
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

  const typeLabel =
    QUESTION_TYPES.find((t) => t.key === qType)?.label ?? '混合';

  return (
    <>
      <div className="app-header">
        <div>
          <h1>{vocabUnit.title}</h1>
          <div className="sub">
            共 {vocabUnit.total} 字 · 重要 {vocabUnit.importantCount} 字
          </div>
        </div>
        <div className="header-actions">
          <SettingsDrawer />
          <button className="back-btn" onClick={() => navigate('/')}>
            ← 返回
          </button>
        </div>
      </div>

      {/* 一鍵開始（P1-2）：重要字、10 題、混合——不強迫 stepper。 */}
      <div className="quick-start">
        <button
          className="btn"
          disabled={filtered.length === 0}
          onClick={start}
        >
          一鍵開始
        </button>
        <div className="quick-summary">
          {mode === 'important' && '重要字'}
          {mode === 'review' && '待複習'}
          {mode === 'wrong' && '錯題'}
          {mode === 'custom' && `自訂 ${customIds.size} 字`}
          {mode === 'all' && '全部'}
          {' · '}{batchSize} 題 · {typeLabel}
        </div>
      </div>

      <details
        className="advanced-drawer"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary aria-expanded={advancedOpen}>調整練習內容</summary>

        <div className="drawer-body">
          <h2 className="section-title">篩選</h2>
          <div className="chip-row">
            {filters.map((f) => (
              <button
                key={f.key}
                className={`chip${mode === f.key ? ' active' : ''}`}
                aria-pressed={mode === f.key}
                onClick={() => setMode(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <h2 className="section-title">
            已選 {filtered.length} 字 / {vocabUnit.total} 字
          </h2>

          {mode === 'custom' && (
            <WordPicker
              entries={vocabUnit.entries}
              selected={customIds}
              onToggle={toggleCustom}
            />
          )}

          <h2 className="section-title">批次大小</h2>
          <div className="segment">
            {BATCH_SIZES.map((s) => (
              <button
                key={s}
                className={batchSize === s ? 'active' : ''}
                aria-pressed={batchSize === s}
                onClick={() => setBatchSize(s)}
              >
                {s} 題
              </button>
            ))}
          </div>

          <h2 className="section-title">題型</h2>
          <div className="segment">
            {QUESTION_TYPES.map((t) => {
              const count = filtered.length;
              const disabled = count === 0;
              return (
                <button
                  key={t.key}
                  className={qType === t.key ? 'active' : ''}
                  aria-pressed={qType === t.key}
                  disabled={disabled}
                  onClick={() => setQType(t.key)}
                >
                  {t.label}
                  {disabled ? ' (0)' : ''}
                </button>
              );
            })}
          </div>

          {qType === 'cloze' && (
            <>
              <h2 className="section-title">難度</h2>
              <div className="segment">
                {DIFFICULTY_OPTIONS.map((d) => (
                  <button
                    key={d.key}
                    className={difficulty === d.key ? 'active' : ''}
                    aria-pressed={difficulty === d.key}
                    onClick={() => setDifficulty(d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {difficulty === 'adaptive' && (
                <div className="hint drawer-hint">
                  適性模式：首次出中等，答對率 ≤50% 降簡易，答對率 ≥80% 且連對 2 題升艱難
                </div>
              )}
            </>
          )}

          <div className="card drawer-card">
            本次將練習 <strong>{batch.length}</strong> 字
            {batch.length < batchSize && filtered.length > 0 && (
              <div className="drawer-note">符合篩選的字數少於批次大小</div>
            )}
            {filtered.length === 0 && (
              <div className="drawer-note">
                沒有符合條件的單字，請調整篩選
              </div>
            )}
            {enrichment && (
              <div className="drawer-note">
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
        </div>
      </details>
    </>
  );
}