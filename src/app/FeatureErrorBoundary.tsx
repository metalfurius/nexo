import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { isChunkLoadError } from './chunkErrors'

interface FeatureErrorBoundaryProps {
  children: ReactNode
  label: string
}

interface FeatureErrorBoundaryState {
  failed: boolean
  reloadRequired: boolean
  retryKey: number
}

export default class FeatureErrorBoundary extends Component<FeatureErrorBoundaryProps, FeatureErrorBoundaryState> {
  state: FeatureErrorBoundaryState = { failed: false, reloadRequired: false, retryKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<FeatureErrorBoundaryState> {
    return { failed: true, reloadRequired: isChunkLoadError(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error(`Fallo recuperable en ${this.props.label}`, error, info)
  }

  retry = () => {
    if (this.state.reloadRequired) {
      window.location.reload()
      return
    }
    this.setState((current) => ({ failed: false, reloadRequired: false, retryKey: current.retryKey + 1 }))
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="feature-error" role="alert">
          <AlertTriangle size={24} />
          <div>
            <strong>No pudimos abrir {this.props.label}</strong>
            <p>
              {this.state.reloadRequired
                ? 'Hay una version nueva de esta vista. Recarga Nexo para obtenerla.'
                : 'El resto de Nexo sigue disponible. Reintenta esta vista o cambia de seccion.'}
            </p>
          </div>
          <button className="primary-button" type="button" onClick={this.retry}>
            <RotateCcw size={16} />
            {this.state.reloadRequired ? 'Recargar Nexo' : 'Reintentar'}
          </button>
        </section>
      )
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>
  }
}
