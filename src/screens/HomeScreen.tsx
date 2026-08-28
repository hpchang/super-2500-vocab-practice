import { getUnits, isPracticable } from '@/lib/data';
import { UnitCard } from '@/components/UnitCard';
import { useProgress } from '@/progressStore';
import { wrongQueueEntries, dueEntries } from '@/lib/scheduler';

export function HomeScreen({ navigate }: { navigate: (to: string) => void }) {
  const units = getUnits();
  const progress = useProgress();
  const now = Date.now();
  const totalWrong = wrongQueueEntries(progress.entries).length;
  const totalReview = dueEntries(progress.entries, now).length;

  // 「繼續學習」導向第一個有到期字的 Unit（錯題優先），並帶上對應 filter，
  // 讓按鈕真的練到該 Unit 的待辦字，而非固定 Unit 11（P0-2）。
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

  let continueLabel = '繼續學習';
  let continueTarget: string | null = null;
  if (wrongUnit) {
    continueTarget = `/unit/${wrongUnit.unit}/setup/mixed/wrong`;
    continueLabel += `（${totalWrong} 錯題）`;
  } else if (reviewUnit) {
    continueTarget = `/unit/${reviewUnit.unit}/setup/mixed/review`;
    continueLabel += `（${totalReview} 待複習）`;
  }

  return (
    <>
      <div className="app-header">
        <div>
          <h1>Super 2500 字彙練習</h1>
          <div className="sub">國中英文 · PoC</div>
        </div>
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
          disabled={continueTarget === null}
          onClick={() => continueTarget && navigate(continueTarget)}
        >
          {continueTarget ? continueLabel : '繼續學習'}
        </button>
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