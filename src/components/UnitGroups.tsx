import type { VocabUnit } from '@/types/index';
import { UnitCard } from '@/components/UnitCard';
import { useGroups, toggleGroup } from '@/groupPrefs';
import { useProgress } from '@/progressStore';

const GROUP_SIZE = 8;

export function UnitGroups({
  units,
  navigate,
}: {
  units: VocabUnit[];
  navigate: (to: string) => void;
}) {
  const { openGroups } = useGroups();
  const progress = useProgress();

  // 連續 8 個 Unit 一組：1–8 / 9–16 / 17–24 / 25–32。
  const groups: { id: string; label: string; units: VocabUnit[] }[] = [];
  for (let i = 0; i < units.length; i += GROUP_SIZE) {
    const slice = units.slice(i, i + GROUP_SIZE);
    const first = Number(slice[0].unit);
    const last = Number(slice[slice.length - 1].unit);
    groups.push({
      id: String(first),
      label: `Unit ${first}–${last}`,
      units: slice,
    });
  }

  return (
    <div className="unit-groups">
      {groups.map((g) => {
        // 跨組加總已學數，讓 summary 一眼看出每個區段的進度。
        const learned = g.units.reduce(
          (sum, u) =>
            sum +
            u.entries.filter(
              (e) =>
                progress.entries[e.entryId] &&
                progress.entries[e.entryId].stage !== 'new',
            ).length,
          0,
        );
        const total = g.units.reduce((sum, u) => sum + u.total, 0);
        const isOpen = openGroups.includes(g.id);
        return (
          <details
            key={g.id}
            className="unit-group"
            open={isOpen}
            onToggle={(e) => {
              const nowOpen = (e.target as HTMLDetailsElement).open;
              if (nowOpen !== isOpen) toggleGroup(g.id);
            }}
          >
            <summary aria-expanded={isOpen}>
              {g.label}
              <span className="unit-group-progress">
                已學 {learned}/{total}
              </span>
            </summary>
            {g.units.map((u) => (
              <UnitCard key={u.unit} unit={u} navigate={navigate} />
            ))}
          </details>
        );
      })}
    </div>
  );
}