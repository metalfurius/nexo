import './SettingsTab.css'

import { catalogTaxonomyTemplates } from '../data/catalogPresets'
import { type ExplorerSearchType, type ListItem, type RoadmapPreferences, type ThemeMode, type UserSettings } from '../domain/types'
import { assertLibraryImportFileLimit, assertLibraryImportItemLimit, getLibraryImportRollbackPlan, getLibraryImportSummary, type LibraryImportRollbackPlan, type ParsedLibraryImport, parseLibraryImportPayload } from '../lib/libraryBackup'
import { clearLibraryImportRollback, persistLibraryImportRollback, readLibraryImportRollback } from '../lib/libraryImportRollbackStore'
import { hasItemTaxonomy } from '../lib/libraryInsights'
import { itemTypeLabels as typeLabels } from '../lib/libraryItemInsights'
import { getPrivateDataHealth, getPrivateTaxonomyRepairDraft, type PrivateTasteSuggestion } from '../lib/privateDataInsights'
import { mergeListText, normalizeKey, splitList } from '../lib/strings'
import { isFirestoreOfflinePersistenceEnabled, setFirestoreOfflinePersistenceEnabled } from '../services/devicePreferences'
import { getNotificationIntentState, type NotificationIntentState, setNotificationIntentEnabled } from '../services/notificationService'
import { Archive, Bell, Check, CheckCircle2, Copy, Dice5, Download, Info, Plus, RotateCcw, Save, Search, ShieldCheck, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AdminRolesPanel, DialogFocusReturn, FeedbackMessage, ItemEditor, MetricCard, PreferencePreview, cloneUserSettings, downloadLibraryBackup, feedbackToneFromText, formatBackupImportSummary, formatLibraryImportRollbackDetail, formatLibraryImportRollbackStatus, getNotificationActionStatus, getNotificationStatusLabel, handleDialogKeyDown, roleLabels, sameList, settingsDraftFromSettings, themeLabels, themeOptions, type ActivityRecorder, type AppTab, type AuthUserSummary, type LibrarySurface, type PendingBackupImport, type PrivateDataAction, type SettingsDraft, type SettingsSaveRequest, type SettingsTasteSuggestionsRequest, type SettingsTaxonomyRepairRequest } from '../app/shared'

interface DeletedPrivateItemsUndo {
  items: ListItem[]
  roadmap: RoadmapPreferences
}

