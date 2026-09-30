import { HelpIcon, HomeIcon } from '../components/icons.jsx'
import { ButtonLink } from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { PATHS } from '../routes/paths.js'

export default function NotFoundPage() {
  return (
    <section>
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        className="mt-6"
        icon={HelpIcon}
        tone="slate"
        title="Page not found"
        action={
          <>
            <ButtonLink to={PATHS.dashboard} icon={HomeIcon}>
              Go to the dashboard
            </ButtonLink>
            <ButtonLink to={PATHS.help} variant="secondary">
              Help &amp; Support
            </ButtonLink>
          </>
        }
      >
        That page does not exist or has moved.
      </EmptyState>
    </section>
  )
}
