import { sqliteTable, text, real, index } from 'drizzle-orm/sqlite-core';

// Reports contain game-world positions, never the player's device/GPS position.
export const bugReports = sqliteTable('bug_reports', {
  id: text('id').primaryKey(), receivedAt: text('received_at').notNull(),
  session: text('session_id').notNull(), build: text('build_id').notNull(),
  area: text('area').notNull(), tile: text('tile').notNull(),
  x: real('world_x').notNull(), y: real('world_y').notNull(), z: real('world_z').notNull(),
  latitude: real('game_latitude').notNull(), longitude: real('game_longitude').notNull(),
  roadId: text('road_id'), road: text('road_name'), signals: text('observations').notNull(),
  context: text('context_json').notNull(), screenshot: text('game_screenshot_jpeg'),
}, t => [index('bug_reports_received').on(t.receivedAt), index('bug_reports_session_received').on(t.session, t.receivedAt)]);