export default function SettingsTab({
  library,
  onActivity,
  onNavigate,
  onRollDice,
  onSaveRequestHandled,
  onTasteSuggestionsRequestHandled,
  onTaxonomyRepairRequestHandled,
  onUnsavedChange,
  saveRequest,
  sessionKey,
  setTheme,
  tasteSuggestionsRequest,
  taxonomyRepairRequest,
  theme,
  user,
}: {
  library: LibrarySurface
  onActivity: ActivityRecorder
  onNavigate: (tab: AppTab) => void
  onRollDice: () => void
  onSaveRequestHandled: () => void
  onTasteSuggestionsRequestHandled: () => void
  onTaxonomyRepairRequestHandled: () => void
  onUnsavedChange: (hasUnsavedChanges: boolean) => void
  saveRequest?: SettingsSaveRequest
  sessionKey?: string
  setTheme: (theme: ThemeMode) => void
  tasteSuggestionsRequest?: SettingsTasteSuggestionsRequest
  taxonomyRepairRequest?: SettingsTaxonomyRepairRequest
  theme: ThemeMode
  user: AuthUserSummary | null
}) {
  const [draftState, setDraft] = useState<SettingsDraft>(() => settingsDraftFromSettings({ ...library.settings, theme }))
  const [draftTouched, setDraftTouched] = useState(false)
  const [settingsSavePending, setSettingsSavePending] = useState(false)
  const draftTouchedRef = useRef(false)
  const previousThemeRef = useRef(theme)
  const snapshotDraft = useMemo(() => settingsDraftFromSettings({ ...library.settings, theme }), [library.settings, theme])
  const draft = draftTouched ? draftState : snapshotDraft
  const [status, setStatus] = useState<string | undefined>()
  const [settingsUndo, setSettingsUndo] = useState<UserSettings | undefined>()
  const [privateTaxonomyUndoItems, setPrivateTaxonomyUndoItems] = useState<ListItem[]>([])
  const [settingsImportUndo, setSettingsImportUndo] = useState<LibraryImportRollbackPlan | undefined>(() =>
    readLibraryImportRollback('backup', sessionKey),
  )
  const [editingItem, setEditingItem] = useState<ListItem | undefined>()
  const [pendingBackupImport, setPendingBackupImport] = useState<PendingBackupImport | undefined>()
  const [applyBackupImportSettings, setApplyBackupImportSettings] = useState(false)
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false)
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('')
  const [offlinePersistenceEnabled, setOfflinePersistenceState] = useState(() => isFirestoreOfflinePersistenceEnabled())
  const [notificationIntentState, setNotificationIntentState] = useState<NotificationIntentState>(() =>
    getNotificationIntentState('app_update_debug'),
  )
  const [deletedPrivateItemsUndo, setDeletedPrivateItemsUndo] = useState<DeletedPrivateItemsUndo>()
  const handledSaveRequestId = useRef<number | undefined>(undefined)
  const handledTasteSuggestionsRequestId = useRef<number | undefined>(undefined)
  const handledTaxonomyRepairRequestId = useRef<number | undefined>(undefined)
  const backupImportSessionToken = useMemo(() => Symbol(sessionKey ?? 'local'), [sessionKey])
  const activeBackupImportSessionRef = useRef<symbol | undefined>(backupImportSessionToken)
  const draftFavoriteTags = useMemo(() => splitList(draft.favoriteTags), [draft.favoriteTags])
  const draftFavoriteGenres = useMemo(() => splitList(draft.favoriteGenres), [draft.favoriteGenres])
  const draftBlockedTags = useMemo(() => splitList(draft.blockedTags), [draft.blockedTags])
  const draftBlockedSignalKeys = useMemo(() => new Set(draftBlockedTags.map(normalizeKey)), [draftBlockedTags])
  const accountLabel = user?.displayName ?? user?.email ?? 'Sesion demo'
  const accountInitial = accountLabel.slice(0, 1).toUpperCase()
  const queuedDiscoveryCount = library.discoveryCandidates.filter((candidate) => candidate.status === 'queued').length
  const resolvedDiscoveryCount = library.discoveryCandidates.length - queuedDiscoveryCount
  const firstMissingTaxonomyItem = library.items.find((item) => !hasItemTaxonomy(item))
  const privateDataHealth = useMemo(
    () => getPrivateDataHealth(library.items, library.discoveryCandidates, undefined, draftBlockedTags),
    [draftBlockedTags, library.discoveryCandidates, library.items],
  )
  const privateTaxonomyRepairs = useMemo(() => {
    return library.items
      .map((item) => ({
        original: item,
        repair: getPrivateTaxonomyRepairDraft(item, catalogTaxonomyTemplates[item.type][0], item.updatedAt),
      }))
      .filter((entry): entry is { original: ListItem; repair: NonNullable<ReturnType<typeof getPrivateTaxonomyRepairDraft>> } =>
        Boolean(entry.repair),
      )
  }, [library.items])
  const visibleTasteSuggestions = useMemo(
    () => privateDataHealth.tasteSuggestions.filter((suggestion) => !draftBlockedSignalKeys.has(normalizeKey(suggestion.label))),
    [draftBlockedSignalKeys, privateDataHealth.tasteSuggestions],
  )
  const pendingTasteSuggestions = useMemo(() => visibleTasteSuggestions.filter((suggestion) => {
    const currentValues = suggestion.kind === 'genre' ? draftFavoriteGenres : draftFavoriteTags
    const suggestionKey = normalizeKey(suggestion.label)
    return !currentValues.some((value) => normalizeKey(value) === suggestionKey)
  }), [draftFavoriteGenres, draftFavoriteTags, visibleTasteSuggestions])
  const draftThemeOption = themeOptions.find((option) => option.id === draft.theme) ?? themeOptions[0]
  const syncStatusLabel = library.syncState.hasPendingWrites
    ? 'Pendiente'
    : library.syncState.fromCache
      ? 'Cache'
      : library.syncState.remote
        ? 'Sincronizado'
        : 'Local'
  const notificationStatusLabel = getNotificationStatusLabel(notificationIntentState)
  const personalTasteCount = draftFavoriteGenres.length + draftFavoriteTags.length
  const tasteSummary =
    pendingTasteSuggestions.length > 0
      ? `${pendingTasteSuggestions.length} sugerencias`
      : personalTasteCount > 0 || draftBlockedTags.length > 0
        ? `${personalTasteCount} favoritos / ${draftBlockedTags.length} bloqueados`
        : 'Sin preferencias'
  const hasUnsavedChanges = settingsSavePending || (
    draftTouched && (
      draft.theme !== theme ||
      draft.explorerDefaultType !== library.settings.explorerDefaultType ||
      !sameList(draftFavoriteTags, library.settings.favoriteTags) ||
      !sameList(draftFavoriteGenres, library.settings.favoriteGenres) ||
      !sameList(draftBlockedTags, library.settings.blockedTags)
    )
  )

  const clearSettingsImportRollback = useCallback(() => {
    setSettingsImportUndo(undefined)
    clearLibraryImportRollback('backup', sessionKey)
  }, [sessionKey])

  useEffect(() => {
    activeBackupImportSessionRef.current = backupImportSessionToken
    return () => {
      if (activeBackupImportSessionRef.current === backupImportSessionToken) {
        activeBackupImportSessionRef.current = undefined
      }
    }
  }, [backupImportSessionToken])

  useLayoutEffect(() => {
    onUnsavedChange(hasUnsavedChanges)
    return () => onUnsavedChange(false)
  }, [hasUnsavedChanges, onUnsavedChange])

  useEffect(() => {
    const themeChangedExternally = previousThemeRef.current !== theme
    previousThemeRef.current = theme
    if (!draftTouched || !themeChangedExternally) return undefined
    const timeoutId = window.setTimeout(() => {
      setDraft((current) => (current.theme === theme ? current : { ...current, theme }))
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [draftTouched, theme])

  const updateDraft = useCallback((updater: (current: SettingsDraft) => SettingsDraft) => {
    setSettingsUndo(undefined)
    const wasTouched = draftTouchedRef.current
    draftTouchedRef.current = true
    setDraftTouched(true)
    setDraft((current) => updater(wasTouched ? current : snapshotDraft))
  }, [snapshotDraft])

  function applyTasteSuggestion(suggestion: PrivateTasteSuggestion) {
    updateDraft((current) =>
      suggestion.kind === 'genre'
        ? { ...current, favoriteGenres: mergeListText(current.favoriteGenres, [suggestion.label]) }
        : { ...current, favoriteTags: mergeListText(current.favoriteTags, [suggestion.label]) },
    )
    setStatus(`${suggestion.kind === 'genre' ? 'Genero' : 'Tag'} sugerido anadido`)
  }

  const applyTasteSuggestions = useCallback(() => {
    if (!pendingTasteSuggestions.length) return

    const genres = pendingTasteSuggestions.filter((suggestion) => suggestion.kind === 'genre').map((suggestion) => suggestion.label)
    const tags = pendingTasteSuggestions.filter((suggestion) => suggestion.kind === 'tag').map((suggestion) => suggestion.label)
    updateDraft((current) => ({
      ...current,
      favoriteGenres: genres.length ? mergeListText(current.favoriteGenres, genres) : current.favoriteGenres,
      favoriteTags: tags.length ? mergeListText(current.favoriteTags, tags) : current.favoriteTags,
    }))
    setStatus(`${pendingTasteSuggestions.length} sugerencias anadidas`)
  }, [pendingTasteSuggestions, updateDraft])

  useEffect(() => {
    if (!tasteSuggestionsRequest || handledTasteSuggestionsRequestId.current === tasteSuggestionsRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledTasteSuggestionsRequestId.current === tasteSuggestionsRequest.requestId) return

      handledTasteSuggestionsRequestId.current = tasteSuggestionsRequest.requestId
      applyTasteSuggestions()
      onTasteSuggestionsRequestHandled()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [applyTasteSuggestions, onTasteSuggestionsRequestHandled, tasteSuggestionsRequest])

  const saveSettings = useCallback(async () => {
    if (settingsSavePending) return
    const previousSettings = cloneUserSettings({ ...library.settings, theme })
    const nextSettings: Partial<UserSettings> = {
      theme: draft.theme,
      favoriteTags: draftFavoriteTags,
      favoriteGenres: draftFavoriteGenres,
      blockedTags: draftBlockedTags,
      explorerDefaultType: draft.explorerDefaultType,
    }
    setSettingsSavePending(true)
    setTheme(draft.theme)
    try {
      await library.saveSettings(nextSettings)
      draftTouchedRef.current = false
      setDraftTouched(false)
      setPendingBackupImport(undefined)
      setApplyBackupImportSettings(false)
      setPrivateTaxonomyUndoItems([])
      clearSettingsImportRollback()
      setDeletedPrivateItemsUndo(undefined)
      setSettingsUndo(previousSettings)
      setStatus('Ajustes guardados')
      onActivity({
        detail: `${themeLabels[draft.theme]} / ${typeLabels[draft.explorerDefaultType]}`,
        label: 'Ajustes guardados',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setTheme(previousSettings.theme)
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron guardar los ajustes.')
    } finally {
      setSettingsSavePending(false)
    }
  }, [clearSettingsImportRollback, draft.explorerDefaultType, draft.theme, draftBlockedTags, draftFavoriteGenres, draftFavoriteTags, library, onActivity, setTheme, settingsSavePending, theme])

  useEffect(() => {
    if (!saveRequest || handledSaveRequestId.current === saveRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSaveRequestId.current === saveRequest.requestId) return

      handledSaveRequestId.current = saveRequest.requestId
      void saveSettings().finally(onSaveRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onSaveRequestHandled, saveRequest, saveSettings])

  async function undoSettingsSave() {
    if (!settingsUndo) return

    const previousSettings = settingsUndo
    setTheme(previousSettings.theme)
    try {
      await library.saveSettings(previousSettings)
      setDraft(settingsDraftFromSettings(previousSettings))
      draftTouchedRef.current = false
      setDraftTouched(false)
      setSettingsUndo(undefined)
      setPendingBackupImport(undefined)
      setApplyBackupImportSettings(false)
      setPrivateTaxonomyUndoItems([])
      clearSettingsImportRollback()
      setDeletedPrivateItemsUndo(undefined)
      setStatus('Ajustes recuperados')
      onActivity({
        detail: `${themeLabels[previousSettings.theme]} / ${typeLabels[previousSettings.explorerDefaultType]}`,
        label: 'Ajustes recuperados',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron recuperar los ajustes.')
    }
  }

  async function copyUserId() {
    if (!user) return
    await navigator.clipboard?.writeText(user.uid)
    setStatus('UID copiado')
  }

  function toggleOfflinePersistence(enabled: boolean) {
    setFirestoreOfflinePersistenceEnabled(enabled)
    setOfflinePersistenceState(enabled)
    setStatus(enabled ? 'Biblioteca offline activada. Recarga Nexo para aplicarlo.' : 'Biblioteca offline desactivada para este dispositivo.')
  }

  async function clearOfflinePersistence() {
    setStatus('Limpiando cache offline...')
    try {
      setFirestoreOfflinePersistenceEnabled(false)
      setOfflinePersistenceState(false)
      const { clearPersistedFirestoreCache } = await import('../services/firebaseDb')
      await clearPersistedFirestoreCache()
      setStatus('Cache offline limpiada. Recarga Nexo para abrir una sesion limpia.')
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo limpiar la cache offline.')
    }
  }

  async function toggleUpdateDebugNotifications(enabled: boolean) {
    setStatus(enabled ? 'Activando notificaciones debug...' : 'Desactivando notificaciones debug...')
    try {
      const nextState = await setNotificationIntentEnabled('app_update_debug', enabled)
      setNotificationIntentState(nextState)
      setStatus(getNotificationActionStatus(nextState, enabled))
    } catch (reason) {
      setNotificationIntentState(getNotificationIntentState('app_update_debug'))
      setStatus(reason instanceof Error ? reason.message : 'No se pudo cambiar la notificacion debug.')
    }
  }

  function exportPrivateBackup() {
    downloadLibraryBackup(library.items, library.settings, 'nexo-backup')
    setStatus('Backup JSON descargado')
    onActivity({
      detail: `${library.items.length} entradas exportadas`,
      label: 'Backup privado exportado',
      tab: 'settings',
      tone: 'success',
    })
  }

  async function preparePrivateBackupImport(file?: File) {
    if (!file) return

    setStatus('Preparando backup JSON...')
    try {
      assertLibraryImportFileLimit(file)
      const payload = parseLibraryImportPayload(JSON.parse(await file.text()))
      const summary = getLibraryImportSummary(payload, library.items)
      setPrivateTaxonomyUndoItems([])
      clearSettingsImportRollback()
      setDeletedPrivateItemsUndo(undefined)
      setPendingBackupImport({ fileName: file.name, payload, summary })
      setApplyBackupImportSettings(Boolean(payload.settings))
      setStatus(`Backup preparado: ${formatBackupImportSummary(summary)}`)
    } catch (reason) {
      setPendingBackupImport(undefined)
      setApplyBackupImportSettings(false)
      setStatus(reason instanceof Error ? reason.message : 'No se pudo importar el backup.')
    }
  }

  async function applyPrivateBackupImport() {
    if (!pendingBackupImport) return
    const importSessionToken = backupImportSessionToken

    setStatus('Importando backup JSON...')
    try {
      const { payload, summary } = pendingBackupImport
      const shouldApplySettings = applyBackupImportSettings && Boolean(payload.settings)
      const payloadToApply: ParsedLibraryImport = shouldApplySettings ? payload : { ...payload, settings: undefined }
      assertLibraryImportItemLimit(payloadToApply.items.length)
      const rollbackPlan = getLibraryImportRollbackPlan(payloadToApply, library.items, library.settings)
      persistLibraryImportRollback('backup', sessionKey, rollbackPlan)
      setSettingsImportUndo(rollbackPlan)

      for (const item of payload.items) {
        if (!isBackupImportSessionActive(importSessionToken)) return
        await library.saveItem(item)
        if (!isBackupImportSessionActive(importSessionToken)) return
      }
      if (shouldApplySettings && payload.settings) {
        if (!isBackupImportSessionActive(importSessionToken)) return
        await library.saveSettings(payload.settings)
        if (!isBackupImportSessionActive(importSessionToken)) return
        setTheme(payload.settings.theme)
        setDraft(settingsDraftFromSettings(payload.settings))
        draftTouchedRef.current = false
        setDraftTouched(false)
        setSettingsUndo(undefined)
      }
      setPrivateTaxonomyUndoItems([])
      setSettingsUndo(undefined)
      setDeletedPrivateItemsUndo(undefined)
      setStatus(
        shouldApplySettings
          ? `Importadas ${summary.totalItems} entradas y ajustes desde backup`
          : `Importadas ${summary.totalItems} entradas desde backup`,
      )
      onActivity({
        detail: shouldApplySettings ? `${summary.totalItems} entradas y ajustes` : `${summary.totalItems} entradas`,
        label: 'Backup privado aplicado',
        tab: 'settings',
        tone: 'success',
      })
      setPendingBackupImport(undefined)
      setApplyBackupImportSettings(false)
    } catch (reason) {
      if (!isBackupImportSessionActive(importSessionToken)) return
      setStatus(reason instanceof Error ? reason.message : 'No se pudo importar el backup.')
    }
  }

  function isBackupImportSessionActive(importSessionToken: symbol) {
    return activeBackupImportSessionRef.current === importSessionToken
  }

  function cancelPrivateBackupImport() {
    setPendingBackupImport(undefined)
    setApplyBackupImportSettings(false)
    setStatus('Importacion de backup cancelada')
  }

  async function undoSettingsImport() {
    if (!settingsImportUndo) return

    setStatus('Deshaciendo importacion privada...')
    try {
      for (const id of settingsImportUndo.newItemIds) {
        await library.deleteItem(id)
      }
      for (const item of settingsImportUndo.previousItems) {
        await library.saveItem(item)
      }
      if (settingsImportUndo.previousSettings) {
        await library.saveSettings(settingsImportUndo.previousSettings)
        setTheme(settingsImportUndo.previousSettings.theme)
        setDraft(settingsDraftFromSettings(settingsImportUndo.previousSettings))
        draftTouchedRef.current = false
        setDraftTouched(false)
      }
      clearSettingsImportRollback()
      setApplyBackupImportSettings(false)
      setPrivateTaxonomyUndoItems([])
      setDeletedPrivateItemsUndo(undefined)
      setStatus(formatLibraryImportRollbackStatus(settingsImportUndo))
      onActivity({
        detail: formatLibraryImportRollbackDetail(settingsImportUndo),
        label: 'Importacion privada deshecha',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer el backup.')
    }
  }

  async function savePrivateItemFromSettings(item: ListItem) {
    await library.saveItem(item)
    setEditingItem(undefined)
    setPrivateTaxonomyUndoItems([])
    clearSettingsImportRollback()
    setDeletedPrivateItemsUndo(undefined)
    setStatus(`${item.title || 'Entrada'} guardada`)
    onActivity({
      detail: item.title || 'Entrada sin titulo',
      label: 'Ficha guardada',
      tab: 'settings',
      target: { kind: 'item', id: item.id },
      tone: 'success',
    })
  }

  async function deletePrivateItemFromSettings(item: ListItem) {
    try {
      await library.deleteItem(item.id)
      setEditingItem(undefined)
      setPrivateTaxonomyUndoItems([])
      clearSettingsImportRollback()
      setStatus(`${item.title || 'Entrada'} eliminada de Biblioteca.`)
      onActivity({
        detail: item.title || 'Entrada sin titulo',
        label: 'Entrada eliminada',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo borrar la entrada.')
    }
  }

  const repairPrivateTaxonomy = useCallback(async () => {
    if (!privateTaxonomyRepairs.length) {
      setStatus('No hay taxonomia privada que completar')
      return
    }

    try {
      for (const entry of privateTaxonomyRepairs) {
        await library.saveItem(entry.repair.item)
      }
      setPendingBackupImport(undefined)
      setSettingsUndo(undefined)
      setPrivateTaxonomyUndoItems(privateTaxonomyRepairs.map((entry) => entry.original))
      clearSettingsImportRollback()
      setDeletedPrivateItemsUndo(undefined)
      setStatus(
        `Taxonomia privada completada en ${privateTaxonomyRepairs.length} ficha${privateTaxonomyRepairs.length === 1 ? '' : 's'}`,
      )
      onActivity({
        detail: `${privateTaxonomyRepairs.length} ficha${privateTaxonomyRepairs.length === 1 ? '' : 's'} privadas`,
        label: 'Taxonomia privada completada',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo completar la taxonomia privada.')
    }
  }, [clearSettingsImportRollback, library, onActivity, privateTaxonomyRepairs])

  useEffect(() => {
    if (!taxonomyRepairRequest || handledTaxonomyRepairRequestId.current === taxonomyRepairRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledTaxonomyRepairRequestId.current === taxonomyRepairRequest.requestId) return

      handledTaxonomyRepairRequestId.current = taxonomyRepairRequest.requestId
      void repairPrivateTaxonomy().finally(onTaxonomyRepairRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onTaxonomyRepairRequestHandled, repairPrivateTaxonomy, taxonomyRepairRequest])

  async function undoPrivateTaxonomyRepair() {
    if (!privateTaxonomyUndoItems.length) return

    try {
      for (const item of privateTaxonomyUndoItems) {
        await library.saveItem(item)
      }
      setPrivateTaxonomyUndoItems([])
      setStatus(
        privateTaxonomyUndoItems.length === 1
          ? 'Taxonomia privada recuperada en 1 ficha'
          : `Taxonomia privada recuperada en ${privateTaxonomyUndoItems.length} fichas`,
      )
      onActivity({
        detail: `${privateTaxonomyUndoItems.length} ficha${privateTaxonomyUndoItems.length === 1 ? '' : 's'} privadas`,
        label: 'Taxonomia privada recuperada',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer la taxonomia privada.')
    }
  }

  async function deleteAllPrivateItemsFromSettings() {
    const deletedItems = library.items.map((item) => ({ ...item }))
    const previousRoadmap = cloneUserSettings(library.settings).roadmap
    if (!deletedItems.length) {
      setDeleteAllDialogOpen(false)
      setDeleteAllConfirmText('')
      setStatus('No hay entradas privadas que borrar')
      return
    }

    setStatus('Borrando entradas privadas...')
    try {
      const result = await library.deleteAllItems()
      const deletedIds = new Set(result.deletedItemIds)
      const itemsActuallyDeleted = deletedItems.filter((item) => deletedIds.has(item.id))
      if (itemsActuallyDeleted.length) {
        setDeletedPrivateItemsUndo({ items: itemsActuallyDeleted, roadmap: previousRoadmap })
      }
      setDeleteAllDialogOpen(false)
      setDeleteAllConfirmText('')

      if (!result.complete) {
        setStatus(`${result.error ?? `Borrado interrumpido: ${itemsActuallyDeleted.length} de ${result.total} entradas eliminadas.`} Puedes deshacer lo ya borrado.`)
        onActivity({
          detail: `${itemsActuallyDeleted.length} de ${result.total} entradas eliminadas`,
          label: 'Borrado privado incompleto',
          tab: 'settings',
          tone: 'danger',
        })
        return
      }

      setPendingBackupImport(undefined)
      setApplyBackupImportSettings(false)
      setSettingsUndo(undefined)
      setPrivateTaxonomyUndoItems([])
      clearSettingsImportRollback()
      setStatus('Tus entradas privadas han sido borradas')
      onActivity({
        detail: `${deletedItems.length} entradas eliminadas`,
        label: 'Entradas privadas borradas',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron borrar las entradas privadas.')
    }
  }

  async function undoDeleteAllPrivateItemsFromSettings() {
    if (!deletedPrivateItemsUndo?.items.length) return

    const pendingUndo = deletedPrivateItemsUndo
    const itemsToRestore = pendingUndo.items
    setStatus('Restaurando entradas privadas...')
    try {
      for (const item of itemsToRestore) {
        await library.saveItem(item)
      }
      await library.saveSettings({ roadmap: pendingUndo.roadmap })
      setDeletedPrivateItemsUndo(undefined)
      setStatus(`${itemsToRestore.length} entradas recuperadas en Biblioteca`)
      onActivity({
        detail: `${itemsToRestore.length} entradas restauradas`,
        label: 'Entradas privadas recuperadas',
        tab: 'settings',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron recuperar las entradas privadas.')
    }
  }

  const privateDataActions: PrivateDataAction[] = [
    privateTaxonomyRepairs.length
      ? {
          detail: `${privateTaxonomyRepairs.length} con plantillas seguras`,
          Icon: Sparkles,
          id: 'repair-taxonomy',
          label: 'Completar taxonomia',
          onClick: () => void repairPrivateTaxonomy(),
          primary: true,
        }
      : firstMissingTaxonomyItem
      ? {
          detail: firstMissingTaxonomyItem.title,
          Icon: Info,
          id: 'taxonomy',
          label: 'Afinar ficha',
          onClick: () => setEditingItem(firstMissingTaxonomyItem),
          primary: true,
        }
      : library.items.length === 0
        ? {
            detail: 'Abrir Biblioteca',
            Icon: Plus,
            id: 'library',
            label: 'Crear entrada',
            onClick: () => onNavigate('library'),
            primary: true,
          }
        : {
            detail: privateDataHealth.diceReadyCount
              ? `${privateDataHealth.diceReadyCount} candidatas disponibles`
              : 'Sin candidatas listas',
            Icon: Dice5,
            id: 'dice',
            label: privateDataHealth.diceReadyCount ? 'Tirar dado' : 'Revisar dado',
            onClick: privateDataHealth.diceReadyCount ? onRollDice : () => onNavigate('dice'),
            primary: true,
          },
    queuedDiscoveryCount
      ? {
          detail: `${queuedDiscoveryCount} hallazgos pendientes`,
          Icon: Sparkles,
          id: 'explorer',
          label: 'Decidir cola',
          onClick: () => onNavigate('discover'),
        }
      : {
          detail: 'Buscar en Nexo y APIs',
          Icon: Search,
          id: 'explorer',
          label: 'Explorar catalogo',
          onClick: () => onNavigate('discover'),
        },
    {
      detail: 'Descargar copia privada',
      Icon: Download,
      id: 'backup',
      label: 'Backup JSON',
      onClick: exportPrivateBackup,
    },
    {
      danger: true,
      detail: library.items.length ? `${library.items.length} entradas privadas` : 'Sin entradas privadas',
      disabled: library.items.length === 0,
      Icon: Trash2,
      id: 'delete-all',
      label: 'Borrar entradas',
      onClick: () => {
        setDeleteAllConfirmText('')
        setDeleteAllDialogOpen(true)
      },
    },
  ]

  return (
    <section className="settings-grid">
      <form
        className="workspace-panel settings-panel"
        onSubmit={(event) => {
          event.preventDefault()
          void saveSettings()
        }}
      >
        <div className="panel-heading">
          <div>
            <h2>Tu Nexo</h2>
            <p>Tema, descubrimiento y privacidad sin ruido.</p>
          </div>
          <button className="primary-button" disabled={!hasUnsavedChanges || settingsSavePending} type="submit">
            <Save size={17} />
            {settingsSavePending ? 'Guardando...' : hasUnsavedChanges ? 'Guardar cambios' : 'Guardado'}
          </button>
        </div>

        <div className={hasUnsavedChanges ? 'settings-status pending' : 'settings-status'}>
          <span>{hasUnsavedChanges ? 'Ajustes sin guardar' : 'Sin cambios pendientes'}</span>
          <strong>{typeLabels[draft.explorerDefaultType]}</strong>
        </div>

        <section className="settings-theme-stage" aria-label="Apariencia de Nexo" data-testid="settings-theme-stage">
          <div className="settings-theme-preview">
            <div>
              <span className="eyebrow">Apariencia</span>
              <h3>{draftThemeOption.label}</h3>
              <p>{draftThemeOption.detail}</p>
            </div>
            <span className="settings-theme-preview-swatch" aria-hidden="true">
              {draftThemeOption.swatches.map((swatch) => (
                <span key={swatch} style={{ background: swatch }} />
              ))}
            </span>
          </div>
          <div className="settings-theme-picker">
            <div className="settings-section-heading">
              <h3>Tema de Nexo</h3>
              <p>Elige el tono que quieres recordar.</p>
            </div>
            <div className="theme-option-grid" role="group" aria-label="Tema">
              {themeOptions.map((option) => (
                <button
                  aria-label={`Tema ${option.label}`}
                  className={draft.theme === option.id ? 'theme-option active' : 'theme-option'}
                  key={option.id}
                  type="button"
                  onClick={() => updateDraft((current) => ({ ...current, theme: option.id }))}
                >
                  <span className="theme-swatch" aria-hidden="true">
                    {option.swatches.map((swatch) => (
                      <span key={swatch} style={{ background: swatch }} />
                    ))}
                  </span>
                  <span className="theme-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </span>
                  {draft.theme === option.id && (
                    <span className="theme-option-status" aria-hidden="true">
                      <Check size={13} />
                      Actual
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-confidence-panel" aria-label="Estado de cuenta y datos" data-testid="settings-confidence">
          <div className="settings-confidence-main">
            <span className="account-avatar small">{accountInitial}</span>
            <div>
              <span className="eyebrow">Estado de cuenta</span>
              <strong>{hasUnsavedChanges ? 'Ajustes pendientes' : 'Cuenta lista'}</strong>
              <p>{hasUnsavedChanges ? 'Guarda los cambios para que Dado y Explorador usen esta configuracion.' : 'Preferencias, rol y biblioteca privada estan sincronizados.'}</p>
            </div>
          </div>
          <div className="settings-confidence-facts">
            <span>
              <strong>{roleLabels[library.userRole]}</strong>
              Rol
            </span>
            <span>
              <strong>{themeLabels[draft.theme]}</strong>
              Tema
            </span>
            <span>
              <strong>{library.items.length}</strong>
              Entradas
            </span>
            <span>
              <strong>{queuedDiscoveryCount}</strong>
              Cola
            </span>
          </div>
          {hasUnsavedChanges ? (
            <div className="settings-confidence-actions">
              <span className="settings-pending-badge">Cambios pendientes</span>
              <button className="secondary-button" type="submit">
                <Save size={16} />
                Guardar ajustes
              </button>
            </div>
          ) : (
            <span className="settings-confidence-rest">
              <CheckCircle2 size={16} />
              Sin acciones urgentes
            </span>
          )}
        </section>

        <div className="settings-overview" aria-label="Resumen de ajustes">
          <MetricCard label="Favoritos" value={draftFavoriteGenres.length + draftFavoriteTags.length} />
          <MetricCard label="Bloqueados" value={draftBlockedTags.length} />
          <MetricCard label="Explorador" value={typeLabels[draft.explorerDefaultType]} />
        </div>

        <div className="settings-section">
          <h3>Explorador</h3>
          <label>
            Tipo por defecto
            <select
              value={draft.explorerDefaultType}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  explorerDefaultType: event.target.value as ExplorerSearchType,
                }))
              }
            >
              <option value="watch">Ver</option>
              <option value="any">Todo</option>
              <option value="game">Juego</option>
              <option value="book">Libro</option>
              <option value="anime">Anime</option>
              <option value="manga">Manga</option>
              <option value="manhwa">Manhwa</option>
            </select>
          </label>
        </div>

        <details className="settings-section settings-taste-panel" data-close-on-outside>
          <summary>
            <span>
              <strong>Preferencias del dado</strong>
              <small>Tags, generos y bloqueos personales</small>
            </span>
            <em>{tasteSummary}</em>
          </summary>
          <div className="settings-taste-content">
            <label>
              Tags favoritos
              <input value={draft.favoriteTags} onChange={(event) => updateDraft((current) => ({ ...current, favoriteTags: event.target.value }))} />
            </label>
            <label>
              Generos favoritos
              <input value={draft.favoriteGenres} onChange={(event) => updateDraft((current) => ({ ...current, favoriteGenres: event.target.value }))} />
            </label>
            <label>
              Senales bloqueadas
              <input value={draft.blockedTags} onChange={(event) => updateDraft((current) => ({ ...current, blockedTags: event.target.value }))} />
            </label>
            {visibleTasteSuggestions.length > 0 && (
              <div className="taste-suggestions" aria-label="Sugerencias de gusto" data-testid="taste-suggestions">
                <div className="taste-suggestions-heading">
                  <div>
                    <strong>Sugerencias de gusto</strong>
                    <span>Desde completadas con rating alto</span>
                  </div>
                  {pendingTasteSuggestions.length > 0 && (
                    <button className="secondary-button" type="button" onClick={applyTasteSuggestions}>
                      <Sparkles size={15} />
                      Aplicar sugerencias
                    </button>
                  )}
                </div>
                <div className="taste-suggestion-row">
                  {visibleTasteSuggestions.map((suggestion) => {
                    const suggestionKey = `${suggestion.kind}:${normalizeKey(suggestion.label)}`
                    const isApplied = !pendingTasteSuggestions.some(
                      (pending) => pending.kind === suggestion.kind && normalizeKey(pending.label) === normalizeKey(suggestion.label),
                    )
                    const suggestionKindLabel = suggestion.kind === 'genre' ? 'Genero' : 'Tag'

                    return (
                      <button
                        aria-label={`${isApplied ? 'Sugerencia aplicada' : 'Anadir'} ${suggestionKindLabel.toLowerCase()} ${suggestion.label}`}
                        className={isApplied ? 'taste-suggestion-chip applied' : 'taste-suggestion-chip'}
                        disabled={isApplied}
                        key={suggestionKey}
                        type="button"
                        onClick={() => applyTasteSuggestion(suggestion)}
                      >
                        <span>{suggestionKindLabel}</span>
                        <strong>{suggestion.label}</strong>
                        <small>{suggestion.sourceCount}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </details>

        {(personalTasteCount > 0 || draftBlockedTags.length > 0) && (
          <div className="preference-preview" aria-label="Resumen de preferencias">
            <PreferencePreview label="Favoritos" values={[...draftFavoriteGenres, ...draftFavoriteTags]} />
            <PreferencePreview label="Bloqueados" values={draftBlockedTags} tone="danger" />
          </div>
        )}

        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
        {(settingsUndo || privateTaxonomyUndoItems.length > 0 || settingsImportUndo || deletedPrivateItemsUndo) &&
          !hasUnsavedChanges && (
          <div className="feedback-action-row" aria-label="Accion reciente de ajustes">
            {settingsImportUndo && (
              <button className="secondary-button" type="button" onClick={() => void undoSettingsImport()}>
                <RotateCcw size={16} />
                Deshacer importacion
              </button>
            )}
            {settingsUndo && (
              <button className="secondary-button" type="button" onClick={() => void undoSettingsSave()}>
                <RotateCcw size={16} />
                Deshacer ajustes
              </button>
            )}
            {privateTaxonomyUndoItems.length > 0 && (
              <button className="secondary-button" type="button" onClick={() => void undoPrivateTaxonomyRepair()}>
                <RotateCcw size={16} />
                Deshacer taxonomia
              </button>
            )}
            {deletedPrivateItemsUndo && (
              <button className="secondary-button" type="button" onClick={() => void undoDeleteAllPrivateItemsFromSettings()}>
                <RotateCcw size={16} />
                Deshacer borrado total
              </button>
            )}
          </div>
        )}
      </form>

      <div className="settings-side">
        <details className="workspace-panel settings-drawer" data-close-on-outside data-testid="settings-account-drawer">
          <summary>
            <span>
              <strong>Cuenta</strong>
              <small>{user?.email ?? 'Sesion activa'}</small>
            </span>
            <em>{roleLabels[library.userRole]}</em>
          </summary>
          <div className="settings-drawer-body">
            <div className="panel-heading compact">
              <div>
                <h2>Cuenta</h2>
                <p className="muted-line">{user?.email ?? 'Sesion activa'}</p>
              </div>
              <span className={library.isModerator ? 'mode-pill moderator' : 'mode-pill'}>
                {roleLabels[library.userRole]}
              </span>
            </div>
            <div className="account-card">
              <span className="account-avatar">{accountInitial}</span>
              <div>
                <strong>{accountLabel}</strong>
                <span>{library.isModerator ? 'Puede curar catalogo publico' : 'Biblioteca privada activa'}</span>
              </div>
            </div>
            <div className="account-panel">
              <label>
                Email
                <input readOnly value={user?.email ?? 'Sin email'} />
              </label>
              <label>
                UID
                <div className="inline-control">
                  <input readOnly value={user?.uid ?? 'Demo local'} />
                  <button
                    aria-label="Copiar UID de usuario"
                    className="icon-button"
                    disabled={!user}
                    type="button"
                    onClick={copyUserId}
                    title="Copiar UID"
                  >
                    <Copy size={17} />
                  </button>
                </div>
              </label>
            </div>
          </div>
        </details>

        {library.userRole === 'admin' && (
          <details className="workspace-panel settings-drawer settings-roles-drawer" data-close-on-outside data-testid="settings-roles-drawer">
            <summary>
              <span>
                <strong>Roles</strong>
                <small>{library.userProfiles.length ? `${library.userProfiles.length} perfiles con acceso` : 'Sin perfiles cargados'}</small>
              </span>
              <em>Admin</em>
            </summary>
            <AdminRolesPanel
              currentUserId={user?.uid}
              embedded
              onActivity={onActivity}
              onRoleChange={library.updateUserRole}
              profiles={library.userProfiles}
            />
          </details>
        )}

        <details className="workspace-panel settings-drawer private-data-panel" data-close-on-outside data-testid="settings-private-data-drawer">
          <summary>
            <span>
              <strong>Datos privados</strong>
              <small>Backup JSON / {library.items.length} entradas</small>
            </span>
            <em>JSON v1</em>
          </summary>
          <div className="settings-drawer-body">
          <div className="panel-heading compact">
            <div>
              <h2>Datos privados</h2>
              <p className="muted-line">Backup y estado de tu biblioteca personal.</p>
            </div>
            <span className="mode-pill">JSON v1</span>
          </div>
          <div className="data-health-grid" aria-label="Estado de datos privados">
            <div>
              <span>Biblioteca</span>
              <strong>{library.items.length}</strong>
              <small>entradas privadas</small>
            </div>
            <div>
              <span>Cola</span>
              <strong>{queuedDiscoveryCount}</strong>
              <small>hallazgos pendientes</small>
            </div>
            <div>
              <span>Historial</span>
              <strong>{resolvedDiscoveryCount}</strong>
              <small>guardados o descartados</small>
            </div>
            <div>
              <span>Sync</span>
              <strong>{syncStatusLabel}</strong>
              <small>
                {library.syncState.pendingWriteCount
                  ? `${library.syncState.pendingWriteCount} pendientes`
                  : library.syncState.lastSyncedAt
                    ? 'sin pendientes'
                    : 'sin actividad'}
              </small>
            </div>
          </div>
          <section className="private-health-card" aria-label="PWA y cache local" data-testid="pwa-local-controls">
            <div className="private-health-header">
              <div>
                <span className="eyebrow">PWA local</span>
                <strong>{offlinePersistenceEnabled ? 'Biblioteca offline activa' : 'Biblioteca online'}</strong>
                <p>{library.syncState.hasPendingWrites ? 'Hay cambios locales pendientes de sincronizar.' : 'Controla que se guarda en este dispositivo.'}</p>
              </div>
              <span className={library.syncState.hasPendingWrites ? 'mode-pill warning' : 'mode-pill'}>
                {syncStatusLabel}
              </span>
            </div>
            <label className="check-row">
              <input
                checked={offlinePersistenceEnabled}
                type="checkbox"
                onChange={(event) => toggleOfflinePersistence(event.target.checked)}
              />
              Activar biblioteca offline en este dispositivo
            </label>
            <div className="action-row end">
              <button className="secondary-button" type="button" onClick={() => void clearOfflinePersistence()}>
                <Trash2 size={16} />
                Limpiar cache local
              </button>
            </div>
          </section>
          <section className="private-health-card" aria-label="Salud de datos privados" data-testid="private-data-health">
            <div className="private-health-header">
              <div>
                <span className="eyebrow">Salud de datos</span>
                <strong>{privateDataHealth.summaryLabel}</strong>
                <p>{privateDataHealth.summaryCopy}</p>
              </div>
              <span className={privateDataHealth.needsAttention ? 'mode-pill warning' : 'mode-pill moderator'}>
                {privateDataHealth.needsAttention ? 'Revisar' : 'Lista'}
              </span>
            </div>
            <div
              aria-label={`Cobertura de taxonomia ${privateDataHealth.taxonomyCoveragePercent}%`}
              className="private-health-meter"
              role="meter"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={privateDataHealth.taxonomyCoveragePercent}
            >
              <span style={{ width: `${privateDataHealth.taxonomyCoveragePercent}%` }} />
            </div>
            <div className="private-health-signals">
              <div>
                <span>Taxonomia</span>
                <strong>
                  {privateDataHealth.taxonomyReadyCount}/{privateDataHealth.totalItems}
                </strong>
                <small>
                  {privateDataHealth.missingTaxonomyCount
                    ? `${privateDataHealth.missingTaxonomyCount} sin generos/tags`
                    : 'Dado entiende el tono'}
                </small>
              </div>
              <div>
                <span>Catalogo Nexo</span>
                <strong>{privateDataHealth.publicCopyCount}</strong>
                <small>copias con snapshot publico</small>
              </div>
              <div>
                <span>Dado</span>
                <strong>{privateDataHealth.diceReadyCount}</strong>
                <small>{privateDataHealth.cooldownCount ? `${privateDataHealth.cooldownCount} en cooldown` : 'candidatos disponibles'}</small>
              </div>
            </div>
            <div className="private-health-review" aria-label="Revisiones sugeridas">
              {privateDataHealth.reviewItems.map((item) => (
                <div className={item.tone === 'good' ? 'private-health-review-item good' : 'private-health-review-item'} key={item.label}>
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="private-action-plan" aria-label="Plan de mantenimiento privado" data-testid="private-action-plan">
            <div className="private-action-plan-heading">
              <div>
                <span className="eyebrow">Plan de mantenimiento</span>
                <strong>{privateDataHealth.needsAttention ? 'Resolver pendientes privados' : 'Mantener Nexo listo'}</strong>
                <p>
                  {privateDataHealth.needsAttention
                    ? 'Ataja la primera mejora util sin salir de tus datos privados.'
                    : 'Accesos directos para decidir, explorar y guardar copia.'}
                </p>
              </div>
            </div>
            <div className="private-action-list">
              {privateDataActions.map((action) => {
                const Icon = action.Icon
                const actionClassName = [
                  'private-action-item',
                  action.primary ? 'primary' : undefined,
                  action.danger ? 'danger' : undefined,
                ].filter(Boolean).join(' ')
                return (
                  <button
                    className={actionClassName}
                    disabled={action.disabled}
                    key={action.id}
                    type="button"
                    onClick={action.onClick}
                  >
                    <Icon size={16} />
                    <span>
                      <strong>{action.label}</strong>
                      <small>{action.detail}</small>
                    </span>
                  </button>
                )
              })}
              <label className="private-action-item private-import-item">
                <Upload size={16} />
                <span>
                  <strong>Importar backup</strong>
                  <small>JSON v1 · max. 10 MB / 5.000 entradas</small>
                </span>
                <input
                  accept="application/json,.json"
                  aria-label="Importar backup JSON"
                  type="file"
                  onChange={(event) => {
                    void preparePrivateBackupImport(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
              </label>
            </div>
            {pendingBackupImport && (
              <div className="backup-import-preview" aria-label="Backup preparado">
                <div>
                  <strong>{pendingBackupImport.fileName}</strong>
                  <span>{formatBackupImportSummary(pendingBackupImport.summary)}</span>
                  <small>{pendingBackupImport.summary.totalItems} entradas revisadas antes de aplicar</small>
                </div>
                {pendingBackupImport.summary.settingsIncluded && (
                  <label className="check-row">
                    <input
                      checked={applyBackupImportSettings}
                      type="checkbox"
                      onChange={(event) => setApplyBackupImportSettings(event.target.checked)}
                    />
                    Aplicar ajustes del backup
                  </label>
                )}
                <div className="action-row end">
                  <button className="ghost-button" type="button" onClick={cancelPrivateBackupImport}>
                    <X size={16} />
                    Cancelar
                  </button>
                  <button className="primary-button" type="button" onClick={() => void applyPrivateBackupImport()}>
                    <Upload size={16} />
                    Aplicar backup
                  </button>
                </div>
              </div>
            )}
          </section>
          <div className="data-safety-note">
            <ShieldCheck size={17} />
            <span>Tus notas, ratings, progreso y pesos viven bajo tu usuario. El catalogo Nexo no recibe esos cambios privados.</span>
          </div>
          <button className="secondary-button data-backup-button" type="button" onClick={exportPrivateBackup}>
            <Archive size={17} />
            Exportar backup JSON
          </button>
          </div>
        </details>

        <details className="workspace-panel settings-drawer" data-close-on-outside data-testid="settings-beta-drawer">
          <summary>
            <span>
              <strong>Beta suave</strong>
              <small>Privacidad y catalogo compartido</small>
            </span>
            <em>Info</em>
          </summary>
          <div className="settings-drawer-body">
            <h2>Beta suave</h2>
            <p className="muted-line">Google login abre una biblioteca privada por usuario. El catalogo Nexo es comun, pero solo moderadores lo editan.</p>
            <div className="release-list">
              <span>Firestore privado por usuario</span>
              <span>Catalogo publico curado</span>
              <span>Export JSON schemaVersion 1</span>
            </div>
            <section className="private-health-card" aria-label="Notificaciones debug" data-testid="notification-debug-controls">
              <div className="private-health-header">
                <div>
                  <span className="eyebrow">Notificaciones</span>
                  <strong>{notificationStatusLabel}</strong>
                  <p>Debug local para avisar cuando haya una actualizacion lista.</p>
                </div>
                <span className={notificationIntentState.enabled ? 'mode-pill moderator' : 'mode-pill'}>
                  {notificationIntentState.permission}
                </span>
              </div>
              <label className="check-row">
                <input
                  checked={notificationIntentState.enabled}
                  disabled={!notificationIntentState.supported || notificationIntentState.permission === 'denied'}
                  type="checkbox"
                  onChange={(event) => void toggleUpdateDebugNotifications(event.target.checked)}
                />
                Notificacion debug de actualizacion
              </label>
              <div className="data-safety-note">
                <Bell size={17} />
                <span>Sin push remoto, sin tokens y sin recordatorios de producto.</span>
              </div>
            </section>
          </div>
        </details>
      </div>

      {deleteAllDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <DialogFocusReturn />
          <form
            aria-labelledby="settings-delete-all-title"
            aria-modal="true"
            className="confirm-dialog"
            role="dialog"
            onKeyDown={(event) =>
              handleDialogKeyDown(event, () => {
                setDeleteAllDialogOpen(false)
                setDeleteAllConfirmText('')
              })
            }
            onSubmit={(event) => {
              event.preventDefault()
              if (deleteAllConfirmText === 'BORRAR') void deleteAllPrivateItemsFromSettings()
            }}
          >
            <div>
              <h2 id="settings-delete-all-title">Borrar entradas privadas</h2>
              <p>
                Esto elimina {library.items.length} entradas privadas de tu cuenta. Tus ajustes, cola, actividad y
                catalogo publico no cambian. Podras deshacerlo justo despues.
              </p>
            </div>
            <label>
              Confirmacion
              <input
                autoFocus
                value={deleteAllConfirmText}
                onChange={(event) => setDeleteAllConfirmText(event.target.value)}
                placeholder="BORRAR"
              />
            </label>
            <div className="action-row end">
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setDeleteAllDialogOpen(false)
                  setDeleteAllConfirmText('')
                }}
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                disabled={deleteAllConfirmText !== 'BORRAR' || library.items.length === 0}
                type="submit"
              >
                <Trash2 size={16} />
                Borrar entradas
              </button>
            </div>
          </form>
        </div>
      )}

      {editingItem && (
        <ItemEditor
          item={editingItem}
          onClose={() => setEditingItem(undefined)}
          onDelete={deletePrivateItemFromSettings}
          onSave={savePrivateItemFromSettings}
        />
      )}
    </section>
  )
}
