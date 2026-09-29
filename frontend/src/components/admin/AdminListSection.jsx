import { useState } from 'react'

import useApiQuery from '../../hooks/useApiQuery.js'
import { fieldErrors, generalMessage } from '../../utils/errors.js'
import { DEFAULT_PAGE_SIZE } from '../../utils/transactions.js'
import Pagination from '../transactions/Pagination.jsx'
import Alert from '../ui/Alert.jsx'
import Spinner from '../ui/Spinner.jsx'
import DataTable from './DataTable.jsx'
import FilterBar from './FilterBar.jsx'

export function NoPermission() {
  return (
    <Alert variant="warning" className="mt-4">
      You do not have permission to view this section. Ask a superuser to grant it in the Django admin.
    </Alert>
  )
}

// Filterable, paginated admin list backed by one /api/admin/... endpoint.
// `columns[].render(row, { reload })` lets a column trigger a refresh after an action.
export default function AdminListSection({ fetcher, filterFields, emptyFilters, columns, rowKey, testId, emptyText }) {
  const [filters, setFilters] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [filterKey, setFilterKey] = useState(0)

  const params = { ...filters, page, page_size: pageSize }
  const { data, loading, error, reload } = useApiQuery(fetcher, params)

  if (error?.status === 403) return <NoPermission />

  const invalid = error?.status === 400 ? Object.values(fieldErrors(error)) : []
  const cols = columns.map((col) => ({ ...col, render: (row) => col.render(row, { reload }) }))

  return (
    <div className="space-y-4">
      <FilterBar
        key={filterKey}
        fields={filterFields}
        initial={filters}
        onApply={(next) => {
          setFilters(next)
          setPage(1)
        }}
        onReset={() => {
          setFilters(emptyFilters)
          setPage(1)
          setFilterKey((k) => k + 1)
        }}
      />

      {invalid.length > 0 && <Alert variant="error">{invalid.join(' ')}</Alert>}

      {error && error.status !== 400 && error.status !== 404 ? (
        <Alert variant="error">
          <p>{generalMessage(error)}</p>
          <button type="button" onClick={reload} className="mt-1 font-semibold underline">
            Try again
          </button>
        </Alert>
      ) : !data ? (
        invalid.length === 0 && (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500" role="status" aria-label="Loading">
            <Spinner className="h-5 w-5 text-indigo-600" /> Loading…
          </div>
        )
      ) : data.count === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500" data-testid={`${testId}-empty`}>
          {Object.values(filters).some(Boolean) ? 'Nothing matches these filters.' : emptyText}
        </p>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
          <DataTable columns={cols} rows={data.results} rowKey={rowKey} testId={testId} />
          <div className="mt-4">
            <Pagination
              page={page}
              pageSize={pageSize}
              count={data.count}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
