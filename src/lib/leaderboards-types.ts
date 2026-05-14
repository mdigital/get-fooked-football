// Types + display metadata for the leaderboards. Kept dependency-free so client
// components (e.g. the dropdown / AJAX table) can import without dragging the
// `pg` driver into the browser bundle.

export type BoardKey = 'overall' | 'population' | 'sheep' | 'fifa_underdog' | 'group_only' | 'ko_only';

export type BoardRow = {
  userId: number;
  name: string;
  /** Pre-resolved avatar URL (uploaded path or Gravatar) so client renderers
   *  don't need to import node:crypto. Computed server-side. */
  avatarSrc: string;
  teamCount: number;
  points: number;
  weight: number;
  weightedPoints: number;
};

export const BOARD_META: Record<BoardKey, { label: string; tagline: string; unit: string }> = {
  overall: { label: 'Overall', tagline: 'Pure points. The league everyone knows.', unit: 'pts' },
  population: {
    label: 'By Population',
    tagline: 'Points × combined population (in millions). Rooting for the masses.',
    unit: 'pts·M',
  },
  sheep: {
    label: 'By Sheep',
    tagline: 'Points × total sheep (in millions). Baa-rilliant maths.',
    unit: 'pts·Msheep',
  },
  fifa_underdog: {
    label: 'Underdog Cup',
    tagline: 'Points × average FIFA rank of your teams. The worse your draw, the bigger the multiplier.',
    unit: 'pts·rank',
  },
  group_only: { label: 'Group Stage Only', tagline: 'Points from group-stage matches only.', unit: 'pts' },
  ko_only: { label: 'Knockout Only', tagline: 'Points from R32 onwards.', unit: 'pts' },
};
