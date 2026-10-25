-- A push may run longer than the 8 seconds Supabase gives a request of a signed-in user (the role «authenticated»).
-- The app sends a large user action in parts of at most 500 records (PUSH_CHUNK in src/sync/engine.ts); this gives
-- each part room on a slow free project. PostgREST applies a function's own statement_timeout to the call.
-- Run once in the SQL editor, after 003_owner_and_channel.sql.
alter function push_records(uuid, uuid, jsonb) set statement_timeout = '60s';
