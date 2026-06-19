export interface GasStation {
  id: string;
  name: string;
  brand: 'repsol' | 'cepsa' | 'shell' | 'disa' | 'bp' | 'valero' | 'chevron' | 'generic';
  address: string;
  municipality: string;
  distance: number;
  latitude: number;
  longitude: number;
  prices: Record<string, number>;
  isOpen: boolean;
  hours: string;
  logoUrl?: string;
  bannerUrl?: string;
  provinciaId?: string;
  provinciaNombre?: string;
  clusterCount?: number;
  clusterChildIds?: string[];
}

export type CityId = 'spain' | 'sf';

export interface CityConfig {
  id: CityId;
  name: string;
  country: string;
  currency: string;
  unit: string; // L or gal
  fuelTypes: { id: string; label: string }[];
  defaultFuel: string;
}

export interface UserPreferences {
  city: CityId;
  selectedFuel: string;
  favorites: string[]; // station IDs
  tankCapacity: number;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
