import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Evita la schermata nera se un errore di render sfugge. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[app] errore di render', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: 24,
          background: '#0A0C09',
          color: '#F2F5EF',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'rgba(255,107,90,0.12)',
            border: '1px solid rgba(255,107,90,0.35)',
            color: '#FF6B5A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          !
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Qualcosa è andato storto</p>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#99A394', maxWidth: 320 }}>
            L'app non riesce a disegnare la schermata. I tuoi dati restano salvati sul dispositivo.
          </p>
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: 'ui-monospace, monospace',
            fontSize: 11,
            color: '#6B7566',
            maxWidth: 320,
            wordBreak: 'break-word',
          }}
        >
          {this.state.error.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            height: 44,
            padding: '0 22px',
            borderRadius: 14,
            border: 0,
            background: '#C8FF3D',
            color: '#0A0C09',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Ricarica
        </button>
        <p style={{ margin: 0, fontSize: 11, color: '#6B7566' }}>
          Se persiste, apri il sito in una scheda normale del browser.
        </p>
      </div>
    )
  }
}
