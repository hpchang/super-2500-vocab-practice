import { useEffect, useRef, useState } from 'react';
import { getPrefs } from '@/prefs';
import {
  loadSession,
  saveSession,
  saveResult,
  MULTI_UNIT,
} from '@/session';
import type { SessionConfig } from '@/session';
import { getEnrichedEntry, getEntry, unitOfEntryId } from '@/lib/data';
import { buildSession, buildClozeSession } from '@/lib/questions';
import type { Question } from '@/lib/questions';
import { gradeChoice, gradeFlashcard, checkSpelling } from '@/lib/scoring';
import { recordAnswer } from '@/lib/scheduler';
import { progressiveHint, isMaxHint, MAX_HINT_LEVEL } from '@/lib/hints';
import { warmUpVoices, speak, speakRepeatedly } from '@/lib/speak';
import { countClozeVariants } from '@/lib/clozeGenerator';
import {
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from '@/lib/checkpoint';
import { updateEntryProgress, getSnapshot } from '@/progressStore';
import { SpeakerButton } from '@/components/SpeakerButton';
import { SpellPad } from '@/components/SpellPad';
import { ReportDialog } from '@/components/ReportDialog';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import type { QuestionType, VocabEntry, ProgressData } from '@/types/index';

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

/**
 * Build the full question list for a session from the given progress.
 * Cloze sessions read progress to pick adaptive difficulty + the next
 * unused variant, so this must be called with the LATEST progress
 * (getSnapshot()) — never a stale render-time value.
 */
function buildQuestions(
  session: SessionConfig,
  progress: ProgressData,
): Question[] {
  // Entries resolve globally by id (getEntry reads the unit embedded in the
  // id) — 跨 Unit 的一鍵複習 session（unit: MULTI_UNIT）也靠這裡解析；
  // 逐 Unit 查找會讓 multi session 拿到空畫面。
  const entries = (
    session.entryIds
      .map(getEntry)
      .filter(Boolean) as VocabEntry[]
  ).slice(
    0,
    // Honor the batch size limit — previously batchSize was recorded but
    // never applied, so large wrong-queue sessions exceeded it (P0-3).
    session.batchSize,
  );
  if (session.type === 'cloze') {
    return buildClozeSession(
      entries,
      session.difficulty ?? 'adaptive',
      progress.entries,
      session.round ?? 0,
    );
  }
  // 兩種情境的混合輪替不含拼字：錯題複習（session.excludeSpelling，學生
  // 要求）與 90 天計畫複習（session.plan）。一般練習的混合題仍含拼字，
  // 也可單選拼字題型。
  return buildSession(
    entries,
    session.type,
    session.round ?? 0,
    session.excludeSpelling === true || session.plan != null,
  );
}

export function PracticeScreen({
  navigate,
}: {
  navigate: (to: string) => void;
}) {
  // Resume (P2-1): a valid checkpoint restores the exact in-flight session —
  // locked question list, position, partial results — after a refresh or a
  // closed tab. The questions come from the checkpoint itself (not rebuilt),
  // so the presented questions are identical to the ones the student saw.
  // The checkpoint is only usable when it belongs to the live session: when
  // this tab already started a DIFFERENT session, the stored questions are
  // stale and must not leak into the new session (P1 review 2026-08-29).
  // When sessionStorage is empty (closed tab), the checkpoint's own session
  // config revives the session so the resume actually works.
  let restored = loadCheckpoint();
  let session = loadSession();
  if (restored && !session) {
    // Closed-tab case: restore the session recorded in the checkpoint.
    saveSession(restored.session);
    session = restored.session;
  } else if (
    restored &&
    session &&
    JSON.stringify(session) !== JSON.stringify(restored.session)
  ) {
    // This tab moved on to a different session — the checkpoint is stale.
    clearCheckpoint();
    restored = null;
  }
  const [index, setIndex] = useState(restored ? restored.index : 0);
  const [chosen, setChosen] = useState<string | null>(null);
  // A checkpoint saved right after answering has results.length === index+1:
  // the current question was already answered and feedback was showing.
  // Restore that phase, otherwise the student can re-answer the same
  // question and record it twice (P1 review 2026-08-29).
  const restoredFeedback: Feedback =
    restored && restored.results.length === restored.index + 1
      ? { state: restored.results[restored.index].correct ? 'correct' : 'wrong' }
      : { state: 'none' };
  const [feedback, setFeedback] = useState<Feedback>(restoredFeedback);
  const [hintLevel, setHintLevel] = useState(0);
  const initialResults: { entryId: string; type: QuestionType; correct: boolean }[] =
    restored ? restored.results : [];
  const [results, setResults] = useState(initialResults);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  // Auto-advance bookkeeping (see applyResult).
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveringFeedback = useRef(false);
  // Set when auto-advance was deferred because the student was reading
  // (hovering); advancing happens when they move the pointer away.
  const advanceOnLeave = useRef(false);

  // Questions are built ONCE at session start, then rebuilt only in next()
  // with the latest progress. Building from render-time progress here (as a
  // useMemo keyed on progress.entries) made answering mutate progress → the
  // whole list was rebuilt → the current index jumped to the next cloze
  // variant of the same word (待辦 #2: 作答後題目錯位). Locking the list
  // keeps the presented question stable; adaptive difficulty/variant choice
  // is deferred to next(), where it reads fresh progress.
  const [questions, setQuestions] = useState<Question[]>(() =>
    restored
      ? restored.questions
      : session
        ? buildQuestions(session, getSnapshot())
        : [],
  );

  const q = questions[index];

  // 回報題目問題對話框（僅情境填空）。
  const [reportOpen, setReportOpen] = useState(false);
  const reportBtnRef = useRef<HTMLButtonElement | null>(null);

  // Keyboard: 1-4 answers choice questions; Enter/Space advances during
  // feedback so the whole session is doable without leaving the keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return;
      if (feedback.state === 'none') {
        if (!q.options) return;
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= q.options.length) {
          submitChoice(q.options[n - 1].entryId);
        }
        return;
      }
      // Feedback phase: Enter/Space → next question. Ignore keys pressed
      // while a button/input inside the feedback has focus so Space still
      // activates the focused control (e.g. speaker buttons).
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
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

  // Persist the resume checkpoint whenever position or results change
  // (P2-1). The effect skips the very first mount of a restored session
  // (state already matches the checkpoint); a fresh session saves nothing
  // until the first answer lands (index/results change).
  const mountRef = useRef(true);
  useEffect(() => {
    if (mountRef.current) {
      mountRef.current = false;
      return;
    }
    if (!session || questions.length === 0) return;
    if (index >= questions.length) return;
    saveCheckpoint({ session, questions, index, results, savedAt: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, results]);

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

  const submitSpelling = (answer: string) => {
    if (feedback.state !== 'none') return;
    const correct = checkSpelling(answer, q.answer);
    setChosen(correct ? 'correct' : 'wrong');
    applyResult(correct, q.type);
  };

  const submitFlashcard = (rating: 'forgot' | 'familiar' | 'remembered') => {
    if (feedback.state !== 'none') return;
    const r = gradeFlashcard(rating);
    setChosen(rating);
    applyResult(r.correct, q.type, rating);
    // 注意：單字卡的中文釋義只出現在 feedback 區（prompt 只有英文單字），
    // 所以這裡不能「選完即走」——必須停留顯示釋義，讓使用者看完再前進。
  };

  const applyResult = (
    correct: boolean,
    type: QuestionType,
    rating?: 'forgot' | 'familiar' | 'remembered',
  ) => {
    const now = Date.now();
    // 計畫情境（plan session）：作答一次即完成該 entry 的當日 task——
    // 答錯也算（仍進錯題佇列，於後續計畫日成為必做）。完成判定由
    // answeredToday（lastAnsweredAt 落在今天）驅動，recordAnswer 更新
    // lastAnsweredAt 即完成 task，天然冪等——重複回寫、checkpoint 恢復
    // 或 Results reload 都不會重複計數。
    updateEntryProgress(q.entryId, (prev) => {
      const updated = recordAnswer(prev, correct, type, now, rating);
      // Record which cloze variant was used (for adaptive repeat avoidance).
      if (type === 'cloze' && q.clozeDifficulty != null && q.clozeVariant != null) {
        const prevUsed = prev.clozeUsed?.[q.clozeDifficulty] ?? [];
        const totalAtDiff = countClozeVariants(q.entryId, q.clozeDifficulty);
        // Reset only the CURRENT difficulty's list when its pool is exhausted —
        // always keep other tiers' usage records (P0-6).
        const used = prevUsed.length >= totalAtDiff ? [] : prevUsed;
        return {
          ...updated,
          clozeUsed: {
            ...prev.clozeUsed,
            [q.clozeDifficulty]: [...used, q.clozeVariant],
          },
        };
      }
      return updated;
    });
    setFeedback({ state: correct ? 'correct' : 'wrong' });
    setResults((prev) => [...prev, { entryId: q.entryId, type, correct }]);
    // Move focus to the feedback region so keyboard/SR users land on the
    // answer feedback instead of staying on a now-disabled control (P0-10).
    requestAnimationFrame(() => feedbackRef.current?.focus());
    // After answering: auto-speak the word 3 times for spelling & cloze, so
    // the learner can hear and echo the pronunciation while reading feedback.
    // (flashcard/en2zh are spoken once before answering instead.)
    if (type === 'spelling' || type === 'cloze') {
      speakRepeatedly(wordToSpeak(q), 3);
    }

    // Auto-advance (P2 UX): a correct answer moves on by itself after a
    // short beat; wrong answers stay so the student can read the feedback.
    // opt-in via settings; hover over feedback pauses the timer; the last
    // question still waits for an explicit click (results are a milestone).
    if (correct && getPrefs().autoAdvance && index + 1 < questions.length) {
      const timer = setTimeout(() => {
        if (!hoveringFeedback.current) next();
        else advanceOnLeave.current = true;
      }, 1200);
      autoAdvanceTimer.current = timer;
    }
  };

  const next = () => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    advanceOnLeave.current = false;
    hoveringFeedback.current = false;
    // Rebuild with the LATEST progress (getSnapshot, not render-time state)
    // so the next question's adaptive difficulty and cloze variant reflect
    // the answer just recorded. The presented question stays locked until
    // this point — answering never swaps the current question.
    const rebuilt = buildQuestions(session, getSnapshot());
    if (index + 1 >= rebuilt.length) {
      // Session complete: drop the resume checkpoint (P2-1) — a finished
      // session must not be offered again — then save results and navigate.
      clearCheckpoint();
      saveResult({
        unit: session.unit,
        type: session.type,
        difficulty: session.difficulty,
        // excludeSpelling 刻意不進結果：錯題 session 走的是「下一批」→
        // 設定頁（重新選題型/篩選），沒有跨批次延續的欄位可帶
        // （round 也是同樣處理）。若日後要在設定頁延續，再補這裡＋
        // ResultsScreen.nextBatch 的 URL 參數。
        plan: session.plan,
        results,
      });
      navigate('/results');
      return;
    }
    setQuestions(rebuilt);
    setIndex((i) => i + 1);
    setChosen(null);
    setFeedback({ state: 'none' });
    setHintLevel(0);
  };

  const enriched = q ? getEnrichedEntry(q.entryId) : undefined;

  return (
    <>
      <div className="app-header">
        <div>
          <h1>
            {session.unit === MULTI_UNIT
              ? '計畫複習'
              : session.unit === '11'
                ? 'Unit 11'
                : `Unit ${session.unit}`}
          </h1>
          <div className="sub">{typeLabel(q?.type)}</div>
        </div>
        <div className="header-actions">
          {/* Practice 用不離題 drawer（P1-6）：只有設定，沒有離開按鈕。 */}
          <SettingsDrawer />
          <button
            className="back-btn"
            onClick={() => {
              if (confirm('確定要結束本次練習？進度不會儲存為完成。')) navigate('/');
            }}
          >
            結束
          </button>
        </div>
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
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={questions.length}
        aria-label={`第 ${index + 1} / ${questions.length} 題`}
      >
        <div style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
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
              <SpellPad
                key={`${q.entryId}:${q.type}`}
                entryId={q.entryId}
                word={q.spellingAnswer ?? q.answer}
                disabled={feedback.state !== 'none'}
                onComplete={submitSpelling}
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

          {/* Feedback — announced to assistive tech; not just color (P0-10/P0-11).
              Clicking anywhere in it advances (mobile-friendly), except on
              the speaker buttons inside. Hovering pauses auto-advance. */}
          {feedback.state !== 'none' && (
            <div
              ref={feedbackRef}
              className={`feedback ${feedback.state} feedback-clickable`}
              role="status"
              aria-live="polite"
              tabIndex={-1}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                next();
              }}
              onMouseEnter={() => {
                hoveringFeedback.current = true;
              }}
              onMouseLeave={() => {
                hoveringFeedback.current = false;
                if (advanceOnLeave.current) {
                  advanceOnLeave.current = false;
                  next();
                }
              }}
            >
              <div>
                {q.type === 'flashcard'
                  ? flashcardFeedbackTitle(String(chosen))
                  : feedback.state === 'correct'
                    ? '✓ 答對了！'
                    : '✗ 答錯了'}
              </div>
              {enriched && (
                <>
                  {/* 單字卡的釋義是答後最重要的資訊，放大顯示在例句前。 */}
                  <div className={q.type === 'flashcard' ? 'flashcard-zh' : 'translation'}>
                    釋義：{enriched.zh}
                  </div>
                  <div className="sentence">{enriched.example}</div>
                  <div className="translation">{enriched.exampleZh}</div>
                  <div className="speaker-row feedback-speakers">
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
                  <div className="speaker-row">
                    <button
                      ref={reportBtnRef}
                      className="report-btn"
                      onClick={() => setReportOpen(true)}
                      type="button"
                    >
                      ⚠ 回報題目問題
                    </button>
                  </div>
                </>
              )}
              {/* 情境填空／中選英：干擾項也附上中文釋義，
                  答錯時能順帶學到其他選項的意思。 */}
              {(q.type === 'cloze' || q.type === 'zh2en') &&
                q.options
                  ?.filter((opt) => opt.entryId !== q.answer)
                  .map((opt) => (
                    <div key={opt.entryId} className="translation distractor-zh">
                      {opt.label}：{getEnrichedEntry(opt.entryId)?.zh ?? '（無釋義）'}
                    </div>
                  ))}
              {q.type === 'spelling' && feedback.state === 'wrong' && (
                <div className="sentence">正確答案：{q.answer}</div>
              )}
            </div>
          )}

          {feedback.state !== 'none' && (
            <button className="btn action-btn" onClick={next}>
              {index + 1 >= questions.length
                ? '查看結果'
                : '下一題（Enter）'}
            </button>
          )}

          {reportOpen && q && (
            <ReportDialog
              question={q}
              // 跨 Unit session 的 unit 以 entryId 內嵌值解析（session.unit
              // 是 'multi'，直接用會讓回報 payload 變成 'umulti'）。
              unit={unitOfEntryId(q.entryId)}
              openerRef={reportBtnRef}
              onClose={() => setReportOpen(false)}
            />
          )}
        </>
      )}
    </>
  );
}

/** Flashcard feedback title — self-rating, not a right/wrong verdict. */
function flashcardFeedbackTitle(rating: string): string {
  switch (rating) {
    case 'forgot':
      return '沒關係，再看一次釋義';
    case 'familiar':
      return '有點熟——再看一次加深印象';
    default:
      return '✓ 記得！';
  }
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