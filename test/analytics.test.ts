import { describe, expect, it } from 'vitest'
import { comparePeriods, inventoryView, salesSummary, topItems } from '../src/analytics.js'
import { completedOrder, openOrder, snapshot } from './fixtures.js'

describe('sales analytics', () => {
  it('never counts an open check as booked sales', () => {
    expect(salesSummary([completedOrder, openOrder])).toMatchObject({
      completedOrderCount: 1,
      openOrderCount: 1,
      bookedSales: 20000,
      openCheckValue: 9000,
      openUnpaidAmount: 9000,
    })
  })

  it('aggregates items without losing order counts', () => {
    expect(topItems([completedOrder, openOrder], 1)[0]).toMatchObject({
      name: 'Draft Beer',
      quantity: 4,
      sales: 40000,
      orderCount: 2,
    })
  })

  it('returns null percentage when the comparison baseline is zero', () => {
    expect(comparePeriods([completedOrder], []).change.bookedSales).toEqual({
      absolute: 20000,
      percent: null,
    })
  })
})

describe('inventory semantics', () => {
  it('surfaces Toss-tracked remaining quantities', () => {
    expect(inventoryView(snapshot.catalog)[0]).toMatchObject({
      sku: 'draft-beer',
      isStockable: true,
      remainingQuantity: 8,
    })
  })
})
