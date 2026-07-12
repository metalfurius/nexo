import { Plus, Search, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { DialogFocusReturn, handleDialogKeyDown } from './shared'

export interface AddDialogProps {
  onClose: () => void
  onImport: () => void
  onManual: () => void
  onSearch: (query: string) => void
}

export default function AddDialog({ onClose, onImport, onManual, onSearch }: AddDialogProps) {
  const [query, setQuery] = useState('')

  return (
    <div className="modal-backdrop" role="presentation">
      <DialogFocusReturn />
      <section
        aria-labelledby="add-dialog-title"
        aria-modal="true"
        className="add-dialog"
        role="dialog"
        onKeyDown={(event) => handleDialogKeyDown(event, onClose)}
      >
        <button aria-label="Cerrar Añadir" className="icon-button dialog-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Un unico punto de entrada</span>
            <h2 id="add-dialog-title">Añadir a Nexo</h2>
            <p>Busca en Descubrir, crea una ficha privada o trae una biblioteca externa.</p>
          </div>
        </div>
        <form
          className="add-dialog-search"
          onSubmit={(event) => {
            event.preventDefault()
            if (query.trim().length >= 2) onSearch(query.trim())
          }}
        >
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Buscar obra para añadir"
              autoFocus
              placeholder="Dune, Hollow Knight, Frieren..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="primary-button" disabled={query.trim().length < 2} type="submit">
            <Search size={17} />
            Buscar en Descubrir
          </button>
        </form>
        <div className="add-dialog-options">
          <button className="secondary-button" type="button" onClick={onManual}>
            <Plus size={17} />
            Crear manualmente
          </button>
          <button className="secondary-button" type="button" onClick={onImport}>
            <Upload size={17} />
            Importar biblioteca
          </button>
        </div>
      </section>
    </div>
  )
}
