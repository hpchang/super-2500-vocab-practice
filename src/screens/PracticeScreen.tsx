import { useEffect, useMemo, useState } from 'react';
import { loadSession, saveResult } from '@/session';
import { getUnit, getEnrichedEntry, getEntry } from '@/lib/data';
import { buildSession, buildClozeSession } from '@/lib/questions';
import type { Question } from '@/lib/questions';
import { gradeChoice, gradeFlashcard, checkSpelling } from '@/lib/scoring';
import { recordAnswer } from '@/lib/scheduler';
import { progressiveHint, isMaxHint, MAX_HINT_LEVEL } from '@/lib/hints';
import { warmUpVoices, speak } from '@/lib/speak';
import { countClozeVariants } from '@/lib/clozeGenerator';
import { updateEntryProgress } from '@/progressStore';
import { useProgress } from '@/progressStore';
import { SpeakerButton } from '@/components/SpeakerButton';
import type { QuestionType, VocabEntry } from '@/types/index';

type Feedback =
  | { state: 'correct' }
  | { state: 'wrong' }
  | { state: 'none' };

/** Resolve the English word to pronounce for a question.
 *  - flashcard / en2zh: prompt IS the word
 *  - spelling: answer is the word
 *  - cloze: answer is an entryId → look up the word
 *  - zh2en: prompt is Chinese; answer (entryId) → look up the word
 */
function wordToSpeak(q: Question): string {
  if (q.type === 'flashcard' || q.type === 'en2zh') return q.prompt;
  if (q.type === 'spelling') return q.answer;
  // cloze / zh2en: answer is an entryId
  return getEntry(q.answer)?.word ?? q.prompt;
}

