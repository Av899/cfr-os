/**
 * CFR OS: Commercial Espresso Machine Hardware Adapter
 * Interfaces with La Marzocco KB90 commercial espresso machines.
 * Monitors brew group temperatures, boiler pressures, and daily chemical backflushing.
 */

import type Database from 'better-sqlite3';
import { CfrEquipmentTask } from '../types/menu-adapters';

export interface EspressoMachineTelemetry {
  model: string;
  serial_number: string;
  brew_boiler_temp_c: number;
  steam_boiler_pressure_bar: number;
  water_line_pressure_bar: number;
  group_count: number;
  straight_in_locking: boolean;
  drip_tray_full: boolean;
  chemical_backflush_due: boolean;
}

export class EspressoAdapter {
  private brewBoilerTempC = 93.5;
  private steamBoilerPressureBar = 1.8;
  private waterLinePressureBar = 3.2;

  /**
   * Retrieves telemetry metrics from the primary espresso machine.
   */
  public getTelemetry(db: Database.Database): EspressoMachineTelemetry {
    // Check if daily backflush task was completed today
    const today = new Date().toISOString().split('T')[0];
    const task = db
      .prepare(`
        SELECT is_completed, last_completed_at
        FROM cfr_equipment_tasks
        WHERE id = 'task_kb90_backflush_pm'
      `)
      .get() as { is_completed: number; last_completed_at: string | null } | undefined;

    const backflushDoneToday = Boolean(
      task?.is_completed === 1 && task.last_completed_at?.startsWith(today)
    );

    return {
      model: 'La Marzocco KB90 ABR (3-Group Auto-Brew Ratio)',
      serial_number: 'LM-KB90-2026-0418',
      brew_boiler_temp_c: this.brewBoilerTempC,
      steam_boiler_pressure_bar: this.steamBoilerPressureBar,
      water_line_pressure_bar: this.waterLinePressureBar,
      group_count: 3,
      straight_in_locking: true,
      drip_tray_full: false,
      chemical_backflush_due: !backflushDoneToday,
    };
  }

  /**
   * Fetches pending and completed espresso machine maintenance tasks.
   */
  public getTasks(db: Database.Database): CfrEquipmentTask[] {
    const rows = db
      .prepare("SELECT * FROM cfr_equipment_tasks WHERE equipment_type = 'ESPRESSO_MACHINE' ORDER BY frequency, task_name")
      .all() as any[];

    return rows.map((r) => ({
      ...r,
      is_completed: r.is_completed === 1,
    }));
  }

  /**
   * Marks a grouphead chemical backflush or maintenance task as completed.
   */
  public completeTask(
    db: Database.Database,
    taskId: string,
    completedBy = 'Lead Barista',
  ): CfrEquipmentTask {
    const now = new Date().toISOString();
    const result = db
      .prepare(`
        UPDATE cfr_equipment_tasks
        SET is_completed = 1,
            last_completed_at = ?,
            completed_by = ?
        WHERE id = ?
      `)
      .run(now, completedBy, taskId);

    if (result.changes === 0) {
      throw new Error(`Task "${taskId}" not found.`);
    }

    const row = db.prepare('SELECT * FROM cfr_equipment_tasks WHERE id = ?').get(taskId) as any;
    return {
      ...row,
      is_completed: row.is_completed === 1,
    };
  }
}

export const espressoAdapter = new EspressoAdapter();
