import { loadResult } from '@/session';
import { summarize } from '@/lib/scoring';
import { getEntry, getEnrichedEntry } from '@/lib/data';
import { loadHistory, historyDailySeries, countCompleted } from '@/lib/history';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { saveSession } from '@/session';
import { clearCheckpoint } from '@/lib/checkpoint';
import { useProgress } from '@/progressStore';
import { useStudyPlan, getCorpus } from '@/studyPlanStore';
import { planState, todayProgress, toLocalDate } from '@/lib/studyPlan';
import type { PlanContext } from '@/session';

export function ResultsScreen({ navigate }: { navigate: (to: string) => void }) {
  const result = loadResult();
  const progress = useProgress();
  const plan = useStudyPlan();

  if (!result || result.results.length === 0) {
    return (
      <>
        <button className="back-btn" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <div className="empty">沒有可顯示的結果</div>
      </>
    );
  }

  const summary = summarize(result.results);
  const wrongEntries = summary.wrongEntries;
  const unitTitle = result.unit === '11' ? 'Unit 11' : `Unit ${result.unit}`;

  const repracticeWrong = () => {
    if (wrongEntries.length === 0) return;
    // Wrong entries may span units (mixed sessions); PracticeScreen resolves
    // entries from a single unit, so keep only this unit's wrong entries
    // instead of silently dropping the rest (P0-3).
    const unitWrong = wrongEntries.filter((w) =>
      w.entryId.startsWith(`u${result.unit}:`),
    );
    saveSession({
      unit: result.unit,
      entryIds: unitWrong.map((w) => w.entryId),
      type: 'mixed',
      batchSize: 20,
      // Re-practicing the same wrong entries is a new round: vary the
      // question order/type rotation (appendHistory in saveResult already
      // counted this completed round).
      round: countCompleted(result.unit, 'mixed'),
    });
    // A new session invalidates any in-flight checkpoint (P1 review 2026-08-29).
    clearCheckpoint();
    navigate('/practice');
  };

  // 下一批 carries question type + fixed cloze difficulty (P0-7).
  const nextBatch = () => {
    const diff =
      result.difficulty && result.difficulty !== 'adaptive'
        ? `/${result.difficulty}`
        : '';
    navigate(`/unit/${result.unit}/setup/${result.type}${diff}`);
  };

  // —— 計畫情境（plan session）——
  // 顯示本組結果＋今日整體進度；主要 CTA 是「繼續今日下一組」。
  const planCtx: PlanContext | undefined = result.plan;
  const isPlanSession = planCtx != null;
  const livePlan = plan && plan.planId === planCtx?.planId ? plan : null;
  const todayStr = toLocalDate(new Date());
  const planSnapshot =
    livePlan?.today && livePlan.today.date === todayStr ? livePlan.today : null;
  const st = livePlan ? planState({ plan: livePlan, progress, now: Date.now() }) : null;

  // 今日下一組：依計畫三區順序找第一個還有未完成 entry 的 Unit group。
  const nextPlanGroup = (() => {
    if (!planSnapshot) return null;
    const done = (id: string) =>
      progress.entries[id]?.lastAnsweredAt != null &&
      answeredTodayLocal(progress.entries[id]!.lastAnsweredAt!, todayStr);
    const sections = [
      { key: 'required-review' as const, groups: planSnapshot.requiredReview },
      { key: 'new' as const, groups: planSnapshot.newEntries },
    ];
    for (const sec of sections) {
      for (const g of sec.groups) {
        const pending = g.entryIds.filter((id) => !done(id));
        if (pending.length > 0) {
          return { section: sec.key, group: g, pending };
        }
      }
    }
    return null;
  })();

  const continuePlan = () => {
    if (!planCtx || !nextPlanGroup) {
      navigate('/plan');
      return;
    }
    clearCheckpoint();
    saveSession({
      unit: nextPlanGroup.group.unit,
      entryIds: nextPlanGroup.pending,
      type: nextPlanGroup.section === 'new' ? 'flashcard' : 'mixed',
      batchSize: nextPlanGroup.pending.length,
      plan: {
        planId: planCtx.planId,
        date: todayStr,
        section: nextPlanGroup.section,
        unit: nextPlanGroup.group.unit,
      },
    });
    navigate('/practice');
  };

  const todayTp = planSnapshot ? todayProgress(planSnapshot, progress) : null;

  return (
    <>
      <div className="app-header">
        <div>
          <h1>練習結果</h1>
          <div className="sub">{unitTitle} · {typeLabel(result.type)}</div>
        </div>
        <div className="header-actions">
          <SettingsDrawer />
          <button className="back-btn" onClick={() => navigate('/')}>
            ← 返回
          </button>
        </div>
      </div>

      {/* 三 KPI（P1-4）：完成 / 答對 / 待再練；accuracy 次要。 */}
      <div className={`card${summary.wrong === 0 ? ' celebrate' : ''}`}>
        {summary.wrong === 0 && (
          <div className="celebrate-banner" role="status">
            🎉 全對！太棒了
          </div>
        )}
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-value">{summary.total}</div>
            <div className="kpi-label">完成</div>
          </div>
          <div className="kpi">
            <div className="kpi-value kpi-success">
              {summary.correct}
            </div>
            <div className="kpi-label">答對</div>
          </div>
          <div className="kpi">
            <div
              className={`kpi-value${wrongEntries.length > 0 ? ' kpi-warn' : ''}`}
            >
              {wrongEntries.length}
            </div>
            <div className="kpi-label">待再練</div>
          </div>
        </div>
        <div className="accuracy-line">
          正確率 {Math.round(summary.accuracy * 100)}%
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">各題型表現</h2>
        {Object.entries(summary.byType).map(([type, s]) => (
          <div className="result-stat" key={type}>
            <span className="label">{typeLabel(type as any)}</span>
            <span className="value">
              {s.correct}/{s.total}
            </span>
          </div>
        ))}
      </div>

      {/* 近 14 天練習趨勢（P2-3）：每天一根柱，高度＝當日題數，顏色＝正確率。 */}
      <div className="card">
        <h2 className="section-title">近 14 天練習趨勢</h2>
        <HistoryChart />
      </div>

      <div className="card">
        <h2 className="section-title">
          需要再練的單字 ({wrongEntries.length})
        </h2>
        {wrongEntries.length === 0 ? (
          <div className="empty">全部答對，太棒了！</div>
        ) : (
          wrongEntries.map((w) => {
            const e = getEntry(w.entryId);
            const en = getEnrichedEntry(w.entryId);
            return (
              <div className="list-item" key={w.entryId}>
                <span>
                  {e?.word} — {en?.zh}
                </span>
                <span className="tag">{typeLabel(w.type)}</span>
              </div>
            );
          })
        )}
      </div>

      {/* 計畫 session：顯示今日整體進度。 */}
      {isPlanSession && todayTp && (
        <div className="card">
          <h2 className="section-title">今日計畫進度</h2>
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={todayTp.reviewTotal + todayTp.newTotal}
            aria-valuenow={todayTp.reviewDone + todayTp.newDone}
            aria-label={`今日必做 ${todayTp.reviewDone + todayTp.newDone} / ${todayTp.reviewTotal + todayTp.newTotal}`}
          >
            <div
              style={{
                width: `${((todayTp.reviewDone + todayTp.newDone) / Math.max(todayTp.reviewTotal + todayTp.newTotal, 1)) * 100}%`,
              }}
            />
          </div>
          <div className="plan-meta">
            {todayTp.done
              ? '今日必做複習與新字全部完成！'
              : `必做複習 ${todayTp.reviewDone}/${todayTp.reviewTotal} · 新字 ${todayTp.newDone}/${todayTp.newTotal}`}
            {st && ` · 全書已學 ${st.introduced}/${getCorpus().entryIds.length}`}
          </div>
        </div>
      )}

      {/* 情境 CTA（P1-4）：計畫 session 的主 CTA 是「繼續今日下一組」；
          必做全部完成則顯示「今日任務完成」。錯題仍可重練，但不破壞
          plan context；可選 strong 不影響完成狀態。 */}
      <div className="btn-row">
        {isPlanSession ? (
          todayTp?.done || !nextPlanGroup ? (
            <button className="btn" onClick={() => navigate('/plan')}>
              今日任務完成，返回計畫
            </button>
          ) : (
            <button className="btn" onClick={continuePlan}>
              繼續今日下一組（{nextPlanGroup.section === 'new' ? '新字' : '複習'} ·{' '}
              Unit {nextPlanGroup.group.unit} · {nextPlanGroup.pending.length} 字）
            </button>
          )
        ) : wrongEntries.length > 0 ? (
          <button className="btn" onClick={repracticeWrong}>
            重練這些字（{wrongEntries.length}）
          </button>
        ) : (
          <button className="btn" onClick={nextBatch}>
            下一批
          </button>
        )}
      </div>
      {!isPlanSession && wrongEntries.length > 0 && (
        <div className="btn-row">
          <button className="btn secondary" onClick={nextBatch}>
            下一批
          </button>
        </div>
      )}
      <div className="btn-row">
        <button className="btn ghost" onClick={() => navigate(isPlanSession ? '/plan' : '/')}>
          {isPlanSession ? '返回計畫' : '返回首頁'}
        </button>
      </div>
    </>
  );
}

