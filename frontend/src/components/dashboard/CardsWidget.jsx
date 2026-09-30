import { useState } from 'react'

import useToast from '../../hooks/useToast.js'
import { PATHS } from '../../routes/paths.js'
import { brandOf } from '../../utils/cards.js'
import { generalMessage } from '../../utils/errors.js'
import DigitalCard from '../cards/DigitalCard.jsx'
import { ArrowLeftIcon, ArrowRightIcon, CardIcon, PlusIcon, TrashIcon } from '../icons.jsx'
import Button, { ButtonLink } from '../ui/Button.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import ErrorState from '../ui/ErrorState.jsx'

// "My Cards" on the dashboard: one card at a time with previous/next,
// plus View cards / Add new card / Delete card. Masked data only.
export default function CardsWidget({ cards, loading, loadError, reload, removeCard }) {
  const { notify } = useToast()
  const [index, setIndex] = useState(0)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  const current = cards[Math.min(index, cards.length - 1)]

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await removeCard(pendingDelete.id)
      notify(`${brandOf(pendingDelete).label} ending in ${pendingDelete.last4} was deleted.`, { force: true })
      setPendingDelete(null)
      setIndex(0)
    } catch (error) {
      setDeleteError(generalMessage(error, 'Could not delete the card.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="cards-widget-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="cards-widget-title" className="flex items-center gap-2 font-semibold text-slate-900">
          <CardIcon className="h-5 w-5 text-indigo-600" /> My Cards
          {cards.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{cards.length}</span>}
        </h2>
        {cards.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIndex((i) => (i - 1 + cards.length) % cards.length)}
              className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
              aria-label="Previous card"
              title="Previous card"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % cards.length)}
              className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
              aria-label="Next card"
              title="Next card"
            >
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="aspect-[1.586/1] animate-pulse rounded-3xl bg-slate-200" aria-label="Loading cards" role="status" />
        ) : loadError ? (
          <ErrorState compact message={loadError} onRetry={reload} />
        ) : !current ? (
          <EmptyState
            icon={CardIcon}
            title="No saved cards yet"
            action={
              <ButtonLink to={`${PATHS.cards}?add=1`} icon={PlusIcon} size="sm">
                Add your first card
              </ButtonLink>
            }
          >
            Add your first card to start making payments.
          </EmptyState>
        ) : (
          <>
            <div key={current.id} className="page-in" aria-live="polite">
              <DigitalCard card={current} />
            </div>
            {cards.length > 1 && (
              <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
                {cards.map((card) => (
                  <span key={card.id} className={`h-1.5 rounded-full transition-all ${card.id === current.id ? 'w-5 bg-indigo-600' : 'w-1.5 bg-slate-300'}`} />
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 [&>*]:min-w-24 [&>*]:flex-1">
              <ButtonLink to={PATHS.cards} variant="secondary" size="sm" icon={CardIcon}>
                View cards
              </ButtonLink>
              <ButtonLink to={`${PATHS.cards}?add=1`} variant="soft" size="sm" icon={PlusIcon}>
                Add new
              </ButtonLink>
              <Button
                variant="danger-soft"
                size="sm"
                icon={TrashIcon}
                className="ring-1 ring-red-200 ring-inset"
                onClick={() => {
                  setDeleteError(null)
                  setPendingDelete(current)
                }}
                aria-label={`Delete ${brandOf(current).label} ending in ${current.last4}`}
              >
                Delete
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this card?"
        confirmLabel="Delete card"
        busyLabel="Deleting…"
        busy={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        {pendingDelete && (
          <>
            <span className="font-medium text-slate-900">
              {brandOf(pendingDelete).label} {pendingDelete.masked_number}
            </span>{' '}
            will be removed from your account. Past transactions made with it are kept.
          </>
        )}
      </ConfirmDialog>
    </section>
  )
}
