CREATE TABLE IF NOT EXISTS accounts (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE IF NOT EXISTS memberships (user_id uuid NOT NULL, account_id uuid REFERENCES accounts(id) ON DELETE CASCADE, role text NOT NULL CHECK(role IN ('owner','reviewer')), PRIMARY KEY(user_id,account_id));
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS clients (id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, legal_name text NOT NULL, context jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,account_id));
CREATE TABLE IF NOT EXISTS opportunities (id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, client_id uuid, title text NOT NULL, buyer text NOT NULL, notice_id text NOT NULL, cutoff date NOT NULL, metadata jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,account_id), FOREIGN KEY(client_id,account_id) REFERENCES clients(id,account_id));
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE TABLE IF NOT EXISTS sources (id uuid PRIMARY KEY, account_id uuid NOT NULL, opportunity_id uuid NOT NULL, name text NOT NULL, media_type text NOT NULL, origin text, published_at date, purpose text NOT NULL CHECK(purpose IN ('notice','context','awards','rfp','addendum')), required boolean NOT NULL, hash text NOT NULL, object_ref text NOT NULL, reader text NOT NULL, state text NOT NULL CHECK(state IN ('read','partial','unread')), coverage jsonb NOT NULL, extraction_ref text, provenance text NOT NULL CHECK(provenance IN ('public','synthetic','authenticated')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,account_id), FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id) ON DELETE CASCADE);
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_provenance_check;
ALTER TABLE sources ADD CONSTRAINT sources_provenance_check CHECK(provenance IN ('public','synthetic','authenticated'));
CREATE TABLE IF NOT EXISTS units (id uuid PRIMARY KEY, account_id uuid NOT NULL, source_id uuid NOT NULL, ordinal integer NOT NULL, location text NOT NULL, text_content text NOT NULL, search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english',text_content)) STORED, FOREIGN KEY(source_id,account_id) REFERENCES sources(id,account_id) ON DELETE CASCADE, UNIQUE(source_id,ordinal));
CREATE INDEX IF NOT EXISTS units_search ON units USING gin(search_vector);
CREATE TABLE IF NOT EXISTS runs (id uuid PRIMARY KEY, account_id uuid NOT NULL, opportunity_id uuid NOT NULL, input_hash text NOT NULL, manifest jsonb NOT NULL, state text NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled','budget-blocked')), stage text NOT NULL DEFAULT 'admit', error text, parent_report_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,account_id), FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS active_run ON runs(account_id,opportunity_id,input_hash) WHERE state IN ('queued','running');
CREATE TABLE IF NOT EXISTS dispatch (run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE, lease_owner uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS stages (id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE, name text NOT NULL, input_hash text NOT NULL, version text NOT NULL, state text NOT NULL CHECK(state IN ('running','succeeded','failed','uncertain')), output_ref text, error text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, UNIQUE(run_id,name));
CREATE INDEX IF NOT EXISTS stage_cache ON stages(account_id,name,input_hash,version) WHERE state='succeeded';
CREATE TABLE IF NOT EXISTS intelligence (id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, opportunity_id uuid NOT NULL, run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE, cutoff date NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,account_id), FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS reports (id uuid PRIMARY KEY, account_id uuid NOT NULL, opportunity_id uuid NOT NULL, run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE, intelligence_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('pursuit','watchlist','competitor','weekly')), parent_report_id uuid, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,account_id), UNIQUE(run_id,kind), FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id) ON DELETE CASCADE, FOREIGN KEY(intelligence_id,account_id) REFERENCES intelligence(id,account_id));
CREATE OR REPLACE FUNCTION prevent_report_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Reports are immutable; create a new version'; END $$;
DROP TRIGGER IF EXISTS reports_immutable ON reports;
CREATE TRIGGER reports_immutable BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION prevent_report_update();
CREATE TABLE IF NOT EXISTS budgets (id text PRIMARY KEY, allowance numeric NOT NULL CHECK(allowance>=0), reserved numeric NOT NULL DEFAULT 0 CHECK(reserved>=0), spent numeric NOT NULL DEFAULT 0 CHECK(spent>=0), CHECK(reserved+spent<=allowance));
INSERT INTO budgets(id,allowance) VALUES ('goal-firecrawl',50) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS provider_calls (id uuid PRIMARY KEY, account_id uuid REFERENCES accounts(id) ON DELETE CASCADE, run_id uuid REFERENCES runs(id) ON DELETE CASCADE, logical_key text NOT NULL UNIQUE, provider text NOT NULL, status text NOT NULL CHECK(status IN ('reserved','succeeded','failed','uncertain')), budget_id text REFERENCES budgets(id), reserved numeric NOT NULL DEFAULT 0, settled numeric, usage jsonb, receipt_ref text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz);
CREATE TABLE IF NOT EXISTS searches (id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, opportunity_id uuid NOT NULL, query text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS reviews (id uuid PRIMARY KEY, account_id uuid NOT NULL, report_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('pending','approved','changes-requested')), reasons jsonb NOT NULL, reviewer text NOT NULL DEFAULT 'Bobby', created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(report_id,account_id) REFERENCES reports(id,account_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS feedback (id uuid PRIMARY KEY, account_id uuid NOT NULL, report_id uuid NOT NULL, target text NOT NULL, disposition text NOT NULL, reason text NOT NULL, before_text text, after_text text, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(report_id,account_id) REFERENCES reports(id,account_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS decisions (id uuid PRIMARY KEY, account_id uuid NOT NULL, report_id uuid NOT NULL, choice text NOT NULL, reason text NOT NULL, outcome jsonb, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(report_id,account_id) REFERENCES reports(id,account_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS schedules (id uuid PRIMARY KEY, account_id uuid NOT NULL, opportunity_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('watchlist','weekly','competitor')), next_at timestamptz NOT NULL, interval_hours integer NOT NULL CHECK(interval_hours>=1), enabled boolean NOT NULL DEFAULT true, FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS deliveries (id uuid PRIMARY KEY, account_id uuid NOT NULL, report_id uuid NOT NULL, idempotency_key text NOT NULL UNIQUE, channel text NOT NULL CHECK(channel='local'), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(report_id,account_id) REFERENCES reports(id,account_id) ON DELETE CASCADE);
ALTER TABLE stages ADD COLUMN IF NOT EXISTS lease_owner uuid;
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_purpose_check;
ALTER TABLE sources ADD CONSTRAINT sources_purpose_check CHECK(purpose IN ('notice','context','awards','rfp','addendum','client'));
CREATE UNIQUE INDEX IF NOT EXISTS one_review_per_report ON reviews(report_id);
CREATE TABLE IF NOT EXISTS review_events(id uuid PRIMARY KEY,account_id uuid NOT NULL,report_id uuid NOT NULL,actor_id uuid NOT NULL,state text NOT NULL CHECK(state IN ('approved','changes-requested')),reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(report_id,account_id) REFERENCES reports(id,account_id) ON DELETE CASCADE);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS research_query text;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS last_result jsonb;
CREATE TABLE IF NOT EXISTS schedule_ticks(id uuid PRIMARY KEY,schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,due_at timestamptz NOT NULL,state text NOT NULL CHECK(state IN ('running','succeeded','failed')),result jsonb,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,UNIQUE(schedule_id,due_at));
CREATE TABLE IF NOT EXISTS review_samples(id uuid PRIMARY KEY,account_id uuid NOT NULL,report_id uuid NOT NULL,week_start date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(account_id,week_start),FOREIGN KEY(report_id,account_id) REFERENCES reports(id,account_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS outcomes(id uuid PRIMARY KEY,account_id uuid NOT NULL,report_id uuid NOT NULL,event text NOT NULL,outcome text NOT NULL,observed_at date NOT NULL,unit_id uuid NOT NULL REFERENCES units(id),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(report_id,account_id) REFERENCES reports(id,account_id) ON DELETE CASCADE);
CREATE UNIQUE INDEX IF NOT EXISTS active_schedule ON schedules(account_id,opportunity_id,kind) WHERE enabled;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS started_at timestamptz;
CREATE OR REPLACE FUNCTION prevent_snapshot_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Evidence and intelligence snapshots are immutable; create a new version'; END $$;
DROP TRIGGER IF EXISTS sources_immutable ON sources;
CREATE TRIGGER sources_immutable BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();
DROP TRIGGER IF EXISTS units_immutable ON units;
CREATE TRIGGER units_immutable BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();
DROP TRIGGER IF EXISTS intelligence_immutable ON intelligence;
CREATE TRIGGER intelligence_immutable BEFORE UPDATE ON intelligence FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();
CREATE TABLE IF NOT EXISTS collections(id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,client_id uuid,kind text NOT NULL CHECK(kind IN ('watchlist','weekly')),period_start date NOT NULL,input_hash text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,account_id),UNIQUE(account_id,kind,input_hash),FOREIGN KEY(client_id,account_id) REFERENCES clients(id,account_id));
CREATE TABLE IF NOT EXISTS collection_items(collection_id uuid NOT NULL,account_id uuid NOT NULL,report_id uuid NOT NULL,PRIMARY KEY(collection_id,report_id),FOREIGN KEY(collection_id,account_id) REFERENCES collections(id,account_id) ON DELETE CASCADE,FOREIGN KEY(report_id,account_id) REFERENCES reports(id,account_id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS collection_deliveries(id uuid PRIMARY KEY,account_id uuid NOT NULL,collection_id uuid NOT NULL,channel text NOT NULL CHECK(channel='local'),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(collection_id),FOREIGN KEY(collection_id,account_id) REFERENCES collections(id,account_id) ON DELETE CASCADE);
DROP TRIGGER IF EXISTS collections_immutable ON collections;
CREATE TRIGGER collections_immutable BEFORE UPDATE ON collections FOR EACH ROW EXECUTE FUNCTION prevent_report_update();

-- Lifecycle is mutable; original evidence and metadata snapshots remain immutable.
CREATE TABLE IF NOT EXISTS source_lifecycle (
 source_id uuid PRIMARY KEY, account_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('active','archived','superseded')),
 previous_id uuid, successor_id uuid, reason text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(source_id,account_id) REFERENCES sources(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(previous_id,account_id) REFERENCES sources(id,account_id),
 FOREIGN KEY(successor_id,account_id) REFERENCES sources(id,account_id)
);
CREATE TABLE IF NOT EXISTS source_events (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, source_id uuid NOT NULL,
 action text NOT NULL, actor_id uuid NOT NULL, detail jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(source_id,account_id) REFERENCES sources(id,account_id) ON DELETE CASCADE
);
ALTER TABLE units ADD COLUMN IF NOT EXISTS geometry jsonb;
CREATE OR REPLACE VIEW active_sources AS SELECT s.* FROM sources s
 LEFT JOIN source_lifecycle l ON l.source_id=s.id AND l.account_id=s.account_id
 WHERE coalesce(l.status,'active')='active';
-- Account purge deletes both ends of version links in the same transaction.
ALTER TABLE source_lifecycle ALTER CONSTRAINT source_lifecycle_previous_id_account_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE source_lifecycle ALTER CONSTRAINT source_lifecycle_successor_id_account_id_fkey DEFERRABLE INITIALLY DEFERRED;

-- GETS acquisition is separately permission-gated. These rows also support
-- deterministic replay without representing a fixture as a live import.
CREATE TABLE IF NOT EXISTS gets_intake_runs (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL, scope text NOT NULL CHECK(scope IN ('current','future','single')),
 requested_rfx_id text, requested_url text, state text NOT NULL CHECK(state IN ('queued','running','complete','partial','blocked','cancelled')),
 mode text NOT NULL CHECK(mode IN ('live','fixture')),
 cursor text, listings_done boolean NOT NULL DEFAULT false,
 pages_attempted integer NOT NULL DEFAULT 0, pages_read integer NOT NULL DEFAULT 0,
 rows_observed integer NOT NULL DEFAULT 0, unique_discovered integer NOT NULL DEFAULT 0,
 duplicate_sightings integer NOT NULL DEFAULT 0, details_read integer NOT NULL DEFAULT 0,
 details_failed integer NOT NULL DEFAULT 0, new_count integer NOT NULL DEFAULT 0,
 changed_count integer NOT NULL DEFAULT 0, unchanged_count integer NOT NULL DEFAULT 0,
 attempts integer NOT NULL DEFAULT 0,
 advertised_total integer, error text, lease_owner uuid, lease_until timestamptz,
 started_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, UNIQUE(id,account_id),
 CHECK(pages_read<=pages_attempted), CHECK(details_read+details_failed<=unique_discovered)
);
CREATE UNIQUE INDEX IF NOT EXISTS gets_active_scope ON gets_intake_runs(account_id,scope,coalesce(requested_rfx_id,'')) WHERE state IN ('queued','running');
CREATE TABLE IF NOT EXISTS gets_intake_items (
 run_id uuid NOT NULL, account_id uuid NOT NULL, rfx_id text NOT NULL,
 detail_url text NOT NULL, sightings jsonb NOT NULL DEFAULT '[]'::jsonb,
 state text NOT NULL CHECK(state IN ('pending','read','failed')) DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0, error text, revision_id uuid,
 PRIMARY KEY(run_id,rfx_id),
 FOREIGN KEY(run_id,account_id) REFERENCES gets_intake_runs(id,account_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS gets_intake_pages (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, run_id uuid NOT NULL,
 url text NOT NULL, page_number integer NOT NULL, raw_hash text NOT NULL,
 raw_ref text NOT NULL, rows_observed integer NOT NULL,
 retrieved_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id,page_number),
 FOREIGN KEY(run_id,account_id) REFERENCES gets_intake_runs(id,account_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS gets_notices (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 rfx_id text NOT NULL, opportunity_id uuid,
 current_revision_id uuid, first_seen_at timestamptz NOT NULL DEFAULT now(),
 last_checked_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,rfx_id), UNIQUE(id,account_id),
 FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id)
);
CREATE TABLE IF NOT EXISTS gets_notice_revisions (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, notice_id uuid NOT NULL,
 semantic_hash text NOT NULL, raw_hash text NOT NULL, raw_ref text NOT NULL,
 source_id uuid NOT NULL, fields jsonb NOT NULL, parser_version text NOT NULL,
 retrieved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(notice_id,semantic_hash), UNIQUE(id,account_id),
 FOREIGN KEY(notice_id,account_id) REFERENCES gets_notices(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,account_id) REFERENCES sources(id,account_id)
);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gets_current_revision_fk' AND conrelid='gets_notices'::regclass) THEN
  ALTER TABLE gets_notices ADD CONSTRAINT gets_current_revision_fk FOREIGN KEY(current_revision_id,account_id) REFERENCES gets_notice_revisions(id,account_id) DEFERRABLE INITIALLY DEFERRED;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gets_item_revision_fk' AND conrelid='gets_intake_items'::regclass) THEN
  ALTER TABLE gets_intake_items ADD CONSTRAINT gets_item_revision_fk FOREIGN KEY(revision_id,account_id) REFERENCES gets_notice_revisions(id,account_id);
 END IF;
END $$;
DROP TRIGGER IF EXISTS gets_revisions_immutable ON gets_notice_revisions;
CREATE TRIGGER gets_revisions_immutable BEFORE UPDATE ON gets_notice_revisions FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();

-- A declared tender pack is a frozen inventory. Receipts point at immutable
-- source versions; failed transfers remain inspectable without claiming coverage.
CREATE TABLE IF NOT EXISTS tender_packs (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, opportunity_id uuid NOT NULL,
 rfx_id text NOT NULL, notice_revision_id uuid NOT NULL, manifest jsonb NOT NULL,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,account_id),
 FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(notice_revision_id,account_id) REFERENCES gets_notice_revisions(id,account_id)
);
CREATE TABLE IF NOT EXISTS tender_pack_files (
 pack_id uuid NOT NULL, account_id uuid NOT NULL, file_id text NOT NULL,
 source_id uuid NOT NULL, actual_bytes bigint NOT NULL, actual_sha256 text NOT NULL,
 admitted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(pack_id,file_id),
 FOREIGN KEY(pack_id,account_id) REFERENCES tender_packs(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,account_id) REFERENCES sources(id,account_id) ON DELETE CASCADE
);
ALTER TABLE tender_pack_files DROP CONSTRAINT IF EXISTS tender_pack_files_source_id_account_id_fkey;
ALTER TABLE tender_pack_files ADD CONSTRAINT tender_pack_files_source_id_account_id_fkey FOREIGN KEY(source_id,account_id) REFERENCES sources(id,account_id) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS tender_pack_attempts (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, pack_id uuid NOT NULL,
 file_id text NOT NULL, outcome text NOT NULL CHECK(outcome IN ('rejected','admitted')),
 actual_bytes bigint, actual_sha256 text, detail text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(pack_id,account_id) REFERENCES tender_packs(id,account_id) ON DELETE CASCADE
);
-- Authenticated collection is driven only by a manual public GETS check.
-- A revision is queued once; the pack and each admitted file survive worker restarts.
CREATE TABLE IF NOT EXISTS gets_pack_jobs (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, intake_run_id uuid NOT NULL,
 notice_revision_id uuid NOT NULL, opportunity_id uuid NOT NULL, actor_id uuid NOT NULL,
 rfx_id text NOT NULL, state text NOT NULL DEFAULT 'discovered'
   CHECK(state IN ('discovered','access_needed','downloading','downloaded','admitted','unchanged','failed','blocked','cancelled')),
 pack_id uuid, inventory jsonb, error text, attempts integer NOT NULL DEFAULT 0,
 login_retries integer NOT NULL DEFAULT 0, lease_owner uuid, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, UNIQUE(account_id,notice_revision_id),
 FOREIGN KEY(intake_run_id,account_id) REFERENCES gets_intake_runs(id,account_id),
 FOREIGN KEY(notice_revision_id,account_id) REFERENCES gets_notice_revisions(id,account_id),
 FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id),
 FOREIGN KEY(pack_id,account_id) REFERENCES tender_packs(id,account_id)
);
CREATE INDEX IF NOT EXISTS gets_pack_jobs_pending ON gets_pack_jobs(created_at)
 WHERE state IN ('discovered','access_needed','downloading','downloaded');
DROP TRIGGER IF EXISTS tender_packs_immutable ON tender_packs;
CREATE TRIGGER tender_packs_immutable BEFORE UPDATE ON tender_packs FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();
DROP TRIGGER IF EXISTS tender_pack_files_immutable ON tender_pack_files;
CREATE TRIGGER tender_pack_files_immutable BEFORE UPDATE ON tender_pack_files FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();
CREATE TABLE IF NOT EXISTS tender_pack_reviews (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, pack_id uuid NOT NULL,
 file_id text NOT NULL, source_id uuid NOT NULL, actor_id uuid NOT NULL,
 note text NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(pack_id,file_id),
 FOREIGN KEY(pack_id,file_id) REFERENCES tender_pack_files(pack_id,file_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,account_id) REFERENCES sources(id,account_id) ON DELETE CASCADE
);
DROP TRIGGER IF EXISTS tender_pack_reviews_immutable ON tender_pack_reviews;
CREATE TRIGGER tender_pack_reviews_immutable BEFORE UPDATE ON tender_pack_reviews FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();
CREATE TABLE IF NOT EXISTS opportunity_firm_links (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, opportunity_id uuid NOT NULL,
 client_id uuid NOT NULL, actor_id uuid NOT NULL, effective_date date NOT NULL,
 source text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(client_id,account_id) REFERENCES clients(id,account_id) ON DELETE CASCADE
);
DROP TRIGGER IF EXISTS opportunity_firm_links_immutable ON opportunity_firm_links;
CREATE TRIGGER opportunity_firm_links_immutable BEFORE UPDATE ON opportunity_firm_links FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();

CREATE TABLE IF NOT EXISTS gets_mapping_versions (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, notice_id uuid NOT NULL,
 revision_id uuid NOT NULL, version integer NOT NULL CHECK(version>=1),
 trace jsonb NOT NULL, projection jsonb NOT NULL, flags jsonb NOT NULL,
 review_state text NOT NULL CHECK(review_state IN ('pending','reviewed')),
 actor_id uuid, reason text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(revision_id,version), UNIQUE(id,account_id),
 FOREIGN KEY(notice_id,account_id) REFERENCES gets_notices(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(revision_id,account_id) REFERENCES gets_notice_revisions(id,account_id) ON DELETE CASCADE
);
DROP TRIGGER IF EXISTS gets_mapping_versions_immutable ON gets_mapping_versions;
CREATE TRIGGER gets_mapping_versions_immutable BEFORE UPDATE ON gets_mapping_versions FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();

CREATE TABLE IF NOT EXISTS sector_taxonomy (
 account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 version integer NOT NULL DEFAULT 1 CHECK(version>=1), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS groundwork_sectors (
 id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 name text NOT NULL, keywords text[] NOT NULL DEFAULT '{}', status text NOT NULL CHECK(status IN ('active','archived')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,account_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_sector_name ON groundwork_sectors(account_id,lower(name)) WHERE status='active';
CREATE TABLE IF NOT EXISTS opportunity_sectors (
 account_id uuid NOT NULL, opportunity_id uuid NOT NULL, sector_id uuid,
 method text NOT NULL CHECK(method IN ('rule','person','unknown')),
 classifier_version text NOT NULL, taxonomy_version integer NOT NULL,
 notice_revision_id uuid, reason text NOT NULL, evidence_pointer text,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id,opportunity_id),
 FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(sector_id,account_id) REFERENCES groundwork_sectors(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(notice_revision_id,account_id) REFERENCES gets_notice_revisions(id,account_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS opportunity_sector_events (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, opportunity_id uuid NOT NULL,
 sector_id uuid, method text NOT NULL, classifier_version text NOT NULL,
 taxonomy_version integer NOT NULL, notice_revision_id uuid,
 reason text NOT NULL, evidence_pointer text, actor_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(opportunity_id,account_id) REFERENCES opportunities(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(sector_id,account_id) REFERENCES groundwork_sectors(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(notice_revision_id,account_id) REFERENCES gets_notice_revisions(id,account_id) ON DELETE CASCADE
);
DROP TRIGGER IF EXISTS opportunity_sector_events_immutable ON opportunity_sector_events;
CREATE TRIGGER opportunity_sector_events_immutable BEFORE UPDATE ON opportunity_sector_events FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();

-- Notice briefs are separate, immutable public-notice outputs. Full pursuits
-- retain their own explicit source manifests and report versions.
ALTER TABLE gets_intake_runs ADD COLUMN IF NOT EXISTS brief_attempts integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS gets_notice_briefs (
 id uuid PRIMARY KEY, account_id uuid NOT NULL, revision_id uuid NOT NULL,
 source_id uuid NOT NULL, method_key text NOT NULL, payload jsonb NOT NULL,
 provenance text NOT NULL CHECK(provenance IN ('live','fixture')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,revision_id,method_key),
 UNIQUE(id,account_id),
 FOREIGN KEY(revision_id,account_id) REFERENCES gets_notice_revisions(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(source_id,account_id) REFERENCES sources(id,account_id) ON DELETE CASCADE
);
DROP TRIGGER IF EXISTS gets_notice_briefs_immutable ON gets_notice_briefs;
CREATE TRIGGER gets_notice_briefs_immutable BEFORE UPDATE ON gets_notice_briefs FOR EACH ROW EXECUTE FUNCTION prevent_snapshot_update();
CREATE TABLE IF NOT EXISTS gets_brief_items (
 run_id uuid NOT NULL, account_id uuid NOT NULL, rfx_id text NOT NULL,
 revision_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('pending','complete','failed')),
 brief_id uuid, attempts integer NOT NULL DEFAULT 0, error text,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(run_id,rfx_id),
 FOREIGN KEY(run_id,account_id) REFERENCES gets_intake_runs(id,account_id) ON DELETE CASCADE,
 FOREIGN KEY(revision_id,account_id) REFERENCES gets_notice_revisions(id,account_id),
 FOREIGN KEY(brief_id,account_id) REFERENCES gets_notice_briefs(id,account_id)
);
