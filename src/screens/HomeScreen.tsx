import { getUnits, isPracticable } from '@/lib/data';
import { UnitCard } from '@/components/UnitCard';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { useProgress } from '@/progressStore';
import { wrongQueueEntries, dueEntries } from '@/lib/scheduler';

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
      u.entries.some((e) => e.entryId === w.entryId && isPracticable(e.entryId)),
    ),
  );
  const reviewUnit = units.find((u) =>
    dueEntries(progress.entries, now).some(
      (id) =>
        u.entries.some((e) => e.entryId === id) && isPracticable(id),
    ),
  );

  let heroLabel: string;
  let heroTarget: string;
  if (wrongUnit) {
    heroTarget = `/unit/${wrongUnit.unit}/setup/mixed/wrong`;
    heroLabel = `繼續學習：複習錯題（${totalWrong} 字）`;
  } else if (reviewUnit) {
    heroTarget = `/unit/${reviewUnit.unit}/setup/mixed/review`;
    heroLabel = `繼續學習：待複習（${totalReview} 字）`;
  } else {
    // 無待辦 → 導向第一個可練習單元的「重要字」預設設定頁。
    const firstOpen = units.find((u) => u.entries.some((e) => isPracticable(e.entryId)));
    heroTarget = firstOpen ? `/unit/${firstOpen.unit}/setup` : '/wrong';
    heroLabel = '開始學新字';
  }

  return (
    <>
      <div className="app-header">
        <div>
          <h1>Super 2500 字彙練習</h1>
          <div className="sub">國中英文 · PoC</div>
        </div>
        <SettingsDrawer />
      </div>

      <div className="hero">
        <div className="hero-text">
          <div className="hero-title">今日任務</div>
          <div className="hero-sub">
            {wrongUnit
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

      <div className="note">
        本站為 PoC 試用版，目前已開放 Unit 11、12，共 253 字完整練習；其他單元準備中。
      </div>

      <h2 className="section-title">選擇單元</h2>
      {units.map((u) => (
        <UnitCard key={u.unit} unit={u} navigate={navigate} />
      ))}

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