export interface User {
  email: string;
  name: string;
  role: string;
  plantId: string;
}

export type TransactionType = 'RECEIVED' | 'ISSUED';

export interface TimelineItem {
  id: string;
  itemName: string;
  sku: string;
  quantityChange: number; // e.g. +12 or -4
  timestamp: string; // ISO format or formatted e.g. "09:41 AM"
  dateGroup: string; // e.g. "Today, Oct 24" or "Yesterday, Oct 23"
  type: TransactionType;
  operator: string;
  reference: string; // e.g. "Op: J. Smith" or "Zone B" or "PO-99281"
}

export interface InventoryItem {
  sku: string;
  name: string;
  section: string;
  quantity: number;
  unit: string;
  updatedTime: string;
  isLowStock: boolean;
  isCritical: boolean;
  stagnantDays?: number; // for listing unstagnant items
}

export interface Marker {
  x: number; // percentage width (0 - 100)
  y: number; // percentage height (0 - 100)
}

export interface AIResponse {
  count: number;
  markers: Marker[];
  message?: string;
  error?: string;
}
