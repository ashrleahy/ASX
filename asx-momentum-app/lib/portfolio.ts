export type HoldingConfig = {
  ticker: string;
  quantity: number;
  type: 'asx-stock' | 'asx-etf' | 'crypto';
  label: string;
  inUniverse: boolean;
};

export const HOLDINGS: HoldingConfig[] = [
  { ticker: 'CSL.AX',    quantity: 10,         type: 'asx-stock', label: 'CSL',     inUniverse: true  },
  { ticker: 'DHHF.AX',   quantity: 24,         type: 'asx-etf',   label: 'DHHF',    inUniverse: false },
  { ticker: 'VDHG.AX',   quantity: 33,         type: 'asx-etf',   label: 'VDHG',    inUniverse: false },
  { ticker: 'BTC-AUD', quantity: 0.01393985, type: 'crypto',    label: 'Bitcoin', inUniverse: false },
];
