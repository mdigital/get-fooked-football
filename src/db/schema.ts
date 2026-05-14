import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex, index, primaryKey, varchar, jsonb, numeric } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    isAdmin: boolean('is_admin').notNull().default(false),
    paid: boolean('paid').notNull().default(false),
    /** Public nickname, rendered alongside the real name. Anyone can set
     *  anyone's via /profile/<id> — chaos easter egg, no audit trail. */
    nickname: text('nickname'),
    /** /uploads/<file> path to a self-uploaded avatar. Null => Gravatar. */
    avatarUrl: text('avatar_url'),
    /** NZD this user has pledged to the pot. Clamped to BUY_IN_MIN..BUY_IN_MAX. */
    buyIn: integer('buy_in').notNull().default(100),
    /** Set when the user completes the /onboarding form. Null => still needs to. */
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  }),
);

export const invites = pgTable(
  'invites',
  {
    token: varchar('token', { length: 64 }).primaryKey(),
    email: text('email'),
    note: text('note'),
    usedByUserId: integer('used_by_user_id').references(() => users.id),
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** Multi-use group invite (one rolling link the whole crew shares). */
    multiUse: boolean('multi_use').notNull().default(false),
    /** Token stops working at this time. Null => never expires (legacy). */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const teams = pgTable(
  'teams',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 3 }).notNull(),
    name: text('name').notNull(),
    flag: text('flag').notNull(),
    groupName: varchar('group_name', { length: 2 }).notNull(),
    fifaRank: integer('fifa_rank').notNull().default(999),
    population: integer('population').notNull().default(0),
    sheep: integer('sheep').notNull().default(0),
    // Polymarket's "yes" price for this team to win the World Cup (0..1).
    // Populated by the admin "Sync Polymarket" action; used by the draw to
    // balance teams across players and ensure each player gets one top seed.
    polymarketPrice: numeric('polymarket_price', { precision: 6, scale: 4 }).notNull().default('0'),
    // freeform extra stats so adding "by avg height" etc later is just a row
    stats: jsonb('stats').notNull().default({}),
  },
  (t) => ({
    codeIdx: uniqueIndex('teams_code_idx').on(t.code),
  }),
);

export const teamPreferences = pgTable(
  'team_preferences',
  {
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(), // 1, 2, 3
    teamId: integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.rank] }),
  }),
);

export const teamAssignments = pgTable(
  'team_assignments',
  {
    teamId: integer('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    isLeftover: boolean('is_leftover').notNull().default(false),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId] }),
    userIdx: index('team_assignments_user_idx').on(t.userId),
  }),
);

export const fixtures = pgTable(
  'fixtures',
  {
    id: serial('id').primaryKey(),
    kickoff: timestamp('kickoff', { withTimezone: true }).notNull(),
    stage: text('stage').notNull(), // 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | '3RD' | 'FINAL'
    groupName: varchar('group_name', { length: 2 }),
    venue: text('venue'),
    homeTeamId: integer('home_team_id').references(() => teams.id),
    awayTeamId: integer('away_team_id').references(() => teams.id),
    homeLabel: text('home_label'), // for KO rounds before draw is known: "Winner A1"
    awayLabel: text('away_label'),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    homeScoreEt: integer('home_score_et'),
    awayScoreEt: integer('away_score_et'),
    homePens: integer('home_pens'),
    awayPens: integer('away_pens'),
    status: text('status').notNull().default('SCHEDULED'), // SCHEDULED | LIVE | FINISHED
  },
  (t) => ({
    kickoffIdx: index('fixtures_kickoff_idx').on(t.kickoff),
  }),
);

export const prizes = pgTable('prizes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  // Share of the total pot (0..100). Actual NZD amount is computed at display
  // time from playerCount × buyIn × pctOfPot.
  pctOfPot: numeric('pct_of_pot', { precision: 5, scale: 2 }).notNull().default('0'),
  // 'GRAND' | 'BOARD' | 'SPECIAL' | 'INSWAP'
  category: text('category').notNull().default('SPECIAL'),
  // links to a leaderboard kind (e.g. 'population', 'sheep', 'overall') if board-based
  boardKey: text('board_key'),
  awardedUserId: integer('awarded_user_id').references(() => users.id),
  awardedAt: timestamp('awarded_at', { withTimezone: true }),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const photos = pgTable(
  'photos',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    filePath: text('file_path').notNull(),
    caption: text('caption'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('photos_user_idx').on(t.userId),
  }),
);

export const photoVotes = pgTable(
  'photo_votes',
  {
    photoId: integer('photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.photoId, t.userId] }),
  }),
);

export const hotOrNotVotes = pgTable(
  'hot_or_not_votes',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    winnerPhotoId: integer('winner_photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
    loserPhotoId: integer('loser_photo_id').notNull().references(() => photos.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userMatchIdx: index('hot_or_not_user_match_idx').on(t.userId, t.winnerPhotoId, t.loserPhotoId),
  }),
);

export const scoreEdits = pgTable(
  'score_edits',
  {
    id: serial('id').primaryKey(),
    fixtureId: integer('fixture_id').notNull().references(() => fixtures.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    homePens: integer('home_pens'),
    awayPens: integer('away_pens'),
    status: text('status').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fixtureIdx: index('score_edits_fixture_idx').on(t.fixtureId, t.createdAt),
  }),
);

export const matchComments = pgTable(
  'match_comments',
  {
    id: serial('id').primaryKey(),
    fixtureId: integer('fixture_id').notNull().references(() => fixtures.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** /uploads/<file> path, if the user attached or pasted an image. */
    imagePath: text('image_path'),
    /** Soft-delete from an admin (or self). Hidden but row preserved for audit. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fixtureIdx: index('match_comments_fixture_idx').on(t.fixtureId, t.createdAt),
  }),
);

export const commentReactions = pgTable(
  'comment_reactions',
  {
    commentId: integer('comment_id').notNull().references(() => matchComments.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Single emoji grapheme. */
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.commentId, t.userId, t.emoji] }),
    commentIdx: index('comment_reactions_comment_idx').on(t.commentId),
  }),
);

export const profileJabs = pgTable(
  'profile_jabs',
  {
    id: serial('id').primaryKey(),
    /** Whose wall the jab is on. */
    targetUserId: integer('target_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Who posted the jab. */
    authorUserId: integer('author_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** Target (or admin) can soft-delete. Hidden but row preserved. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    targetIdx: index('profile_jabs_target_idx').on(t.targetUserId, t.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Fixture = typeof fixtures.$inferSelect;
export type Prize = typeof prizes.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type ScoreEdit = typeof scoreEdits.$inferSelect;
export type MatchComment = typeof matchComments.$inferSelect;
export type ProfileJab = typeof profileJabs.$inferSelect;
export type CommentReaction = typeof commentReactions.$inferSelect;
export type TeamPreference = typeof teamPreferences.$inferSelect;
