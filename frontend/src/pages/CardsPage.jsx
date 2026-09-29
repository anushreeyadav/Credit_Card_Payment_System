import { useState } from 'react'

import AddCardForm from '../components/cards/AddCardForm.jsx'
import CardTile from '../components/cards/CardTile.jsx'
import { CardIcon, PlusIcon, SendIcon } from '../components/icons.jsx'
import PageHeader from '../components/layout/PageHeader.jsx'
import Alert from '../components/ui/Alert.jsx'
import Button, { ButtonLink } from '../components/ui/Button.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import useCards from '../hooks/useCards.js'
import { PATHS } from '../routes/paths.js'
import { BRANDS } from '../utils/cards.js'
import { generalMessage } from '../utils/errors.js'

const brandLabel = (card) => BRANDS[card.card_type]?.label ?? card.card_type

function CardSkeleton() {
  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-hidden="true">
      <div className="aspect-[1.7/1] animate-pulse bg-slate-200" />
      <div className="h-12" />
    </li>
  )
}

export default function CardsPage() {
  const { cards, loading, loadError, reload, addCard, removeCard } = useCards()
  const [showForm, setShowForm] = useState(false)
  const [notice, setNotice] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  async function handleAdd(payload) {
    const card = await addCard(payload)
    setShowForm(false)
    setNotice({ variant: 'success', text: `${brandLabel(card)} ending in ${card.last4} was added.` })
  }

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await removeCard(pendingDelete.id)
      setNotice({ variant: 'success', text: `${brandLabel(pendingDelete)} ending in ${pendingDelete.last4} was deleted.` })
      setPendingDelete(null)
    } catch (error) {
      setDeleteError(generalMessage(error, 'Could not delete the card.'))
    } finally {
      setDeleting(false)
    }
  }

  const empty = !loading && !loadError && cards.length === 0

  return (
    <section>
      <PageHeader
        title="Saved cards"
        description="Cards are always shown masked. Only the last 4 digits are stored."
        actions={
          !showForm && !empty && !loading && (
            <>
              {cards.length > 0 && (
                <ButtonLink to={PATHS.payment} variant="secondary" icon={SendIcon}>
                  Make a payment
                </ButtonLink>
              )}
              <Button
                icon={PlusIcon}
                onClick={() => {
                  setNotice(null)
                  setShowForm(true)
                }}
              >
                Add card
              </Button>
            </>
          )
        }
      />

      {notice && (
        <Alert variant={notice.variant} className="mt-6">
          {notice.text}
        </Alert>
      )}

      {(showForm || empty) && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Add a card</h2>
          <p className="mt-1 mb-5 text-sm text-slate-600">Enter the details exactly as they appear on your card.</p>
          <AddCardForm onAdd={handleAdd} onCancel={empty ? undefined : () => setShowForm(false)} />
        </div>
      )}

      {loadError && (
        <Alert variant="error" className="mt-6">
          <p>{loadError}</p>
          <button type="button" onClick={reload} className="mt-1 font-semibold underline">
            Try again
          </button>
        </Alert>
      )}

      {loading ? (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading cards">
          <CardSkeleton />
          <CardSkeleton />
        </ul>
      ) : cards.length > 0 ? (
        <>
          <h2 className="mt-8 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Your cards ({cards.length})
          </h2>
          <ul className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="card-list">
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
      ) : (
        empty && (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-500" data-testid="no-cards">
            <CardIcon className="h-5 w-5" /> You have no saved cards yet.
          </p>
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