export function PracticeScreen({
  navigate,
}: {
  navigate: (to: string) => void;
}) {
  const session = loadSession();
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [spellInput, setSpellInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback>({ state: 'none' });
  const [hintLevel, setHintLevel] = useState(0);
  const [results, setResults] = useState<
    { entryId: string; type: QuestionType; correct: boolean }[]
  >([]);
  const progress = useProgress();

  const questions = useMemo<Question[]>(() => {
    if (!session) return [];
    const unit = getUnit(session.unit);
    if (!unit) return [];
    const entries = session.entryIds
      .map((id) => unit.entries.find((e) => e.entryId === id))
      .filter(Boolean) as VocabEntry[];
    if (session.type === 'cloze') {
      return buildClozeSession(entries, session.difficulty ?? 'adaptive', progress.entries);
    }
    return buildSession(entries, session.type);
  }, [session, progress.entries]);

  const q = questions[index];

  // Keyboard shortcuts 1-4 for choice questions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || !q.options || feedback.state !== 'none') return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= q.options.length) {
        submitChoice(q.options[n - 1].entryId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, feedback.state]);

  // Load speech voices early so the first speak() has a voice ready.
  useEffect(() => {
    warmUpVoices();
  }, []);

  // Auto-speak on question load for flashcard & en2zh (word is shown before answering).
  useEffect(() => {
    if (q && (q.type === 'flashcard' || q.type === 'en2zh')) {
      speak(q.prompt);
    }
  }, [q]);

  if (!session || questions.length === 0) {
    return (
      <>
        <button className="back-btn" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <div className="empty">沒有練習內容。請先選擇單字。</div>
      </>
    );
  }

  const submitChoice = (entryId: string) => {
    if (feedback.state !== 'none') return;
    setChosen(entryId);
    const r = gradeChoice(entryId, q.answer);
    applyResult(r.correct, q.type);
  };

  const submitSpelling = () => {
    if (feedback.state !== 'none') return;
    const correct = checkSpelling(spellInput, q.answer);
    setChosen(correct ? 'correct' : 'wrong');
    applyResult(correct, q.type);
  };

  const submitFlashcard = (rating: 'forgot' | 'familiar' | 'remembered') => {
    if (feedback.state !== 'none') return;
    const r = gradeFlashcard(rating);
    setChosen(rating);
    applyResult(r.correct, q.type);
  };

  const applyResult = (correct: boolean, type: QuestionType) => {
    const now = Date.now();
    updateEntryProgress(q.entryId, (prev) => {
      const updated = recordAnswer(prev, correct, type, now);
      // Record which cloze variant was used (for adaptive repeat avoidance).
      if (type === 'cloze' && q.clozeDifficulty != null && q.clozeVariant != null) {
        const prevUsed = prev.clozeUsed?.[q.clozeDifficulty] ?? [];
        const totalAtDiff = countClozeVariants(q.entryId, q.clozeDifficulty);
        const used = prevUsed.length >= totalAtDiff ? [] : prevUsed; // reset if all used
        return {
          ...updated,
          clozeUsed: {
            ...used.length ? prev.clozeUsed : {},
            [q.clozeDifficulty]: [...used, q.clozeVariant],
          },
        };
      }
      return updated;
    });
    setFeedback({ state: correct ? 'correct' : 'wrong' });
    setResults((prev) => [...prev, { entryId: q.entryId, type, correct }]);
    // After answering: auto-speak the word for spelling & cloze.
    // (flashcard/en2zh are spoken before answering instead.)
    if (type === 'spelling' || type === 'cloze') {
      speak(wordToSpeak(q));
    }
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      // Save results and navigate.
      saveResult({ unit: session.unit, type: session.type, results });
      navigate('/results');
      return;
    }
    setIndex((i) => i + 1);
    setChosen(null);
    setSpellInput('');
    setFeedback({ state: 'none' });
    setHintLevel(0);
  };

  const enriched = q ? getEnrichedEntry(q.entryId) : undefined;

  return (
    <>
      <div className="app-header">
        <div>
          <h1>{session.unit === '11' ? 'Unit 11' : `Unit ${session.unit}`}</h1>
          <div className="sub">{typeLabel(q?.type)}</div>
        </div>
        <button
          className="back-btn"
          onClick={() => {
            if (confirm('確定要結束本次練習？進度不會儲存為完成。')) navigate('/');
          }}
        >
          結束
        </button>
      </div>

      <div className="qmeta">
        <span>
          第 {index + 1} / {questions.length} 題
        </span>
        <span>
          {typeLabel(q?.type)}
          {q?.type === 'cloze' && q.clozeDifficulty && (
            <span className="diff-badge">
              {' · '}
              {q.clozeDifficulty === 'easy' ? '簡易' : q.clozeDifficulty === 'medium' ? '中等' : '艱難'}
            </span>
          )}
        </span>
      </div>
      <div className="progress-bar">
        <div style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>

      {q && (
        <>
          <div className={`qprompt${q.type === 'cloze' ? ' cloze' : ''}`}>
            {q.prompt}
          </div>

          {/* Pronunciation for flashcard / en2zh: prompt IS the English word,
              so the student can hear it before answering. */}
          {(q.type === 'flashcard' || q.type === 'en2zh') && (
            <div className="speaker-row">
              <SpeakerButton text={q.prompt} size="lg" label="發音" />
            </div>
          )}

          {/* Choice questions */}
          {q.options && q.type !== 'flashcard' && (
            <div className="option-grid">
              {q.options.map((opt, i) => {
                const isAnswer = opt.entryId === q.answer;
                const isChosen = opt.entryId === chosen;
                let cls = 'option-btn';
                if (feedback.state !== 'none') {
                  if (isAnswer) cls += ' correct';
                  else if (isChosen) cls += ' wrong';
                }
                return (
                  <button
                    key={opt.entryId}
                    className={cls}
                    onClick={() => submitChoice(opt.entryId)}
                    disabled={feedback.state !== 'none'}
                  >
                    <span className="key">{i + 1}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Spelling: pronunciation hidden before answering to avoid leaking the answer */}
          {q.type === 'spelling' && (
            <>
              <input
                className="spell-input"
                value={spellInput}
                onChange={(e) => setSpellInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitSpelling()}
                placeholder="輸入英文單字"
                disabled={feedback.state !== 'none'}
                autoFocus
              />
              {/* After answering, let the student hear the word. */}
              {feedback.state !== 'none' && (
                <div className="speaker-row">
                  <SpeakerButton text={wordToSpeak(q)} size="sm" label="發音" />
                </div>
              )}
              <div className="hint">提示：{progressiveHint(q.spellingAnswer ?? '', q.pos ?? 'noun', hintLevel)}</div>
              {feedback.state === 'none' && (
                <div className="hint-actions">
                  {!isMaxHint(hintLevel) ? (
                    <button
                      className="hint-btn"
                      onClick={() => setHintLevel((l) => Math.min(MAX_HINT_LEVEL, l + 1))}
                    >
                      要更多提示（{hintLevel}/{MAX_HINT_LEVEL}）
                    </button>
                  ) : (
                    <span className="hint-exhausted">已顯示完整提示</span>
                  )}
                </div>
              )}
              {feedback.state === 'none' && (
                <button
                  className="btn"
                  style={{ marginTop: 12 }}
                  onClick={submitSpelling}
                  disabled={!spellInput.trim()}
                >
                  送出
                </button>
              )}
            </>
          )}

          {/* Flashcard */}
          {q.type === 'flashcard' && feedback.state === 'none' && (
            <>
              <div className="hint">回想此字的中文意思後，選擇你的熟悉度</div>
              <div className="flashcard-actions">
                <button className="forgot" onClick={() => submitFlashcard('forgot')}>
                  不記得
                </button>
                <button className="familiar" onClick={() => submitFlashcard('familiar')}>
                  有點熟
                </button>
                <button className="remembered" onClick={() => submitFlashcard('remembered')}>
                  記得
                </button>
              </div>
            </>
          )}

          {/* Feedback */}
          {feedback.state !== 'none' && (
            <div className={`feedback ${feedback.state}`}>
              <div>{feedback.state === 'correct' ? '✓ 答對了！' : '✗ 答錯了'}</div>
              {enriched && (
                <>
                  <div className="sentence">{enriched.example}</div>
                  <div className="translation">{enriched.exampleZh}</div>
                  <div className="translation">釋義：{enriched.zh}</div>
                  <div className="speaker-row" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                    <SpeakerButton text={wordToSpeak(q)} size="sm" label="唸單字" />
                    <SpeakerButton text={enriched.example} size="sm" label="唸例句" />
                  </div>
                </>
              )}
              {q.context && q.type === 'cloze' && (
                <>
                  <div className="sentence">{q.context.fullSentence}</div>
                  <div className="translation">{q.context.translation}</div>
                  <div className="translation">線索：{q.context.clue}</div>
                </>
              )}
              {q.type === 'spelling' && feedback.state === 'wrong' && (
                <div className="sentence">正確答案：{q.answer}</div>
              )}
            </div>
          )}

          {feedback.state !== 'none' && (
            <button className="btn" style={{ marginTop: 12 }} onClick={next}>
              {index + 1 >= questions.length ? '查看結果' : '下一題'}
            </button>
          )}
        </>
      )}
    </>
  );
}

function typeLabel(t?: QuestionType): string {
  switch (t) {
    case 'flashcard':
      return '單字卡';
    case 'en2zh':
      return '英選中';
    case 'zh2en':
      return '中選英';
    case 'cloze':
      return '情境填空';
    case 'spelling':
      return '拼字';
    default:
      return '混合';
  }
}