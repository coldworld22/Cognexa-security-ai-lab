import { Pool } from "pg";

export abstract class BaseRepository {
  constructor(protected readonly pool: Pool) {}
}
