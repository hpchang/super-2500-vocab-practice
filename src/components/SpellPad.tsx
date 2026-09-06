import { useEffect, useMemo, useRef, useState } from 'react';
import { assembleAnswer, buildSpellPad } from '../lib/spellKeys';

/** SpellPad 狀態不進 checkpoint，重整後重填。 */
export interface SpellPadProps {
  entryId: string;
  word: string;
  disabled: boolean;
  onComplete: (answer: string) => void;
}

export function SpellPad({
  entryId,
  word,
  disabled,
  onComplete,
}: SpellPadProps) {
  const slots = useMemo(() => buildSpellPad(entryId, word), [entryId, word]);
  const letterCount = useMemo(
    () => slots.reduce((count, slot) => count + (slot.letterIndex === null ? 0 : 1), 0),
    [slots],
  );
  const [values, setValues] = useState<(string | null)[]>(() =>
    Array(letterCount).fill(null),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const submittedRef = useRef(false);
  const padRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    padRef.current?.focus();
  }, []);

  const selectSlot = (letterIndex: number) => {
    if (disabled || submittedRef.current) return;
    setActiveIdx(letterIndex);
  };

  const selectKey = (letter: string) => {
    if (disabled || submittedRef.current || activeIdx >= values.length) return;

    const nextValues = values.slice();
    nextValues[activeIdx] = letter;
    setValues(nextValues);

    const isComplete = nextValues.every((value) => value !== null);
    if (isComplete) {
      submittedRef.current = true;
      onComplete(assembleAnswer(word, nextValues));
      return;
    }

    const nextIdx = activeIdx + 1;
    if (nextIdx < nextValues.length) {
      setActiveIdx(nextIdx);
    } else {
      const firstEmpty = nextValues.findIndex((value) => value === null);
      if (firstEmpty !== -1) setActiveIdx(firstEmpty);
    }
  };

  return (
    <div
      ref={padRef}
      className={`spell-pad${disabled ? ' disabled' : ''}`}
      tabIndex={-1}
    >
      <div className="spell-boxes" aria-label="拼字字母">
        {slots.map((slot, slotIndex) => {
          if (slot.letterIndex === null) {
            return (
              <span className="spell-sep" key={`sep-${slotIndex}`}>
                {slot.char}
              </span>
            );
          }

          const letterIndex = slot.letterIndex;
          const value = values[letterIndex];
          const isActive = activeIdx === letterIndex;
          return (
            <button
              type="button"
              className={`spell-box${isActive ? ' active' : ''}${value !== null ? ' filled' : ''}`}
              key={`letter-${letterIndex}`}
              onClick={() => selectSlot(letterIndex)}
              disabled={disabled}
              aria-current={isActive ? 'true' : undefined}
              aria-label={`第 ${letterIndex + 1} 個字母${value ? `：${value}` : ''}`}
            >
              {value ?? ''}
            </button>
          );
        })}
      </div>

      {!disabled && (
        <div className="spell-keypad" role="group" aria-label="拼字作答">
          {slots.find((slot) => slot.letterIndex === activeIdx)?.keys.map((key) => (
            <button
              type="button"
              className="spell-key"
              key={key}
              onClick={() => selectKey(key)}
            >
              {key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
