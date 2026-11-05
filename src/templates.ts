import type { Template, TemplateTask } from './types';

const t = (content: string, section: number | null, extra: Partial<TemplateTask> = {}): TemplateTask => ({
  content, description: '', priority: 4, labels: [], section, parent: null, dueOffset: null, time: null, recurrence: null, ...extra,
});

/** Starter templates bundled with the app. */
export const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: 'builtin-weekly-review',
    name: 'Weekly review',
    color: 'violet',
    layout: 'list',
    sections: ['Clear the decks', 'Look back', 'Look ahead'],
    tasks: [
      t('Empty the inbox and sort every task into a project', 0, { recurrence: { freq: 'week', interval: 1, weekdays: [5], text: 'every fri' }, dueOffset: 0 }),
      t('Tidy desk, downloads folder and desktop', 0),
      t('List what got done this week', 1),
      t('Note what slipped and why', 1),
      t('Pick the three most important outcomes for next week', 2, { priority: 1 }),
      t('Check the calendar for the next two weeks', 2),
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-trip',
    name: 'Trip planning',
    color: 'sky',
    layout: 'board',
    sections: ['Before booking', 'Bookings', 'Packing', 'Day before'],
    tasks: [
      t('Choose dates and budget', 0, { priority: 2 }),
      t('Check passport and visa requirements', 0, { priority: 1 }),
      t('Book travel', 1),
      t('Book accommodation', 1),
      t('Arrange travel insurance', 1),
      t('Clothes for the forecast', 2),
      t('Chargers and adapters', 2),
      t('Medication and toiletries', 2),
      t('Check in online', 3),
      t('Download tickets and maps offline', 3),
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-moving',
    name: 'Moving house',
    color: 'sand',
    layout: 'list',
    sections: ['A month before', 'A week before', 'Moving day', 'After the move'],
    tasks: [
      t('Get quotes from movers or book a van', 0, { priority: 2 }),
      t('Declutter and donate what you won’t take', 0),
      t('Tell your bank, employer and doctor the new address', 0),
      t('Set up internet at the new place', 1, { priority: 1 }),
      t('Pack everything except essentials', 1),
      t('Take meter readings', 2),
      t('Do a final walk-through and return keys', 2),
      t('Unpack the kitchen and bedroom first', 3),
      t('Register to vote at the new address', 3),
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-meals',
    name: 'Meal planning',
    color: 'lime',
    layout: 'board',
    sections: ['Plan', 'Shopping list', 'Prep'],
    tasks: [
      t('Choose dinners for the week', 0, { recurrence: { freq: 'week', interval: 1, weekdays: [0], text: 'every sun' }, dueOffset: 0 }),
      t('Check what’s already in the fridge', 0),
      t('Vegetables', 1),
      t('Proteins', 1),
      t('Staples', 1),
      t('Batch-cook lunches', 2),
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];
