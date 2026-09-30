import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import AddCardForm from '../components/cards/AddCardForm.jsx'
import CardTile from '../components/cards/CardTile.jsx'
import { CardIcon, LockIcon, PlusIcon, SendIcon, ShieldIcon } from '../components/icons.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import Button, { ButtonLink } from '../components/ui/Button.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
import useCards from '../hooks/useCards.js'
import useToast from '../hooks/useToast.js'
import { PATHS } from '../routes/paths.js'
import { BRANDS, isExpired } from '../utils/cards.js'
import { generalMessage } from '../utils/errors.js'

const brandLabel = (card) => BRANDS[card.card_type]?.label ?? card.card_type

function CardSkeleton() {
  return (
    <li className="rounded-3xl border border-slate-200 bg-white p-3" aria-hidden="true">
      <div className="aspect-[1.586/1] animate-pulse rounded-3xl bg-slate-200" />
      <div className="mt-3 h-8 animate-pulse rounded-xl bg-slate-100" />
    </li>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  )
}

export default function CardsPage() {
  const { cards, loading, loadError, reload, addCard, removeCard } = useCards()
  const { notify } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  // ?add=1 (from the dashboard or quick search) opens the form straight away.
  const [showForm, setShowForm] = useState(searchParams.get('add') === '1')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  function closeForm() {
    setShowForm(false)
    if (searchParams.has('add')) setSearchParams({}, { replace: true })
  }

  async function handleAdd(payload) {
    const card = await addCard(payload)
    closeForm()
    notify(`${brandLabel(card)} ending in ${card.last4} was added.`, { force: true })
  }

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await removeCard(pendingDelete.id)
      notify(`${brandLabel(pendingDelete)} ending in ${pendingDelete.last4} was deleted.`, { force: true })
      setPendingDelete(null)
    } catch (error) {
      setDeleteError(generalMessage(error, 'Could not delete the card.'))
    } finally {
      setDeleting(false)
    }
  }

  const empty = !loading && !loadError && cards.length === 0
  const active = cards.filter((card) => !isExpired(card)).length

  return (
    <section>
      <PageHeader
        eyebrow="Wallet"
        title="Saved cards"
        description="Cards are always shown masked. Only the last 4 digits are stored."
        actions={
          !showForm &&
          !empty &&
          !loading && (
            <>
              {cards.length > 0 && (
                <ButtonLink to={PATHS.payment} variant="secondary" icon={SendIcon}>
                  Make a payment
                </ButtonLink>
              )}
              <Button icon={PlusIcon} onClick={() => setShowForm(true)}>
                Add card
              </Button>
            </>
          )
        }
      />

      {cards.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-xl">
          <Stat label="Saved cards" value={cards.length} />
          <Stat label="Active" value={active} />
          <Stat label="Expired" value={cards.length - active} />
        </div>
      )}

      {(showForm || empty) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
                <CardIcon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Add a card</h2>
                <p className="text-sm text-slate-600">Enter the details exactly as they appear on your card.</p>
              </div>
            </div>
            {empty && (
              <p className="mt-4 rounded-2xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800" data-testid="no-cards">
                You have no saved cards yet. Add your first card to start making payments.
              </p>
            )}
            <div className="mt-5">
              <AddCardForm onAdd={handleAdd} onCancel={empty ? undefined : closeForm} />
            </div>
          </div>
          <aside className="theme-fixed h-fit space-y-4 rounded-3xl bg-gradient-to-br from-slate-900 to-indigo-950 p-6 text-white shadow-lg lg:col-span-2">
            <h3 className="flex items-center gap-2 font-semibold">
              <ShieldIcon className="h-5 w-5 text-emerald-300" /> How your card is protected
            </h3>
            <ul className="space-y-3 text-sm text-slate-300">
              <li className="flex gap-2">
                <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                The full number is checked once and never stored. We keep a masked number and the last 4 digits.
              </li>
              <li className="flex gap-2">
                <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                No security code is asked for or kept.
              </li>
              <li className="flex gap-2">
                <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
                Payments use the saved card's reference, never the number.
              </li>
            </ul>
          </aside>
        </div>
      )}

      {loadError && <ErrorState className="mt-6" message={loadError} onRetry={reload} />}

      {loading ? (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading cards">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </ul>
      ) : (
        cards.length > 0 && (
          <>
            <h2 className="mt-8 text-sm font-semibold tracking-wide text-slate-500 uppercase">Your cards ({cards.length})</h2>
            <ul className="mt-3 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-testid="card-list">
              {cards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  onDelete={(c) => {
                    setDeleteError(null)
                    setPendingDelete(c)
                  }}
                />
              ))}
            </ul>
          </>
        )
      )}

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
              {brandLabel(pendingDelete)} {pendingDelete.masked_number}
            </span>{' '}
            will be removed from your account. Past transactions made with it are kept.
          </>
        )}
      </ConfirmDialog>
    </section>
  )
}