/** lastAnsweredAt 是否落在今天（本地日曆日）。與引擎 answeredToday
 *  同一邏輯；此處獨立小函式避免 Results 額外依賴 snapshot date 之外的參數。 */
function answeredTodayLocal(at: number, today: string): boolean {
  const [y, m, d] = today.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const end = new Date(y, m - 1, d + 1).getTime();
  return at >= start && at < end;
}

/** 近 14 天趨勢：純 CSS 柱狀圖，高度＝當日題數，顏色＝正確率。 */
function HistoryChart() {
  const records = loadHistory();
  const series = historyDailySeries(records, Date.now(), 14);
  const maxTotal = Math.max(...series.map((d) => d.total), 1);
  const activeDays = series.filter((d) => d.total > 0).length;

  if (activeDays === 0) {
    return <div className="empty">還沒有練習紀錄——完成一次練習後這裡會顯示趨勢。</div>;
  }

  return (
    <div
      className="trend-chart"
      role="img"
      aria-label={`近 14 天練習趨勢：有練習 ${activeDays} 天`}
    >
      {series.map((d) => {
        const acc = d.total === 0 ? 0 : d.correct / d.total;
        // Color by accuracy; gray when there is no data for the day.
        const barClass =
          d.total === 0 ? '' : acc >= 0.8 ? 'good' : acc >= 0.5 ? 'mid' : 'low';
        return (
          <div className="trend-col" key={d.day}>
            <div className="trend-bar-area">
              <div
                className={`trend-bar ${barClass}`}
                style={{ height: `${Math.max((d.total / maxTotal) * 100, d.total > 0 ? 8 : 2)}%` }}
                title={`${d.day}：${d.correct}/${d.total} 題`}
              />
            </div>
            <div className="trend-day">{d.day}</div>
          </div>
        );
      })}
    </div>
  );
}

function typeLabel(t: string): string {
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