import { getUnits } from '@/lib/data';
import { UnitCard } from '@/components/UnitCard';
import { useProgress } from '@/progressStore';
import { wrongQueueEntries, dueEntries } from '@/lib/scheduler';

export function HomeScreen({ navigate }: { navigate: (to: string) => void }) {
  const units = getUnits();
  const progress = useProgress();
  const totalWrong = wrongQueueEntries(progress.entries).length;
  const totalReview = dueEntries(progress.entries, Date.now()).length;

  return (
    <>
      <div className="app-header">
        <div>
          <h1>Super 2500 字彙練習</h1>
          <div className="sub">國中英文 · PoC</div>
        </div>
      </div>

      <div className="note">
        本站為 PoC 試用版，目前僅提供 Unit 11、12 各約 20 字的完整練習內容。
      </div>

      <div className="section-title">選擇單元</div>
      {units.map((u) => (
        <UnitCard key={u.unit} unit={u} navigate={navigate} />
      ))}

      <div className="section-title">快速入口</div>
      <div className="btn-row">
        <button
          className="btn secondary"
          disabled={totalReview === 0}
          onClick={() => navigate('/unit/11/setup')}
        >
          繼續學習{totalReview > 0 ? `（${totalReview} 待複習）` : ''}
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