import { describe, it, expect } from 'vitest';
import {
  makeInitialProgress,
  recordAnswer,
  dueEntries,
  wrongQueueEntries,
  DAY_MS,
} from '../src/lib/scheduler.js';
import type { EntryProgress } from '../src/types/index.js';

const NOW = 1700000000000; // fixed timestamp

describe('scheduler', () => {
  it('initial progress is new, no review time, not in wrong queue', () => {
    const p = makeInitialProgress('u11:bed');
    expect(p.stage).toBe('new');
    expect(p.nextReviewAt).toBeNull();
    expect(p.inWrongQueue).toBe(false);
    expect(p.totalAnswered).toBe(0);
  });

  it('correct answer advances new → learning and schedules +1 day', () => {
    const p = makeInitialProgress('u11:bed');
    const after = recordAnswer(p, true, 'en2zh', NOW);
    expect(after.stage).toBe('learning');
    expect(after.nextReviewAt).toBe(NOW + 1 * DAY_MS);
    expect(after.totalCorrect).toBe(1);
    expect(after.streak).toBe(1);
    expect(after.inWrongQueue).toBe(false);
  });

  it('second correct advances learning → review (+3 days)', () => {
    const p = recordAnswer(makeInitialProgress('x'), true, 'cloze', NOW);
    const after = recordAnswer(p, true, 'cloze', NOW + DAY_MS);
    expect(after.stage).toBe('review');
    expect(after.nextReviewAt).toBe(NOW + DAY_MS + 3 * DAY_MS);
  });

  it('third correct advances review → strong (+7 days)', () => {
    let p: EntryProgress = makeInitialProgress('x');
    p = recordAnswer(p, true, 'cloze', NOW);
    p = recordAnswer(p, true, 'cloze', NOW + DAY_MS);
    p = recordAnswer(p, true, 'cloze', NOW + 4 * DAY_MS);
    expect(p.stage).toBe('strong');
    expect(p.nextReviewAt).toBe(NOW + 4 * DAY_MS + 7 * DAY_MS);
  });

  it('wrong answer drops to learning and enters wrong queue', () => {
    const p = recordAnswer(makeInitialProgress('x'), true, 'cloze', NOW);
    const after = recordAnswer(p, false, 'spelling', NOW + DAY_MS);
    expect(after.stage).toBe('learning');
    expect(after.inWrongQueue).toBe(true);
    expect(after.streak).toBe(0);
    expect(after.wrongCount).toBe(1);
    expect(after.lastWrongType).toBe('spelling');
    expect(after.nextReviewAt).toBe(NOW + DAY_MS + 1 * DAY_MS);
  });

  it('correct after wrong clears the wrong queue', () => {
    const p = recordAnswer(makeInitialProgress('x'), false, 'spelling', NOW);
    const after = recordAnswer(p, true, 'spelling', NOW + DAY_MS);
    expect(after.inWrongQueue).toBe(false);
    expect(after.wrongCount).toBe(0);
  });

  it('familiar rating (P0-5) keeps the stage and uses a shorter interval', () => {
    // new → familiar: stays in learning (not review), interval < 1 day.
    const p = recordAnswer(makeInitialProgress('x'), true, 'flashcard', NOW, 'familiar');
    expect(p.stage).toBe('learning');
    expect(p.nextReviewAt).toBe(NOW + 0.5 * DAY_MS);
    expect(p.totalCorrect).toBe(1);
    expect(p.inWrongQueue).toBe(false);
  });

  it('familiar rating does not advance from learning to review', () => {
    const p = recordAnswer(makeInitialProgress('x'), true, 'flashcard', NOW, 'remembered');
    expect(p.stage).toBe('learning');
    const after = recordAnswer(p, true, 'flashcard', NOW + DAY_MS, 'familiar');
    expect(after.stage).toBe('learning');
    expect(after.nextReviewAt).toBe(NOW + DAY_MS + 0.5 * DAY_MS);
  });

  it('remembered rating advances the stage as before', () => {
    const p = recordAnswer(makeInitialProgress('x'), true, 'flashcard', NOW, 'remembered');
    expect(p.stage).toBe('learning');
    const after = recordAnswer(p, true, 'flashcard', NOW + DAY_MS, 'remembered');
    expect(after.stage).toBe('review');
  });

  it('dueEntries returns entries with null or past nextReviewAt', () => {
    const a = recordAnswer(makeInitialProgress('a'), true, 'cloze', NOW); // due at NOW+1d
    const b = recordAnswer(makeInitialProgress('b'), false, 'cloze', NOW); // due at NOW+1d
    const c = makeInitialProgress('c'); // new → due now
    const due = dueEntries({ a, b, c }, NOW);
    expect(due).toContain('c');
    expect(due).not.toContain('a');
    const dueLater = dueEntries({ a, b, c }, NOW + 2 * DAY_MS);
    expect(dueLater).toContain('a');
    expect(dueLater).toContain('b');
    expect(dueLater).toContain('c');
  });

  it('wrongQueueEntries lists entries still in wrong queue', () => {
    const a = recordAnswer(makeInitialProgress('a'), false, 'cloze', NOW);
    const b = recordAnswer(makeInitialProgress('b'), true, 'cloze', NOW);
    const wrong = wrongQueueEntries({ a, b });
    expect(wrong.map((w) => w.entryId)).toEqual(['a']);
    expect(wrong[0].wrongCount).toBe(1);
  });
});