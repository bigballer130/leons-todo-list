export interface NamedColor {
  id: string;
  name: string;
  hex: string;
}

export const COLORS: NamedColor[] = [
  { id: 'crimson', name: 'Crimson', hex: '#c2255c' },
  { id: 'red', name: 'Red', hex: '#e5484d' },
  { id: 'orange', name: 'Orange', hex: '#f76b15' },
  { id: 'amber', name: 'Amber', hex: '#f5a524' },
  { id: 'olive', name: 'Olive', hex: '#9da538' },
  { id: 'lime', name: 'Lime', hex: '#74b816' },
  { id: 'green', name: 'Green', hex: '#30a46c' },
  { id: 'mint', name: 'Mint', hex: '#3cb999' },
  { id: 'teal', name: 'Teal', hex: '#12a594' },
  { id: 'sky', name: 'Sky', hex: '#3fb2e0' },
  { id: 'azure', name: 'Azure', hex: '#2f8fe8' },
  { id: 'blue', name: 'Blue', hex: '#3e63dd' },
  { id: 'indigo', name: 'Indigo', hex: '#5b5bd6' },
  { id: 'violet', name: 'Violet', hex: '#8e4ec6' },
  { id: 'plum', name: 'Plum', hex: '#ab4aba' },
  { id: 'pink', name: 'Pink', hex: '#d6409f' },
  { id: 'coral', name: 'Coral', hex: '#f2777a' },
  { id: 'slate', name: 'Slate', hex: '#5b6273' },
  { id: 'grey', name: 'Grey', hex: '#8b8d98' },
  { id: 'sand', name: 'Sand', hex: '#a18072' },
];

export const colorHex = (id: string) => COLORS.find((c) => c.id === id)?.hex ?? '#8b8d98';

export const ACCENTS: NamedColor[] = [
  { id: 'red', name: 'Ember', hex: '#e5484d' },
  { id: 'orange', name: 'Tangerine', hex: '#ee6a1f' },
  { id: 'green', name: 'Meadow', hex: '#2f9e62' },
  { id: 'teal', name: 'Lagoon', hex: '#0f9b8e' },
  { id: 'blue', name: 'Ocean', hex: '#3e63dd' },
  { id: 'violet', name: 'Iris', hex: '#7c4dcc' },
  { id: 'pink', name: 'Blossom', hex: '#d6409f' },
  { id: 'slate', name: 'Graphite', hex: '#4b5262' },
];

/** Priority 1 = most urgent, 4 = none */
export const PRIORITY_COLORS: Record<number, string> = {
  1: '#e5484d',
  2: '#f08c00',
  3: '#3e7bfa',
  4: 'var(--text-3)',
};
