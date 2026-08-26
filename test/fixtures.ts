import type { MerchantSnapshot, TossOrder } from '../src/domain.js'

export const completedOrder: TossOrder = {
  id: 'order-completed',
  orderKey: 'sample-1',
  orderState: 'COMPLETED',
  paymentState: 'COMPLETED',
  tableId: 1,
  createdAt: '2026-08-25T11:00:00+09:00',
  openedAt: '2026-08-25T11:00:00+09:00',
  chargePrice: {
    chargeListPriceValue: 22000,
    chargeDiscountValue: -2000,
    chargePriceValue: 20000,
    chargeSupplyValue: 18182,
    chargeTaxValue: 1818,
    chargeTipValue: 0,
  },
  paymentPrice: { paymentPaidValue: 20000, paymentUnpaidValue: 0 },
  lineItems: [
    {
      id: 'line-1',
      item: { id: 101, title: 'Draft Beer', category: { id: 10, title: 'Beer' } },
      quantity: { value: 2 },
      chargePrice: { value: 20000 },
    },
  ],
  payments: [{ id: 'payment-1', sourceType: 'CARD', state: 'COMPLETED', amountMoney: 20000 }],
}

export const openOrder: TossOrder = {
  ...completedOrder,
  id: 'order-open',
  orderKey: 'sample-2',
  orderState: 'OPENED',
  paymentState: 'OPENED',
  createdAt: '2026-08-25T12:00:00+09:00',
  openedAt: '2026-08-25T12:00:00+09:00',
  chargePrice: {
    chargeListPriceValue: 9000,
    chargeDiscountValue: 0,
    chargePriceValue: 9000,
    chargeSupplyValue: 8182,
    chargeTaxValue: 818,
    chargeTipValue: 0,
  },
  paymentPrice: { paymentPaidValue: 0, paymentUnpaidValue: 9000 },
  payments: [],
}

export const snapshot: MerchantSnapshot = {
  merchantId: '900001',
  merchant: { id: 900001, name: 'Sample Bar' },
  device: { name: 'Sample POS', platform: 'windows', serialNumber: 'REDACTED' },
  categories: [{ id: 10, title: 'Beer' }],
  catalog: [
    {
      id: 101,
      title: 'Draft Beer',
      state: 'ON_SALE',
      category: { id: 10, title: 'Beer' },
      price: {
        sku: 'draft-beer',
        priceValue: 10000,
        isStockable: true,
        stockQuantity: { remainQuantity: 8, lastChangeDateTime: '2026-08-25T12:00:00+09:00' },
      },
    },
  ],
  options: [],
  halls: [{ id: 1, title: 'Main' }],
  tables: [{ id: 1, title: 'Table 1' }],
  updatedAt: '2026-08-25T12:01:00+09:00',
}
