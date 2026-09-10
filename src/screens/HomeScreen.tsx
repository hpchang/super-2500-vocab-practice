import { getUnits } from '@/lib/data';
import { UnitGroups } from '@/components/UnitGroups';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { useProgress } from '@/progressStore';
import { wrongQueueEntries, dueEntries } from '@/lib/scheduler';
import { hasResumableCheckpoint, loadCheckpoint } from '@/lib/checkpoint';
import { useStudyPlan, getCorpus } from '@/studyPlanStore';
import { planState, todayProgress, toLocalDate } from '@/lib/studyPlan';

export function HomeScreen({ navigate }: { navigate: (to: string) => void }) {
  const units = getUnits();
  const progress = useProgress();
  const plan = useStudyPlan();
  const now = Date.now();
  const totalWrong = wrongQueueEntries(progress.entries).length;
  const totalReview = dueEntries(progress.entries, now).length;

  // Hero CTA（P1-1，含 P0-2 導向邏輯）：有錯題→錯題、有到期→複習、
  // 都沒有→開始學新字。導向第一個真的有任務的 Unit，並帶上對應 filter，
  // 而非固定 Unit 11。
  const wrongUnit = units.find((u) =>
    wrongQueueEntries(progress.entries).some((w) =>
      u.entries.some((e) => e.entryId === w.entryId),
    ),
  );
  const reviewUnit = units.find((u) =>
    dueEntries(progress.entries, now).some((id) =>
      u.entries.some((e) => e.entryId === id),
    ),
  );

  let heroLabel: string;
  let heroTarget: string;
  // 中斷的練習（P2-1）優先於一切任務——學生最在意的是「回來接著做」。
  const resumable = hasResumableCheckpoint() ? loadCheckpoint() : null;
  // 學習計畫（優先次僅於 checkpoint）：有 active plan 時首頁主入口是今日計畫。
  const todayStr = toLocalDate(new Date(now));
  const planSnapshot = plan?.today && plan.today.date === todayStr ? plan.today : null;
  const planState_ = plan ? planState({ plan, progress, now }) : null;
  if (resumable) {
    heroTarget = '/practice';
    heroLabel = `繼續上次練習（第 ${resumable.index + 1}/${resumable.questions.length} 題）`;
  } else if (plan && planState_) {
    heroTarget = '/plan';
    heroLabel = planSnapshot ? '繼續今日計畫' : '開始今日計畫';
  } else if (wrongUnit) {
    heroTarget = `/unit/${wrongUnit.unit}/setup/mixed/wrong`;
    heroLabel = `繼續學習：複習錯題（${totalWrong} 字）`;
  } else if (reviewUnit) {
    heroTarget = `/unit/${reviewUnit.unit}/setup/mixed/review`;
    heroLabel = `繼續學習：待複習（${totalReview} 字）`;
  } else {
    // 無待辦 → 導向第一個單元的「重要字」預設設定頁。
    const firstOpen = units[0];
    heroTarget = firstOpen ? `/unit/${firstOpen.unit}/setup` : '/wrong';
    heroLabel = '開始學新字';
  }

  const heroSub = resumable
    ? `上次練習未完成，接著做不用重來`
    : plan && planState_
      ? planSnapshot
        ? `第 ${Math.min(planState_.day, 90)} 天 · 已學 ${planState_.introduced} / ${getCorpus().entryIds.length} 字`
        : '90 天學完全書，今天開始'
      : wrongUnit
        ? `${totalWrong} 個錯題字等著重練`
        : reviewUnit
          ? `${totalReview} 個單字到期複習`
          : '沒有到期任務，學新字正是時候';

  // 今日計畫完成度（有 plan snapshot 時顯示）。
  const tp = planSnapshot ? todayProgress(planSnapshot, progress) : null;
  const planDone = tp?.done ?? false;

  return (
    <>
      <div className="app-header">
        <div>
          <h1>Super 2500 字彙練習</h1>
          <div className="sub">國中英文超強字彙</div>
        </div>
        <SettingsDrawer />
      </div>

      <div className="hero">
        <div className="hero-text">
          <div className="hero-title">
            {plan && planState_ ? '90 天學習計畫' : '今日任務'}
          </div>
          <div className="hero-sub">{heroSub}</div>
          {tp && (
            <div className="hero-sub">
              {planDone
                ? '今日必做已完成 🎉'
                : `今日必做：複習 ${tp.reviewDone}/${tp.reviewTotal} · 新字 ${tp.newDone}/${tp.newTotal}`}
            </div>
          )}
        </div>
        <button className="btn" onClick={() => navigate(heroTarget)}>
          {heroLabel}
        </button>
      </div>

      <h2 className="section-title">選擇單元</h2>
      <UnitGroups units={units} navigate={navigate} />

      <h2 className="section-title">快速入口</h2>
      <div className="btn-row">
        <button
          className="btn secondary"
          disabled={totalWrong === 0}
          onClick={() => navigate('/wrong')}
        >
          複習錯題{totalWrong > 0 ? `（${totalWrong}）` : ''}
        </button>
        {!plan && (
          <button className="btn secondary" onClick={() => navigate('/plan')}>
            90 天學習計畫
          </button>
        )}
      </div>
    </>
  );
}