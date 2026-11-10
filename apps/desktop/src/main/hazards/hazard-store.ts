import { promises as fsp } from 'fs';
import { join } from 'path';
import { hashPin, isAcceptablePin, verifyPin } from './hazard-pin';
import { isHazard, isHazardsFile, type Hazard, type HazardsFile, type HazardsStatus } from '../../shared/hazard-types';

export type HazardResult = { success: true } | { success: false; error: 'locked' | 'no-pin' | 'bad-pin' | 'weak-pin' | 'invalid' | 'throttled' | 'unreadable' };

const FILE_NAME = 'hazards.json';
const OVERRIDES_NAME = 'hazard-overrides.jsonl';
const FREE_ATTEMPTS = 3;
const MAX_DELAY_MS = 30_000;

const empty = (): HazardsFile => ({ format: 'ardudeck-hazards', version: 1, pin: null, hazards: [], updatedAt: 0 });

/** The hazards on this computer and the admin PIN that guards editing them. The PIN is stored hashed, inside the file. */
export class HazardStore {
  private file: HazardsFile = empty();
  private loaded = false;
  private unlocked = false;
  private failures = 0;
  private blockedUntil = 0;

  constructor(private readonly dir: string, private readonly now: () => number = Date.now) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed: unknown = JSON.parse(await fsp.readFile(join(this.dir, FILE_NAME), 'utf-8'));
      if (isHazardsFile(parsed)) this.file = parsed;
    } catch {
      // no hazards file yet
    }
  }

  private async save(): Promise<void> {
    this.file.updatedAt = this.now();
    await fsp.mkdir(this.dir, { recursive: true });
    const path = join(this.dir, FILE_NAME);
    await fsp.writeFile(`${path}.tmp`, JSON.stringify(this.file, null, 2), 'utf-8');
    await fsp.rename(`${path}.tmp`, path);
  }

  async list(): Promise<Hazard[]> {
    await this.load();
    return this.file.hazards;
  }

  async status(): Promise<HazardsStatus> {
    await this.load();
    return { hasPin: !!this.file.pin, unlocked: this.unlocked };
  }

  /** Sets the first PIN, or changes it while unlocked. */
  async setPin(pin: unknown): Promise<HazardResult> {
    await this.load();
    if (this.file.pin && !this.unlocked) return { success: false, error: 'locked' };
    if (!isAcceptablePin(pin)) return { success: false, error: 'weak-pin' };
    this.file.pin = hashPin(pin);
    this.unlocked = true;
    await this.save();
    return { success: true };
  }

  async unlock(pin: unknown): Promise<HazardResult> {
    await this.load();
    if (!this.file.pin) return { success: false, error: 'no-pin' };
    if (this.now() < this.blockedUntil) return { success: false, error: 'throttled' };
    if (typeof pin === 'string' && verifyPin(pin, this.file.pin)) {
      this.failures = 0;
      this.unlocked = true;
      return { success: true };
    }
    this.failures += 1;
    if (this.failures > FREE_ATTEMPTS) this.blockedUntil = this.now() + Math.min(MAX_DELAY_MS, 1000 * 2 ** (this.failures - FREE_ATTEMPTS));
    return { success: false, error: 'bad-pin' };
  }

  relock(): void {
    this.unlocked = false;
  }

  private gate(): HazardResult | null {
    if (!this.file.pin) return { success: false, error: 'no-pin' };
    return this.unlocked ? null : { success: false, error: 'locked' };
  }

  async add(hazard: unknown): Promise<HazardResult> {
    await this.load();
    const blocked = this.gate();
    if (blocked) return blocked;
    if (!isHazard(hazard)) return { success: false, error: 'invalid' };
    this.file.hazards = [...this.file.hazards.filter((h) => h.id !== hazard.id), hazard];
    await this.save();
    return { success: true };
  }

  async remove(id: string): Promise<HazardResult> {
    await this.load();
    const blocked = this.gate();
    if (blocked) return blocked;
    this.file.hazards = this.file.hazards.filter((h) => h.id !== id);
    await this.save();
    return { success: true };
  }

  async exportTo(filePath: string): Promise<HazardResult> {
    await this.load();
    await fsp.writeFile(filePath, JSON.stringify(this.file, null, 2), 'utf-8');
    return { success: true };
  }

  /** Replaces this computer's hazards and PIN with the file's. A computer that has a PIN needs it entered first. */
  async importFrom(filePath: string): Promise<HazardResult> {
    await this.load();
    if (this.file.pin && !this.unlocked) return { success: false, error: 'locked' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fsp.readFile(filePath, 'utf-8'));
    } catch {
      return { success: false, error: 'unreadable' };
    }
    if (!isHazardsFile(parsed)) return { success: false, error: 'invalid' };
    this.file = parsed;
    this.unlocked = false;
    await this.save();
    return { success: true };
  }

  /** An unlocked admin letting one upload cross a hazard; kept as a line in the overrides log. */
  async logOverride(entry: { hazardIds: string[]; mission: string }): Promise<HazardResult> {
    await this.load();
    const blocked = this.gate();
    if (blocked) return blocked;
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.appendFile(join(this.dir, OVERRIDES_NAME), `${JSON.stringify({ at: this.now(), ...entry })}\n`, 'utf-8');
    return { success: true };
  }
}

