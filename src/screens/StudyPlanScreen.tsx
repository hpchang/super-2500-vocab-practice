import { useEffect, useState } from 'react';
import { useProgress, getSnapshot } from '@/progressStore';
import {
  useStudyPlan,
  getCorpus,
  startPlan,
  freezeToday,
  deletePlan,
  isCorpusCompatible,
  archivePlanDay,
} from '@/studyPlanStore';
import {
  planState,
  todayProgress,
  toLocalDate,
  answeredToday,
  addDays,
  pendingSectionIds,
} from '@/lib/studyPlan';
import { PLAN_TOTAL_DAYS, PLAN_LOAD_WARN_THRESHOLD } from '@/types/index';
import type {
  PlanDayRecord,
  PlanDaySnapshot,
  PlanSectionGroup,
} from '@/types/index';
import type { PlanContext } from '@/session';
import { saveSession, MULTI_UNIT } from '@/session';
import { clearCheckpoint } from '@/lib/checkpoint';
import { SettingsDrawer } from '@/components/SettingsDrawer';

/** 建立計畫／今日任務／管理介面（#/plan）。 */
export function StudyPlanScreen({ navigate }: { navigate: (to: string) => void }) {
  const progress = useProgress();
  const plan = useStudyPlan();
  const corpus = getCorpus();
  const now = Date.now();
  const compatible = isCorpusCompatible();

  // 掛載時補封存已過去的當日 snapshot（冪等；學生隔天才開計畫頁也能
  // 補上前一天的 completed／統計）。
  useEffect(() => {
    archivePlanDay(progress, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!plan) {
    return (
      <CreatePlanView
        navigate={navigate}
        progress={progress}
        corpusSize={corpus.entryIds.length}
      />
    );
  }

  const st = planState({ plan, progress, now });
  const snap = plan.today && plan.today.date === st.today ? plan.today : null;

  return (
    <>
      <div className="app-header">
        <div>
          <h1>90 天學習計畫</h1>
          <div className="sub">
            第 {Math.min(Math.max(st.day, 1), PLAN_TOTAL_DAYS)} / {PLAN_TOTAL_DAYS} 天
            {st.overdue ? '（已逾期）' : ''}
          </div>
        </div>
        <div className="header-actions">
          <SettingsDrawer />
          <button className="back-btn" onClick={() => navigate('/')}>
            ← 返回
          </button>
        </div>
      </div>

      {!compatible && (
        <div className="card plan-warning" role="alert">
          字表資料已更新，與這份計畫凍結的字表不一致。
          請重新建立計畫以重新凍結，現有進度不受影響。
        </div>
      )}

      {/* 整體 KPI */}
      <div className="card">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-value">{st.introduced}</div>
            <div className="kpi-label">已學字數</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{st.remainingNew}</div>
            <div className="kpi-label">剩餘新字</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{st.daysLeft}</div>
            <div className="kpi-label">剩餘天數</div>
          </div>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={corpus.entryIds.length}
          aria-valuenow={st.introduced}
          aria-label={`已學 ${st.introduced} / ${corpus.entryIds.length} 字`}
        >
          <div
            style={{
              width: `${(st.introduced / Math.max(corpus.entryIds.length, 1)) * 100}%`,
            }}
          />
          {/* 理想進度線：第 st.day 天應達成 day / 90 × 全書字數。 */}
          {st.day >= 1 && st.day <= PLAN_TOTAL_DAYS && (
            <div
              className="progress-goal-line"
              style={{
                left: `${(st.day / PLAN_TOTAL_DAYS) * 100}%`,
              }}
            />
          )}
        </div>
        {st.day >= 1 &&
          st.introduced < Math.floor((st.day / PLAN_TOTAL_DAYS) * corpus.entryIds.length) && (
            <div className="plan-meta">
              落後理想進度{' '}
              {Math.floor((st.day / PLAN_TOTAL_DAYS) * corpus.entryIds.length) -
                st.introduced}{' '}
              字
            </div>
          )}
        <div className="plan-meta">
          截止日：{plan.endDate} · 只保存在此瀏覽器
        </div>
        {st.loadWarning && (
          <div className="plan-warning" role="alert">
            每日需學 {st.newQuota} 字（超過 {PLAN_LOAD_WARN_THRESHOLD}），
            負荷偏高。期限不變，建議盡早補進度。
          </div>
        )}
        {st.overdue && !st.acquisitionComplete && (
          <div className="plan-warning" role="alert">
            已超過第 {PLAN_TOTAL_DAYS} 天，剩餘 {st.remainingNew} 字仍未學。
            期限不變，每日新字量將維持高配額直到完成。
          </div>
        )}
        {st.acquisitionComplete && (
          <div className="celebrate-banner" role="status">
            🎉 全書首次學習完成！錯題與到期複習會繼續協助你維持記憶。
          </div>
        )}
      </div>

      <PlanProgressCard
        days={plan.days}
        st={st}
        todayTp={snap ? todayProgress(snap, progress) : null}
        todayStr={st.today}
      />

      {/* 今日任務三區 */}
      {snap ? (
        <TodayView
          snapshot={snap}
          progress={progress}
          planId={plan.planId}
          navigate={navigate}
        />
      ) : (
        <div className="card">
          <h2 className="section-title">今日任務</h2>
          <div className="empty">今天的任務還未建立。</div>
          <button
            className="btn"
            onClick={() => {
              freezeToday(progress, now);
            }}
          >
            開始今日任務
          </button>
        </div>
      )}

      <ManagePlan />
    </>
  );
}

function CreatePlanView({
  navigate,
  progress,
  corpusSize,
}: {
  navigate: (to: string) => void;
  progress: ReturnType<typeof useProgress>;
  corpusSize: number;
}) {
  const today = toLocalDate(new Date());
  const [startDate, setStartDate] = useState(today);
  const introduced = getCorpus().entryIds.filter(
    (id) => (progress.entries[id]?.totalAnswered ?? 0) > 0,
  ).length;
  const remaining = corpusSize - introduced;
  // 預估首日新字量（以全書 90 天平均估，建立後依實際剩餘天數平滑重排）。
  const firstDayQuota = Math.ceil(remaining / PLAN_TOTAL_DAYS);

  const create = () => {
    startPlan(progress, { startDate });
    freezeToday(getSnapshot(), Date.now());
    navigate('/plan');
  };

  return (
    <>
      <div className="app-header">
        <div>
          <h1>90 天學習計畫</h1>
          <div className="sub">引導式每日計畫，90 天學完全書</div>
        </div>
        <div className="header-actions">
          <SettingsDrawer />
          <button className="back-btn" onClick={() => navigate('/')}>
            ← 返回
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">建立計畫</h2>
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-value">{corpusSize}</div>
            <div className="kpi-label">計畫字數</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{introduced}</div>
            <div className="kpi-label">既有進度抵免</div>
          </div>
          <div className="kpi">
            <div className="kpi-value">{firstDayQuota}</div>
            <div className="kpi-label">首日新字</div>
          </div>
        </div>
        <p className="plan-meta">
          以 90 個日曆天完成全書首次學習；已作答的 {introduced} 字直接抵免，
          只分配剩餘 {remaining} 字。答錯的字會進錯題佇列，於後續計畫日成為必做複習。
        </p>
        <div className="settings-row">
          <label htmlFor="plan-start">開始日</label>
          <input
            id="plan-start"
            type="date"
            value={startDate}
            min={today}
            onChange={(e) => setStartDate(e.target.value || today)}
          />
        </div>
        <div className="btn-row">
          <button className="btn" onClick={create}>
            開始 90 天計畫
          </button>
          <button className="btn ghost" onClick={() => navigate('/')}>
            先不要
          </button>
        </div>
      </div>
    </>
  );
}

/** 今日任務三區：必做複習 → 今日新字 → 熟字快複習（可選）。 */
function TodayView({
  snapshot,
  progress,
  planId,
  navigate,
}: {
  snapshot: PlanDaySnapshot;
  progress: ReturnType<typeof useProgress>;
  planId: string;
  navigate: (to: string) => void;
}) {
  const tp = todayProgress(snapshot, progress);

  return (
    <>
      <div className="card">
        <h2 className="section-title">今日任務（第 {snapshot.day} 天）</h2>
        <div
          className="progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={tp.reviewTotal + tp.newTotal}
          aria-valuenow={tp.reviewDone + tp.newDone}
          aria-label={`今日必做 ${tp.reviewDone + tp.newDone} / ${tp.reviewTotal + tp.newTotal}`}
        >
          <div
            style={{
              width: `${((tp.reviewDone + tp.newDone) / Math.max(tp.reviewTotal + tp.newTotal, 1)) * 100}%`,
            }}
          />
        </div>
        {tp.done ? (
          <div className="celebrate-banner" role="status">
            🎉 今日任務完成！
          </div>
        ) : (
          <div className="plan-meta">
            必做複習 {tp.reviewDone}/{tp.reviewTotal} · 新字 {tp.newDone}/
            {tp.newTotal}（熟字快複習為可選，不影響完成）
          </div>
        )}
      </div>

      <SectionCard
        title={`必做複習（${tp.reviewTotal - tp.reviewDone} 待做）`}
        groups={snapshot.requiredReview}
        progress={progress}
        planId={planId}
        date={snapshot.date}
        section="required-review"
        navigate={navigate}
        suggestFirst={!tp.done && tp.reviewTotal > 0}
      />

      <SectionCard
        title={`今日新字（${tp.newTotal - tp.newDone} 待做）`}
        groups={snapshot.newEntries}
        progress={progress}
        planId={planId}
        date={snapshot.date}
        section="new"
        navigate={navigate}
        suggestedType="flashcard"
      />

      <SectionCard
        title={`熟字快複習（可選，${tp.optionalDone}/${tp.optionalTotal}）`}
        groups={snapshot.optionalStrong}
        progress={progress}
        planId={planId}
        date={snapshot.date}
        section="optional-strong"
        navigate={navigate}
      />
    </>
  );
}

/** 一個 section 的 Unit 分組列表與啟動按鈕。 */
function SectionCard({
  title,
  groups,
  progress,
  planId,
  date,
  section,
  navigate,
  suggestedType = 'mixed',
  suggestFirst = false,
}: {
  title: string;
  groups: PlanSectionGroup[];
  progress: ReturnType<typeof useProgress>;
  planId: string;
  date: string;
  section: PlanContext['section'];
  navigate: (to: string) => void;
  suggestedType?: 'flashcard' | 'mixed';
  suggestFirst?: boolean;
}) {
  const total = groups.reduce((n, g) => n + g.entryIds.length, 0);
  // 與卡片標題的 todayProgress（answeredToday）同一判定——不用
  // totalAnswered > 0，否則昨天答過的複習字會被誤標為已完成。
  const done = (id: string) => answeredToday(id, date, progress);
  // 一鍵複習：跨 Unit 的整區待做字（錯題優先、逾期早者優先）。
  const multiEnabled = section !== 'new';
  const pending =
    multiEnabled && total > 0 ? pendingSectionIds(groups, date, progress) : [];

  const startMulti = (batchSize: number) => {
    if (pending.length === 0 || batchSize <= 0) return;
    clearCheckpoint();
    saveSession({
      unit: MULTI_UNIT,
      // 存全部 pending，由 PracticeScreen 依 batchSize 切出本批。
      entryIds: pending,
      type: suggestedType,
      batchSize,
      plan: { planId, date, section, unit: MULTI_UNIT },
    });
    navigate('/practice');
  };

  return (
    <div className="card">
      <h2 className="section-title">
        {title}
        {suggestFirst && '（建議先做）'}
      </h2>
      {total === 0 ? (
        <div className="empty">今日沒有這類任務。</div>
      ) : (
        <>
          {multiEnabled && pending.length > 0 && (
            <div className="ratio-row" role="group" aria-label="一鍵複習比例">
              <span className="ratio-label">一鍵複習</span>
              {[
                { label: '1/3', ratio: 1 / 3 },
                { label: '1/2', ratio: 1 / 2 },
                { label: '2/3', ratio: 2 / 3 },
                { label: '全部', ratio: 1 },
              ].map(({ label, ratio }) => {
                const n = Math.ceil(pending.length * ratio);
                return (
                  <button
                    key={label}
                    className="btn secondary ratio-btn"
                    disabled={n === 0}
                    onClick={() => startMulti(n)}
                  >
                    {label} · {n} 字
                  </button>
                );
              })}
            </div>
          )}
          {groups.map((g) => {
            const pending = g.entryIds.filter((id) => !done(id)).length;
            const planCtx: PlanContext = {
              planId,
              date,
              section,
              unit: g.unit,
            };
            return (
              <div className="list-item" key={`${section}-${g.unit}`}>
                <span>
                  Unit {g.unit} · {g.entryIds.length} 字
                  {pending === 0 ? ' · 已完成' : ''}
                </span>
                <button
                  className="btn secondary"
                  onClick={() => {
                    // 一天跨 Unit 時以多個短 session 串接：每個 Unit group
                    // 一個 session，作答照常回寫，完成後 Results 導回計畫。
                    clearCheckpoint();
                    saveSession({
                      unit: g.unit,
                      entryIds: g.entryIds,
                      type: suggestedType,
                      batchSize: g.entryIds.length,
                      plan: planCtx,
                    });
                    navigate('/practice');
                  }}
                >
                  {pending === 0 ? '再練一次' : `開始（${pending} 字）`}
                </button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/** 計畫成效：每日正確率趨勢、累計正確率、完成天數／streak。
 *  統計只算計畫 session（saveResult → recordPlanAnswer），不含一般練習。 */
function PlanProgressCard({
  days,
  st,
  todayTp,
  todayStr,
}: {
  days: PlanDayRecord[];
  st: ReturnType<typeof planState>;
  todayTp: ReturnType<typeof todayProgress> | null;
  todayStr: string;
}) {
  // 讀取時對缺欄位給 0（舊資料可能沒有 answered/correct）。
  const answered = (d: PlanDayRecord) => d.answered ?? 0;
  const correct = (d: PlanDayRecord) => d.correct ?? 0;
  const totalAnswered = days.reduce((n, d) => n + answered(d), 0);
  const totalCorrect = days.reduce((n, d) => n + correct(d), 0);

  // 完成天數／streak：今日未封存也算——todayTp.done 時直接計入。
  const completedCount = days.filter((d) => d.completed).length;
  const doneDates = new Set(days.filter((d) => d.completed).map((d) => d.date));
  if (todayTp?.done) doneDates.add(todayStr);
  let streak = 0;
  let cur = todayStr;
  while (doneDates.has(cur)) {
    streak++;
    cur = addDays(cur, -1);
  }

  return (
    <div className="card">
      <h2 className="section-title">計畫成效</h2>
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-value">
            {totalAnswered === 0
              ? '—'
              : `${Math.round((totalCorrect / totalAnswered) * 100)}%`}
          </div>
          <div className="kpi-label">累計正確率</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">{completedCount}</div>
          <div className="kpi-label">完成天數</div>
        </div>
        <div className="kpi">
          <div className="kpi-value">{streak}</div>
          <div className="kpi-label">連續完成</div>
        </div>
      </div>

      <PlanTrendChart days={days} currentDay={st.day} />
    </div>
  );
}

/** 每日正確率趨勢：柱高＝該日作答題數，顏色＝正確率。只畫最近
 *  PLAN_TREND_WINDOW 個已過去的日子（day <= currentDay）——90 天全畫會在
 *  320px 底線擠爆並造成整頁橫捲；每柱標自己的計畫天數，軸線仍有意義。 */
const PLAN_TREND_WINDOW = 14;

function PlanTrendChart({
  days,
  currentDay,
}: {
  days: PlanDayRecord[];
  currentDay: number;
}) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  // 今天＝第 currentDay 天，反推各日日期；只取尾部視窗。
  const totalDay = Math.max(Math.min(currentDay, PLAN_TOTAL_DAYS), 1);
  const firstDay = Math.max(1, totalDay - PLAN_TREND_WINDOW + 1);
  const startDate = addDays(toLocalDate(new Date()), -totalDay + 1);
  const rows = days.filter((d) => d.day <= currentDay);

  if (rows.length === 0 || rows.every((d) => (d.answered ?? 0) === 0)) {
    return (
      <div className="empty">
        還沒有計畫練習紀錄——完成計畫任務後這裡會顯示趨勢。
      </div>
    );
  }

  const maxAnswered = Math.max(...rows.map((d) => d.answered ?? 0), 1);
  return (
    <div
      className="trend-chart"
      role="img"
      aria-label={`每日正確率趨勢：計畫第 ${firstDay}–${totalDay} 天`}
    >
      {Array.from({ length: totalDay - firstDay + 1 }, (_, i) => i + firstDay).map(
        (day) => {
          const rec = byDate.get(addDays(startDate, day - 1));
          const n = rec?.answered ?? 0;
          const c = rec?.correct ?? 0;
          const acc = n === 0 ? 0 : c / n;
          const barClass =
            n === 0 ? '' : acc >= 0.8 ? 'good' : acc >= 0.5 ? 'mid' : 'low';
          return (
            <div className="trend-col" key={day}>
              <div className="trend-bar-area">
                <div
                  className={`trend-bar ${barClass}`}
                  style={{
                    height: `${Math.max((n / maxAnswered) * 100, n > 0 ? 8 : 2)}%`,
                  }}
                  title={`第 ${day} 天：${c}/${n} 題`}
                />
              </div>
              <div className="trend-day">{day}</div>
            </div>
          );
        },
      )}
    </div>
  );
}

/** 計畫管理：重新建立／刪除（二階段確認）。 */
function ManagePlan() {
  const plan = useStudyPlan();
  const [confirming, setConfirming] = useState(false);
  if (!plan) return null;

  return (
    <div className="card">
      <h2 className="section-title">計畫管理</h2>
      {confirming ? (
        <div className="settings-confirm">
          <p>
            這會刪除目前的 90 天計畫（不影響已學的字、錯題與複習排程），且無法復原。
          </p>
          <div className="btn-row">
            <button className="btn secondary" onClick={() => setConfirming(false)}>
              取消
            </button>
            <button
              className="btn danger"
              onClick={() => {
                deletePlan();
                setConfirming(false);
              }}
            >
              確定刪除
            </button>
          </div>
        </div>
      ) : (
        <div className="btn-row">
          <button className="btn danger" onClick={() => setConfirming(true)}>
            刪除計畫
          </button>
        </div>
      )}
    </div>
  );
}