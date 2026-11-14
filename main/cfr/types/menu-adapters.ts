/**
 * CFR OS: Week 6 Types
 * Luxury Digital Guest Menu, Hardware Equipment Adapters & Ambience Controller
 */

export interface CfrMenuSection {
  id: string;
  title: string;
  subtitle: string;
  sort_order: number;
}

export interface CfrMenuItem {
  id: string;
  section_id: string;
  product_id?: string | null;
  name: string;
  tagline?: string | null;
  price_paise: number;
  price_rupees: number;
  description: string;
  tasting_notes: string;
  craft_story: string;
  origin?: string | null;
  dietary_flags: string;
  is_available: boolean;
  sort_order: number;
  calories?: number | null;
}

export type CfrEquipmentType = 'OVEN' | 'ESPRESSO_MACHINE' | 'GRINDER' | 'BREW_BAR';
export type CfrChecklistFrequency = 'DAILY_OPEN' | 'DAILY_CLOSE' | 'WEEKLY' | 'MONTHLY';

export interface CfrEquipmentTask {
  id: string;
  equipment_type: CfrEquipmentType;
  equipment_name: string;
  task_name: string;
  frequency: CfrChecklistFrequency;
  instructions: string;
  is_completed: boolean;
  last_completed_at?: string | null;
  completed_by?: string | null;
}

export type CfrPagerStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'ACKNOWLEDGED';

export interface CfrPagerBuzzEvent {
  id: string;
  order_id?: string | number | null;
  table_number?: string | null;
  server_name?: string | null;
  message: string;
  status: CfrPagerStatus;
  created_at: string;
}

export type CfrAmbienceScene = 'WORKSPACE' | 'GOLDEN_HOUR' | 'EVENING_LOUNGE';

export interface CfrAmbiencePreset {
  scene: CfrAmbienceScene;
  title: string;
  start_time: string; // "08:00"
  end_time: string;   // "16:00"
  color_temp_kelvin: number;
  brightness_percent: number;
  playlist_name: string;
  target_db: number;
  lighting_description: string;
  audio_description: string;
  is_override?: boolean;
}
