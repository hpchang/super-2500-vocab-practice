import type { VocabEntry } from '@/types/index';
import { isPracticable } from '@/lib/data';
import { useProgress, getEntryProgress } from '@/progressStore';

interface Props {
  entries: VocabEntry[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}

export function WordPicker({ entries, selected, onToggle }: Props) {
  const progress = useProgress();
  return (
    <div className="word-list">
      {entries.map((e) => {
        const practicable = isPracticable(e.entryId);
        const p = getEntryProgress(progress, e.entryId);
        const disabled = !practicable;
        const isSelected = selected.has(e.entryId);
        const stageLabel =
          p.totalAnswered === 0
            ? ''
            : p.stage === 'new'
              ? '未練習'
              : p.stage === 'learning'
                ? '學習中'
                : p.stage === 'review'
                  ? '複習'
                  : '熟悉';
        return (
          <label
            key={e.entryId}
            className={`word-row${disabled ? ' disabled' : ''}`}
            aria-disabled={disabled}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(e.entryId)}
              disabled={disabled}
            />
            <span className="word">
              {e.word}
              {e.important && <span className="imp"> ★</span>}
            </span>
            {!practicable && <span className="tag">尚未提供練習</span>}
            {stageLabel && <span className="tag">{stageLabel}</span>}
            {p.inWrongQueue && <span className="tag" style={{ color: 'var(--danger)' }}>錯題</span>}
          </label>
        );
      })}
    </div>
  );
}