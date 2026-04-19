import fs from "node:fs/promises";
import path from "node:path";

interface MySQLiteEnvelope<T> {
  rows: T[];
}

export interface MySQLiteRow {
  id: string;
}

export class MySQLiteTable<T extends MySQLiteRow> {
  constructor(private readonly filePath: string) {}

  private async ensureFile(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(
        this.filePath,
        JSON.stringify({ rows: [] } satisfies MySQLiteEnvelope<T>, null, 2),
        "utf-8",
      );
    }
  }

  private async readRows(): Promise<T[]> {
    await this.ensureFile();
    const content = await fs.readFile(this.filePath, "utf-8");
    const parsed = JSON.parse(content) as Partial<MySQLiteEnvelope<T>>;
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  }

  private async writeRows(rows: T[]): Promise<void> {
    await this.ensureFile();
    await fs.writeFile(
      this.filePath,
      JSON.stringify({ rows }, null, 2),
      "utf-8",
    );
  }

  async list(predicate?: (row: T) => boolean): Promise<T[]> {
    const rows = await this.readRows();
    return predicate ? rows.filter(predicate) : rows;
  }

  async get(id: string): Promise<T | null> {
    const rows = await this.readRows();
    return rows.find((row) => row.id === id) ?? null;
  }

  async upsert(row: T): Promise<T> {
    const rows = await this.readRows();
    const index = rows.findIndex((entry) => entry.id === row.id);
    if (index >= 0) {
      rows[index] = row;
    } else {
      rows.push(row);
    }
    await this.writeRows(rows);
    return row;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.readRows();
    const nextRows = rows.filter((row) => row.id !== id);
    if (nextRows.length === rows.length) {
      return false;
    }
    await this.writeRows(nextRows);
    return true;
  }
}
