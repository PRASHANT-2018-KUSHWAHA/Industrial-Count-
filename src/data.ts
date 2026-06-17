import { InventoryItem, TimelineItem } from './types';

export const initialInventory: InventoryItem[] = [
  {
    sku: 'SKU-8921-MET',
    name: 'Steel Brackets',
    section: 'A-12',
    quantity: 1248,
    unit: 'Units',
    updatedTime: 'Updated 2h ago',
    isLowStock: false,
    isCritical: false,
  },
  {
    sku: 'ALU-5210-PRO',
    name: 'Aluminum Profiles',
    section: 'B-04',
    quantity: 850,
    unit: 'Units',
    updatedTime: 'Updated 5h ago',
    isLowStock: false,
    isCritical: false,
  },
  {
    sku: 'COP-1200-WIR',
    name: 'Copper Wiring',
    section: 'C-22',
    quantity: 12,
    unit: 'Units',
    updatedTime: 'Updated 5h ago',
    isLowStock: true,
    isCritical: true, // Show critical warning outline
  },
  {
    sku: 'CB-5000',
    name: 'Drive Belts 5mm',
    section: 'D-01',
    quantity: 340,
    unit: 'Units',
    updatedTime: 'Updated 1d ago',
    isLowStock: false,
    isCritical: false,
  },
  {
    sku: 'MOT-882-A',
    name: 'Industrial Motor A1',
    section: 'E-14',
    quantity: 82,
    unit: 'Units',
    updatedTime: 'Updated 10m ago',
    isLowStock: false,
    isCritical: false,
  },
  {
    sku: 'CB-3200',
    name: 'Conveyor Belt 5m',
    section: 'B-12',
    quantity: 45,
    unit: 'Units',
    updatedTime: 'Updated 1h ago',
    isLowStock: false,
    isCritical: false,
  },
  {
    sku: 'SEN-X-99',
    name: 'Sensor Array X',
    section: 'A-03',
    quantity: 110,
    unit: 'Units',
    updatedTime: 'Updated 3d ago',
    isLowStock: false,
    isCritical: false,
  },
  {
    sku: 'LUB-100',
    name: 'Lubricant T-100',
    section: 'F-02',
    quantity: 15,
    unit: 'Units',
    updatedTime: 'Updated 4d ago',
    isLowStock: true,
    isCritical: false,
  },
];

export const initialTimeline: TimelineItem[] = [
  {
    id: 'tx-1',
    itemName: 'Industrial Motor A1',
    sku: 'MOT-882-A',
    quantityChange: 12,
    timestamp: '09:41 AM',
    dateGroup: 'Today, Oct 24',
    type: 'RECEIVED',
    operator: 'J. Smith',
    reference: 'Op: J. Smith',
  },
  {
    id: 'tx-2',
    itemName: 'Conveyor Belt 5m',
    sku: 'CB-3200',
    quantityChange: -4,
    timestamp: '08:15 AM',
    dateGroup: 'Today, Oct 24',
    type: 'ISSUED',
    operator: 'Zone B',
    reference: 'Zone B',
  },
  {
    id: 'tx-3',
    itemName: 'Sensor Array X',
    sku: 'SEN-X-99',
    quantityChange: 50,
    timestamp: '04:30 PM',
    dateGroup: 'Yesterday, Oct 23',
    type: 'RECEIVED',
    operator: 'PO-99281',
    reference: 'PO-99281',
  },
  {
    id: 'tx-4',
    itemName: 'Lubricant T-100',
    sku: 'LUB-100',
    quantityChange: -2,
    timestamp: '11:05 AM',
    dateGroup: 'Yesterday, Oct 23',
    type: 'ISSUED',
    operator: 'Maint. Bay 1',
    reference: 'Maint. Bay 1',
  }
];

export interface SkuCountOption {
  sku: string;
  name: string;
  section: string;
  expected: number;
  itemType: string; // What style of dots to draw for canvas simulation
  description: string;
  gridCols?: number;
  gridRows?: number;
  density?: number; // percentage of elements actually present (for variation)
  seed?: number;
  referenceImage?: string;
}

export const skuCountOptions: SkuCountOption[] = [
  {
    sku: 'SKU-8921-MET',
    name: 'Steel Brackets',
    section: 'A14-B',
    expected: 140,
    itemType: 'bracket',
    description: 'Heavy steel brackets stacked in visual matrix grid',
    gridCols: 6,
    gridRows: 6,
    density: 0.9,
    seed: 42
  },
  {
    sku: 'ALU-5210-PRO',
    name: 'Aluminum Profiles',
    section: 'B04-F',
    expected: 24,
    itemType: 'profile',
    description: 'Hexagonal aluminum tubes bunched together',
    gridCols: 5,
    gridRows: 5,
    density: 0.8,
    seed: 11
  },
  {
    sku: 'SEN-X-99',
    name: 'Sensor Array X',
    section: 'A03-Z',
    expected: 15,
    itemType: 'sensor',
    description: 'High-precision optical sensors inside shipping tray',
    gridCols: 4,
    gridRows: 4,
    density: 0.75,
    seed: 88
  },
  {
    sku: 'COP-1200-WIR',
    name: 'Copper Wiring',
    section: 'C22-K',
    expected: 8,
    itemType: 'wire',
    description: 'Concentric spools of heavy copper winding',
    gridCols: 3,
    gridRows: 3,
    density: 0.6,
    seed: 99
  }
];
