CREATE TYPE "public"."entity_type" AS ENUM('character', 'location', 'technology', 'faction', 'item', 'creature', 'event', 'ship_system', 'record', 'other');
--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'done', 'failed');
--> statement-breakpoint
CREATE TABLE "import_sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"filename" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"byte_size" integer NOT NULL,
	"origin" text DEFAULT 'upload' NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"result" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	CONSTRAINT "import_sources_content_hash_unique" UNIQUE("content_hash"),
	CONSTRAINT "import_sources_hash_format" CHECK (content_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "import_sources_size" CHECK (byte_size > 0 AND byte_size <= 2097152),
	CONSTRAINT "import_sources_origin" CHECK (origin IN ('upload', 'cli'))
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "entities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "entity_type" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_id" integer,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (public.xaro_entity_search_vector(name, aliases, summary, body, attributes)) STORED,
	CONSTRAINT "entities_name_valid" CHECK (btrim(name) <> '' AND char_length(name) <= 255),
	CONSTRAINT "entities_slug_format" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 100),
	CONSTRAINT "entities_legacy_pair" CHECK ((legacy_table IS NULL) = (legacy_id IS NULL)),
	CONSTRAINT "entities_legacy_table_format" CHECK (legacy_table IS NULL OR legacy_table ~ '^[a-z_]{1,63}$'),
	CONSTRAINT "entities_attributes_object" CHECK (jsonb_typeof(attributes) = 'object')
);
--> statement-breakpoint
CREATE TABLE "entity_relations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "entity_relations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"from_entity_id" integer NOT NULL,
	"to_entity_id" integer NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"source_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_relations_no_self" CHECK (from_entity_id <> to_entity_id),
	CONSTRAINT "entity_relations_kind_format" CHECK (kind = lower(btrim(kind)) AND kind <> '' AND char_length(kind) <= 60)
);
--> statement-breakpoint
CREATE TABLE "auth_throttle" (
	"bucket" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_source_id_import_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."import_sources"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_from_entity_id_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_to_entity_id_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_source_id_import_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."import_sources"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "import_sources_status_idx" ON "import_sources" USING btree ("status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "entities_slug_uq" ON "entities" USING btree ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "entities_legacy_uq" ON "entities" USING btree ("legacy_table","legacy_id") WHERE legacy_table IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "entities_search_vector_idx" ON "entities" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "entities_name_trgm_idx" ON "entities" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "entities_aliases_trgm_idx" ON "entities" USING gin (public.xaro_array_to_text(aliases) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "entities_type_idx" ON "entities" USING btree ("type");
--> statement-breakpoint
CREATE INDEX "entities_source_id_idx" ON "entities" USING btree ("source_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "entity_relations_edge_uq" ON "entity_relations" USING btree ("from_entity_id","to_entity_id","kind");
--> statement-breakpoint
CREATE INDEX "entity_relations_to_idx" ON "entity_relations" USING btree ("to_entity_id");
