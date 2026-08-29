import { getUnits } from '@/lib/data';
import { UnitGroups } from '@/components/UnitGroups';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { useProgress } from '@/progressStore';
import { wrongQueueEntries, dueEntries } from '@/lib/scheduler';
import { hasResumableCheckpoint, loadCheckpoint } from '@/lib/checkpoint';

export function HomeScreen({ navigate }: { navigate: (to: string) => void }) {
  const units = getUnits();
  const progress = useProgress();
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
  if (resumable) {
    heroTarget = '/practice';
    heroLabel = `繼續上次練習（第 ${resumable.index + 1}/${resumable.questions.length} 題）`;
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
          <div className="hero-title">今日任務</div>
          <div className="hero-sub">
            {resumable
              ? `上次練習未完成，接著做不用重來`
              : wrongUnit
                ? `${totalWrong} 個錯題字等著重練`
                : reviewUnit
                  ? `${totalReview} 個單字到期複習`
                  : '沒有到期任務，學新字正是時候'}
          </div>
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
      </div>
    </>
  );
}