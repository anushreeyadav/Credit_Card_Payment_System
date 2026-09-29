// Transaction filters live in the page URL (?status=FAILED&page=2 ...) so a
// filtered view survives reloads and works with the Back button.

export const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Pending' },
]

export const PAGE_SIZES = [10, 25, 50]
export const DEFAULT_PAGE_SIZE = 10

export const EMPTY_FILTERS = { status: '', min_amount: '', max_amount: '', date_from: '', date_to: '' }
const FILTER_KEYS = Object.keys(EMPTY_FILTERS)

const AMOUNT = /^\d+(\.\d{1,2})?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function readQuery(searchParams) {
  const filters = { ...EMPTY_FILTERS }
  for (const key of FILTER_KEYS) filters[key] = searchParams.get(key) ?? ''
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const requestedSize = Number.parseInt(searchParams.get('page_size') ?? '', 10)
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE
  return { filters, page, pageSize }
}

// Only non-empty values are written, so the URL stays short.
export function buildQuery({ filters, page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
  const params = new URLSearchParams()
  for (const key of FILTER_KEYS) if (filters[key]) params.set(key, filters[key])
  if (page > 1) params.set('page', String(page))
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set('page_size', String(pageSize))
  return params
}

export const hasActiveFilters = (filters) => FILTER_KEYS.some((key) => filters[key])

export function validateFilters(filters) {
  const errors = {}
  for (const key of ['min_amount', 'max_amount']) {
    if (filters[key] && !AMOUNT.test(filters[key])) errors[key] = 'Enter a valid amount, e.g. 100 or 99.50.'
  }
  if (!errors.min_amount && !errors.max_amount && filters.min_amount && filters.max_amount) {
    if (Number(filters.min_amount) > Number(filters.max_amount)) errors.min_amount = 'Minimum cannot be more than maximum.'
  }
  for (const key of ['date_from', 'date_to']) {
    if (filters[key] && !DATE.test(filters[key])) errors[key] = 'Use the date picker (YYYY-MM-DD).'
  }
  if (!errors.date_from && !errors.date_to && filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
    errors.date_from = 'Start date cannot be after end date.'
  }
  return errors
}
