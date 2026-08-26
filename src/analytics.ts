import type { JsonRecord, TossOrder } from './domain.js'

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function orderDate(order: TossOrder): Date {
  return new Date(string(order.openedAt, order.createdAt))
}

function charge(order: TossOrder): JsonRecord {
  return record(order.chargePrice)
}

function paymentPrice(order: TossOrder): JsonRecord {
  return record(order.paymentPrice)
}

function isCancelled(order: TossOrder): boolean {
  return order.orderState === 'CANCELLED' || order.paymentState === 'CANCELLED'
}

function isCompleted(order: TossOrder): boolean {
  return order.orderState === 'COMPLETED' || order.paymentState === 'COMPLETED'
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function salesSummary(orders: TossOrder[]) {
  const active = orders.filter((order) => !isCancelled(order))
  const completed = active.filter(isCompleted)
  const open = active.filter((order) => !isCompleted(order))
  const totals = (selected: TossOrder[]) =>
    selected.reduce(
      (result, order) => {
        const price = charge(order)
        const payment = paymentPrice(order)
        result.gross += number(price.chargeListPriceValue)
        result.net += number(price.chargePriceValue)
        result.discount += number(price.chargeDiscountValue)
        result.tax += number(price.chargeTaxValue)
        result.tip += number(price.chargeTipValue)
        result.paid += number(payment.paymentPaidValue)
        result.unpaid += number(payment.paymentUnpaidValue)
        return result
      },
      { gross: 0, net: 0, discount: 0, tax: 0, tip: 0, paid: 0, unpaid: 0 },
    )

  const booked = totals(completed)
  const openChecks = totals(open)
  return {
    orderCount: orders.length,
    completedOrderCount: completed.length,
    openOrderCount: open.length,
    cancelledOrderCount: orders.length - active.length,
    bookedSales: round(booked.net),
    bookedGrossSales: round(booked.gross),
    bookedDiscount: round(booked.discount),
    bookedTax: round(booked.tax),
    bookedTips: round(booked.tip),
    paidAmount: round(booked.paid),
    averageCompletedOrderValue: completed.length ? round(booked.net / completed.length) : 0,
    openCheckValue: round(openChecks.net),
    openUnpaidAmount: round(openChecks.unpaid),
    currency: 'KRW',
    methodology: {
      bookedSales: 'Sum of Toss chargePrice.chargePriceValue for completed, non-cancelled orders.',
      openCheckValue: 'Displayed separately and never counted as booked sales.',
      discount: 'Raw signed Toss chargeDiscountValue; refunds and reversals can affect the sign.',
    },
  }
}

interface ItemMetric {
  id: string
  name: string
  category: string
  quantity: number
  sales: number
  orderCount: number
}

export function topItems(orders: TossOrder[], limit = 20): ItemMetric[] {
  const metrics = new Map<string, ItemMetric & { orders: Set<string> }>()
  for (const order of orders.filter((candidate) => !isCancelled(candidate))) {
    for (const rawLine of array(order.lineItems)) {
      const line = record(rawLine)
      const item = record(line.item)
      const category = record(item.category)
      const id = String(item.id ?? item.code ?? item.title ?? 'unknown')
      const current = metrics.get(id) ?? {
        id,
        name: string(item.title, 'Unknown item'),
        category: string(category.title, 'Uncategorized'),
        quantity: 0,
        sales: 0,
        orderCount: 0,
        orders: new Set<string>(),
      }
      current.quantity += number(record(line.quantity).value)
      current.sales += number(record(line.chargePrice).value)
      current.orders.add(order.id)
      metrics.set(id, current)
    }
  }
  return [...metrics.values()]
    .map(({ orders: orderIds, ...metric }) => ({
      ...metric,
      sales: round(metric.sales),
      orderCount: orderIds.size,
    }))
    .sort((left, right) => right.sales - left.sales || right.quantity - left.quantity)
    .slice(0, limit)
}

export function salesTimeseries(orders: TossOrder[], interval: 'hour' | 'day' | 'weekday') {
  const buckets = new Map<string, TossOrder[]>()
  for (const order of orders) {
    const date = orderDate(order)
    if (Number.isNaN(date.valueOf())) continue
    let key: string
    if (interval === 'hour') key = `${String(date.getHours()).padStart(2, '0')}:00`
    else if (interval === 'weekday')
      key = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()] ?? 'Unknown'
    else key = date.toISOString().slice(0, 10)
    buckets.set(key, [...(buckets.get(key) ?? []), order])
  }
  return [...buckets.entries()]
    .map(([bucket, selected]) => ({ bucket, ...salesSummary(selected) }))
    .sort((left, right) => left.bucket.localeCompare(right.bucket))
}

export function paymentBreakdown(orders: TossOrder[]) {
  const methods = new Map<
    string,
    { method: string; paymentCount: number; amount: number; cancelledAmount: number }
  >()
  for (const order of orders) {
    for (const rawPayment of array(order.payments)) {
      const payment = record(rawPayment)
      const method = string(payment.sourceType, 'UNKNOWN')
      const current = methods.get(method) ?? {
        method,
        paymentCount: 0,
        amount: 0,
        cancelledAmount: 0,
      }
      const amount = number(payment.amountMoney)
      current.paymentCount += 1
      if (payment.state === 'CANCELLED' || payment.paymentState === 'CANCELLED')
        current.cancelledAmount += amount
      else current.amount += amount
      methods.set(method, current)
    }
  }
  return [...methods.values()]
    .map((entry) => ({
      ...entry,
      amount: round(entry.amount),
      cancelledAmount: round(entry.cancelledAmount),
    }))
    .sort((left, right) => right.amount - left.amount)
}

export function inventoryView(catalog: JsonRecord[]) {
  return catalog.map((item) => {
    const price = record(item.price)
    const stock = record(price.stockQuantity)
    return {
      id: String(item.id ?? ''),
      sku: string(price.sku, string(item.code)),
      name: string(item.title, 'Unknown item'),
      category: string(record(item.category).title, 'Uncategorized'),
      state: string(item.state, 'UNKNOWN'),
      price: number(price.priceValue),
      isStockable: price.isStockable === true,
      remainingQuantity: price.isStockable === true ? number(stock.remainQuantity) : null,
      stockLastChangedAt: string(stock.lastChangeDateTime) || null,
    }
  })
}

export function comparePeriods(current: TossOrder[], previous: TossOrder[]) {
  const currentSummary = salesSummary(current)
  const previousSummary = salesSummary(previous)
  const change = (currentValue: number, previousValue: number) => ({
    absolute: round(currentValue - previousValue),
    percent:
      previousValue === 0 ? null : round(((currentValue - previousValue) / previousValue) * 100),
  })
  return {
    current: currentSummary,
    previous: previousSummary,
    change: {
      bookedSales: change(currentSummary.bookedSales, previousSummary.bookedSales),
      completedOrderCount: change(
        currentSummary.completedOrderCount,
        previousSummary.completedOrderCount,
      ),
      averageCompletedOrderValue: change(
        currentSummary.averageCompletedOrderValue,
        previousSummary.averageCompletedOrderValue,
      ),
    },
  }
}
