import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type {
  DreamFeedback,
  DreamGenerationSettings,
  DreamOutput,
  DreamRepository,
  DreamSeed,
  DreamStyleMemory
} from "./dream-types.ts";
import {
  DEFAULT_GENERATION_SETTINGS,
  DEFAULT_STYLE_MEMORY
} from "./dream-types.ts";
import {
  normalizeSettings,
  normalizeStyleMemory,
  recordFromParts,
  sortDreamRecords
} from "./dream-store.ts";

type SeedRow = {
  id: string;
  seed_json: string;
};

type OutputRow = {
  id: string;
  output_json: string;
};

type FeedbackRow = {
  id: string;
  feedback_json: string;
};

type SettingRow = {
  key: string;
  value_json: string;
};

function dbPath() {
  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  return process.env.DREAM_SQLITE_PATH ?? path.join(dataDir, "state-tides-dreams.sqlite");
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function createDatabase() {
  const db = new Database(dbPath());
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS dream_seeds (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      cycle_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      seed_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dream_outputs (
      id TEXT PRIMARY KEY,
      seed_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL,
      output_json TEXT NOT NULL,
      FOREIGN KEY(seed_id) REFERENCES dream_seeds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dream_feedback (
      id TEXT PRIMARY KEY,
      seed_id TEXT NOT NULL,
      output_id TEXT,
      created_at TEXT NOT NULL,
      feedback_json TEXT NOT NULL,
      FOREIGN KEY(seed_id) REFERENCES dream_seeds(id) ON DELETE CASCADE,
      FOREIGN KEY(output_id) REFERENCES dream_outputs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS dream_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dream_outputs_seed_id ON dream_outputs(seed_id);
    CREATE INDEX IF NOT EXISTS idx_dream_feedback_seed_id ON dream_feedback(seed_id);
    CREATE INDEX IF NOT EXISTS idx_dream_seeds_created_at ON dream_seeds(created_at);
  `);

  return db;
}

export function createSqliteDreamRepository(): DreamRepository {
  const db = createDatabase();

  function saveSeed(seed: DreamSeed) {
    db.prepare(
      `INSERT INTO dream_seeds (
        id, title, cycle_type, start_date, end_date, created_at, updated_at, seed_json
      ) VALUES (
        @id, @title, @cycleType, @startDate, @endDate, @createdAt, @updatedAt, @seedJson
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        cycle_type = excluded.cycle_type,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        updated_at = excluded.updated_at,
        seed_json = excluded.seed_json`
    ).run({
      id: seed.id,
      title: seed.title,
      cycleType: seed.cycle.type,
      startDate: seed.cycle.startDate,
      endDate: seed.cycle.endDate,
      createdAt: seed.createdAt,
      updatedAt: seed.updatedAt,
      seedJson: JSON.stringify(seed)
    });
  }

  function saveOutput(output: DreamOutput) {
    db.prepare(
      `INSERT INTO dream_outputs (id, seed_id, mode, created_at, output_json)
      VALUES (@id, @seedId, @mode, @createdAt, @outputJson)
      ON CONFLICT(id) DO UPDATE SET
        mode = excluded.mode,
        created_at = excluded.created_at,
        output_json = excluded.output_json`
    ).run({
      id: output.id,
      seedId: output.seedId,
      mode: output.mode,
      createdAt: output.createdAt,
      outputJson: JSON.stringify(output)
    });
  }

  function listOutputs(seedId: string) {
    const rows = db
      .prepare("SELECT id, output_json FROM dream_outputs WHERE seed_id = ? ORDER BY created_at DESC")
      .all(seedId) as OutputRow[];

    return rows.map((row) => parseJson<DreamOutput>(row.output_json, null as never)).filter(Boolean);
  }

  function listFeedback(seedId: string) {
    const rows = db
      .prepare("SELECT id, feedback_json FROM dream_feedback WHERE seed_id = ? ORDER BY created_at DESC")
      .all(seedId) as FeedbackRow[];

    return rows.map((row) => parseJson<DreamFeedback>(row.feedback_json, null as never)).filter(Boolean);
  }

  function getSetting<T>(key: string, fallback: T): T {
    const row = db.prepare("SELECT key, value_json FROM dream_settings WHERE key = ?").get(key) as
      | SettingRow
      | undefined;

    return row ? parseJson<T>(row.value_json, fallback) : fallback;
  }

  function setSetting(key: string, value: unknown) {
    db.prepare(
      `INSERT INTO dream_settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(value), new Date().toISOString());
  }

  return {
    async listDreams() {
      const rows = db
        .prepare("SELECT id, seed_json FROM dream_seeds ORDER BY created_at DESC")
        .all() as SeedRow[];

      const records = rows.map((row) => {
        const seed = parseJson<DreamSeed>(row.seed_json, null as never);
        return recordFromParts(seed, listOutputs(seed.id), listFeedback(seed.id));
      });

      return sortDreamRecords(records);
    },

    async getDream(seedId: string) {
      const row = db.prepare("SELECT id, seed_json FROM dream_seeds WHERE id = ?").get(seedId) as
        | SeedRow
        | undefined;

      if (!row) {
        return null;
      }

      const seed = parseJson<DreamSeed>(row.seed_json, null as never);
      return recordFromParts(seed, listOutputs(seed.id), listFeedback(seed.id));
    },

    async saveDream(seed: DreamSeed, output: DreamOutput) {
      const transaction = db.transaction(() => {
        saveSeed(seed);
        saveOutput(output);
      });
      transaction();

      return recordFromParts(seed, [output], []);
    },

    async addOutput(output: DreamOutput) {
      saveOutput(output);
      return output;
    },

    async deleteDream(seedId: string) {
      db.prepare("DELETE FROM dream_seeds WHERE id = ?").run(seedId);
    },

    async addFeedback(feedback: DreamFeedback) {
      db.prepare(
        `INSERT INTO dream_feedback (id, seed_id, output_id, created_at, feedback_json)
        VALUES (@id, @seedId, @outputId, @createdAt, @feedbackJson)`
      ).run({
        id: feedback.id,
        seedId: feedback.seedId,
        outputId: feedback.outputId,
        createdAt: feedback.createdAt,
        feedbackJson: JSON.stringify(feedback)
      });
      return feedback;
    },

    async getStyleMemory() {
      return normalizeStyleMemory(getSetting("style_memory", DEFAULT_STYLE_MEMORY));
    },

    async saveStyleMemory(memory: DreamStyleMemory) {
      const normalized = normalizeStyleMemory(memory);
      setSetting("style_memory", normalized);
      return normalized;
    },

    async getGenerationSettings() {
      return normalizeSettings(getSetting("generation_settings", DEFAULT_GENERATION_SETTINGS));
    },

    async saveGenerationSettings(settings: DreamGenerationSettings) {
      const normalized = normalizeSettings(settings);
      setSetting("generation_settings", normalized);
      return normalized;
    }
  };
}
