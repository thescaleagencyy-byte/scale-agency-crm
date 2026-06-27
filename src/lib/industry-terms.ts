import { CLIENT_INDUSTRY } from './features'

interface IndustryTerms {
  deal: string
  deals: string
  lostDeal: string
  lostDeals: string
  wonDeal: string
  wonDeals: string
  markAsLost: string
  markAsWon: string
  lostReason: string
  wonReason: string
  lostThisMonth: string
  lostThisMonthTooltip: string
}

export function getIndustryTerms(): IndustryTerms {
  const ind = CLIENT_INDUSTRY.toLowerCase()

  if (ind.includes('restaurant') || ind.includes('food')) return {
    deal:                 'order',
    deals:                'orders',
    lostDeal:             'abandoned order',
    lostDeals:            'abandoned orders',
    wonDeal:              'completed order',
    wonDeals:             'completed orders',
    markAsLost:           'Mark as Abandoned',
    markAsWon:            'Mark as Completed',
    lostReason:           'Why was this order abandoned?',
    wonReason:            'Why was this order completed?',
    lostThisMonth:        'Abandoned This Month',
    lostThisMonthTooltip: 'Orders marked as Abandoned since the first day of the current month.',
  }

  if (ind.includes('logistic') || ind.includes('transport') || ind.includes('car') || ind.includes('wheel')) return {
    deal:                 'quote',
    deals:                'quotes',
    lostDeal:             'dropped quote',
    lostDeals:            'dropped quotes',
    wonDeal:              'closed deal',
    wonDeals:             'closed deals',
    markAsLost:           'Mark as Dropped',
    markAsWon:            'Mark as Closed',
    lostReason:           'Why was this quote dropped?',
    wonReason:            'Why was this deal closed?',
    lostThisMonth:        'Dropped This Month',
    lostThisMonthTooltip: 'Quotes marked as Dropped since the first day of the current month.',
  }

  return {
    deal:                 'deal',
    deals:                'deals',
    lostDeal:             'lost deal',
    lostDeals:            'lost deals',
    wonDeal:              'won deal',
    wonDeals:             'won deals',
    markAsLost:           'Mark as Lost',
    markAsWon:            'Mark as Won',
    lostReason:           'Why was this deal lost?',
    wonReason:            'Why was this deal won?',
    lostThisMonth:        'Lost This Month',
    lostThisMonthTooltip: 'Deals marked as Lost since the first day of the current month.',
  }
}
