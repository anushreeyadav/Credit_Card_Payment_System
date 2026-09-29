import { transactionService } from '../services/djangoApi.js'
import useApiQuery from './useApiQuery.js'

// One page of the signed-in user's transactions for the given filters.
// The API only ever returns the user's own transactions. While a new page
// loads, the previous one stays available (the page dims it).
export default function useTransactions({ filters, page, pageSize }) {
  return useApiQuery(transactionService.list, { ...filters, page, page_size: pageSize })
}
