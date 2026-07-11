import './DiceTab.css'

import { DEFAULT_RECOMMENDATION_PREFERENCES, type ListItem, type RecommendationPreferences, type RecommendationResult } from '../domain/types'
import { getActiveDiceFilters, getDiceEligibilityBreakdown, getDiceScoreMeterWidth, getRecommendationLearningSignals, getRecommendationSessionPlan, diceIntensityLabels as intensityLabels } from '../lib/diceInsights'
import { isItemInCooldown, itemStatusLabels as statusLabels, itemTypeLabels as typeLabels } from '../lib/libraryItemInsights'
import { formatRecentRecommendationTime, getRecentRecommendationItems } from '../lib/privateDataInsights'
import { recommendItem, scoreCandidates } from '../lib/recommendations'
import { cloneRoadmapPreferences, createRoadmapUndoMutation, deriveRoadmap } from '../lib/roadmap'
import { normalizeKey, uniqueNormalizedValues } from '../lib/strings'
import { AlertTriangle, CheckCircle2, Dice5, Info, Library, LockKeyhole, Moon, Play, RotateCcw, Save, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CoverArt, DiceEligibilityPanel, EmptyState, FeedbackMessage, ItemEditor, ItemIdentity, PreferenceControls, RecommendationSessionPlanView, cloneRecommendationPreferences, dicePreferencePresets, feedbackToneFromText, getPosterBackplateStyle, sameRecommendationPreferences, typeIcons, type ActivityRecorder, type DiceCooldownReactivateRequest, type DiceDecisionSummary, type DicePreferencesSaveRequest, type DiceRecoveryAction, type DiceRollRequest, type DiceRollSummary, type DiceSettingsUndo, type DiceUndoAction, type LibrarySurface } from '../app/shared'

function getDiceFitLabel(score: number, maximum: number) {
  const ratio = maximum > 0 ? score / maximum : 0
  if (ratio >= 0.75) return 'Alto'
  if (ratio >= 0.45) return 'Medio'
  return 'Bajo'
}

export default function DiceTab({
  library,
  cooldownReactivateRequest,
  saveRequest,
  rollRequest,
  onActivity,
  onCooldownReactivateRequestHandled,
  onSaveRequestHandled,
  onRollRequestHandled,
  onRollSummaryChange,
  onUnsavedChange,
}: {
  library: LibrarySurface
  cooldownReactivateRequest?: DiceCooldownReactivateRequest
  saveRequest?: DicePreferencesSaveRequest
  rollRequest?: DiceRollRequest
  onActivity: ActivityRecorder
  onCooldownReactivateRequestHandled: () => void
  onSaveRequestHandled: () => void
  onRollRequestHandled: () => void
  onRollSummaryChange: (summary: DiceRollSummary) => void
  onUnsavedChange: (hasUnsavedChanges: boolean) => void
}) {
  const [draftPreferences, setDraftPreferences] = useState<RecommendationPreferences | undefined>()
  const [recommendation, setRecommendation] = useState<RecommendationResult | undefined>()
  const [editingDiceItem, setEditingDiceItem] = useState<ListItem | undefined>()
  const [isRolling, setIsRolling] = useState(false)
  const [showFullDicePool, setShowFullDicePool] = useState(false)
  const [status, setStatus] = useState<string | undefined>()
  const [diceUndoAction, setDiceUndoAction] = useState<DiceUndoAction | undefined>()
  const [diceSettingsUndo, setDiceSettingsUndo] = useState<DiceSettingsUndo | undefined>()
  const [diceDecisionSummary, setDiceDecisionSummary] = useState<DiceDecisionSummary | undefined>()
  const [lastRollScope, setLastRollScope] = useState<'roadmap-next' | 'all'>('all')
  const handledCooldownReactivateRequestId = useRef<number | undefined>(undefined)
  const handledSaveRequestId = useRef<number | undefined>(undefined)
  const handledRollRequestId = useRef<number | undefined>(undefined)
  const persistedPreferences = library.settings.recommendationPreferences ?? DEFAULT_RECOMMENDATION_PREFERENCES
  const preferences = draftPreferences ?? persistedPreferences
  const hasUnsavedDicePreferences = !sameRecommendationPreferences(preferences, persistedPreferences)
  const scoredCandidates = useMemo(
    () => scoreCandidates(library.items, preferences, library.settings),
    [library.items, library.settings, preferences],
  )
  const eligibilityBreakdown = useMemo(
    () => getDiceEligibilityBreakdown(library.items, preferences, library.settings),
    [library.items, library.settings, preferences],
  )
  const candidatePreview = showFullDicePool ? scoredCandidates : scoredCandidates.slice(0, 4)
  const hiddenCandidateCount = Math.max(0, scoredCandidates.length - candidatePreview.length)
  const maxCandidateScore = scoredCandidates[0]?.score ?? 1
  const topCandidate = scoredCandidates[0]
  const unavailableCount = Math.max(0, library.items.length - scoredCandidates.length)
  const poolSize = Math.min(scoredCandidates.length, Math.max(3, Math.ceil(3 + preferences.surprisePercent / 8)))
  const activeDiceFilters = getActiveDiceFilters(preferences, library.settings)
  const recentRecommendations = useMemo(() => getRecentRecommendationItems(library.items), [library.items])
  const recommendationLearningSignals = useMemo(
    () => (recommendation ? getRecommendationLearningSignals(recommendation.item, library.settings) : undefined),
    [library.settings, recommendation],
  )
  const activeDiceDecision =
    recommendation && diceDecisionSummary?.itemId === recommendation.item.id ? diceDecisionSummary : undefined
  const hasCandidates = scoredCandidates.length > 0
  const cooldownRecoveryItems = useMemo(
    () =>
      library.items.filter(
        (item) => item.status !== 'completed' && item.status !== 'dropped' && isItemInCooldown(item),
      ),
    [library.items],
  )

  useLayoutEffect(() => {
    onUnsavedChange(hasUnsavedDicePreferences)
    return () => onUnsavedChange(false)
  }, [hasUnsavedDicePreferences, onUnsavedChange])

  useEffect(() => {
    onRollSummaryChange({ candidateCount: scoredCandidates.length })
  }, [onRollSummaryChange, scoredCandidates.length])

  const diceRecoveryActions: DiceRecoveryAction[] = [
    ...(cooldownRecoveryItems.length
      ? [
          {
            detail: `${cooldownRecoveryItems.length} en cooldown`,
            Icon: RotateCcw,
            id: 'reactivate-cooldowns',
            label: 'Reactivar cooldowns',
            onClick: () => void reactivateDiceCooldowns(),
          },
        ]
      : []),
    {
      detail: 'Todo + pausados',
      Icon: RotateCcw,
      id: 'open-pool',
      label: 'Abrir abanico',
      onClick: () => setPreferences((current) => ({ ...current, includePaused: true, medium: 'any' })),
    },
    {
      detail: 'Sin limite de horas',
      Icon: X,
      id: 'clear-time',
      label: 'Quitar tiempo',
      onClick: () => setPreferences((current) => ({ ...current, timeBudgetHours: undefined })),
    },
    {
      detail: 'Preset raro',
      Icon: Sparkles,
      id: 'surprise',
      label: 'Sorpresa amplia',
      onClick: () => applyDicePreset(dicePreferencePresets.find((preset) => preset.id === 'weird-surprise')?.preferences ?? preferences),
    },
  ]
  const setPreferences = (
    update: RecommendationPreferences | ((current: RecommendationPreferences) => RecommendationPreferences),
  ) => {
    setStatus(undefined)
    setDiceUndoAction(undefined)
    setDiceSettingsUndo(undefined)
    setDiceDecisionSummary(undefined)
    setDraftPreferences((current) => (typeof update === 'function' ? update(current ?? preferences) : update))
  }

  function openDiceDecisionItem() {
    if (!recommendation) return
    setEditingDiceItem(library.items.find((item) => item.id === recommendation.item.id) ?? recommendation.item)
  }

  function getDiceSettingsUndo(kind: DiceSettingsUndo['kind']): DiceSettingsUndo {
    return {
      allowPausedByDefault: library.settings.allowPausedByDefault,
      favoriteGenres: [...library.settings.favoriteGenres],
      favoriteTags: [...library.settings.favoriteTags],
      kind,
      preferences: cloneRecommendationPreferences(persistedPreferences),
      surprisePercent: library.settings.surprisePercent,
    }
  }

  const rollRecommendation = useCallback(async (
    excludedItemId?: string,
    requestedScope: 'roadmap-next' | 'all' = 'all',
  ) => {
    const allRollItems = excludedItemId ? library.items.filter((item) => item.id !== excludedItemId) : library.items
    const roadmapNextIds = new Set(deriveRoadmap(library.items, library.settings.roadmap).next.map((entry) => entry.item.id))
    const scopedItems = requestedScope === 'roadmap-next'
      ? allRollItems.filter((item) => roadmapNextIds.has(item.id))
      : allRollItems
    const scopedCandidates = scoreCandidates(scopedItems, preferences, library.settings)
    const fellBackToAll = requestedScope === 'roadmap-next' && scopedCandidates.length === 0
    const rollItems = fellBackToAll ? allRollItems : scopedItems
    const rollCandidates = fellBackToAll ? scoreCandidates(allRollItems, preferences, library.settings) : scopedCandidates

    if (!rollCandidates.length) {
      setRecommendation(undefined)
      setDiceDecisionSummary(undefined)
      setStatus(
        excludedItemId
          ? 'No quedan candidatas distintas con estos filtros.'
          : 'No hay candidatas disponibles con estos filtros.',
      )
      return
    }

    setLastRollScope(fellBackToAll ? 'all' : requestedScope)
    setIsRolling(true)
    setStatus(
      fellBackToAll
        ? 'No habia candidatas disponibles en Despues; el Dado amplio la eleccion a toda tu biblioteca.'
        : requestedScope === 'roadmap-next'
          ? 'Eligiendo primero entre las obras de Despues.'
          : undefined,
    )
    setDiceUndoAction(undefined)
    setDiceSettingsUndo(undefined)
    setDiceDecisionSummary(undefined)
    setRecommendation(undefined)
    const next = recommendItem(
      rollItems,
      {
        ...preferences,
        seed: `${preferences.seed}-${Date.now()}`,
      },
      library.settings,
    )
    window.setTimeout(() => {
      setIsRolling(false)
      setRecommendation(next)
    }, 420)
    if (next) {
      await library.recordRecommendation(next.item.id, next.reasons)
      onActivity({
        detail: next.item.title,
        label: 'Tirada registrada',
        tab: 'dice',
        target: { kind: 'item', id: next.item.id },
        tone: 'success',
      })
    }
  }, [library, onActivity, preferences])

  async function rollAnotherRecommendation() {
    if (!recommendation) return
    await rollRecommendation(recommendation.item.id, lastRollScope)
  }

  const savePreferences = useCallback(async () => {
    if (!hasUnsavedDicePreferences) return

    const previousDiceSettings: DiceSettingsUndo = {
      allowPausedByDefault: library.settings.allowPausedByDefault,
      favoriteGenres: [...library.settings.favoriteGenres],
      favoriteTags: [...library.settings.favoriteTags],
      kind: 'preferences',
      preferences: cloneRecommendationPreferences(persistedPreferences),
      surprisePercent: library.settings.surprisePercent,
    }
    const nextPreferences = cloneRecommendationPreferences(preferences)

    try {
      await library.saveSettings({
        recommendationPreferences: nextPreferences,
        surprisePercent: nextPreferences.surprisePercent,
        allowPausedByDefault: nextPreferences.includePaused,
      })
      setDraftPreferences(undefined)
      setDiceUndoAction(undefined)
      setDiceSettingsUndo(previousDiceSettings)
      setStatus('Ajustes del dado guardados')
      onActivity({
        detail: `${nextPreferences.surprisePercent}% sorpresa / ${typeLabels[nextPreferences.medium]}`,
        label: 'Preferencias guardadas',
        tab: 'dice',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron guardar los ajustes del dado.')
    }
  }, [hasUnsavedDicePreferences, library, onActivity, persistedPreferences, preferences])

  useEffect(() => {
    if (!saveRequest || handledSaveRequestId.current === saveRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledSaveRequestId.current === saveRequest.requestId) return

      handledSaveRequestId.current = saveRequest.requestId
      void savePreferences().finally(onSaveRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onSaveRequestHandled, savePreferences, saveRequest])

  async function undoDicePreferencesSave() {
    if (!diceSettingsUndo) return

    const undoStatus =
      diceSettingsUndo.kind === 'taste' ? 'Gustos del dado recuperados' : 'Ajustes del dado recuperados'
    const undoActivityLabel = diceSettingsUndo.kind === 'taste' ? 'Gustos recuperados' : 'Preferencias recuperadas'
    const undoActivityDetail =
      diceSettingsUndo.kind === 'taste'
        ? `${diceSettingsUndo.favoriteGenres.length + diceSettingsUndo.favoriteTags.length} gustos previos`
        : `${diceSettingsUndo.preferences.surprisePercent}% sorpresa / ${typeLabels[diceSettingsUndo.preferences.medium]}`

    try {
      await library.saveSettings(
        diceSettingsUndo.kind === 'taste'
          ? {
              favoriteGenres: [...diceSettingsUndo.favoriteGenres],
              favoriteTags: [...diceSettingsUndo.favoriteTags],
            }
          : {
              favoriteGenres: [...diceSettingsUndo.favoriteGenres],
              favoriteTags: [...diceSettingsUndo.favoriteTags],
              recommendationPreferences: cloneRecommendationPreferences(diceSettingsUndo.preferences),
              surprisePercent: diceSettingsUndo.surprisePercent,
              allowPausedByDefault: diceSettingsUndo.allowPausedByDefault,
            },
      )
      if (diceSettingsUndo.kind === 'preferences') setDraftPreferences(undefined)
      setDiceSettingsUndo(undefined)
      setDiceUndoAction(undefined)
      setStatus(undoStatus)
      onActivity({
        detail: undoActivityDetail,
        label: undoActivityLabel,
        tab: 'dice',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron recuperar los ajustes del dado.')
    }
  }

  async function startRecommendation() {
    if (!recommendation) return
    const previousRoadmap = cloneRoadmapPreferences(library.settings.roadmap)
    try {
      await library.setStatus(recommendation.item.id, 'in_progress')
      setDiceSettingsUndo(undefined)
      setDiceUndoAction({
        kind: 'status',
        itemId: recommendation.item.id,
        previousRoadmap,
        previousStatus: recommendation.item.status,
        title: recommendation.item.title,
      })
      setDiceDecisionSummary({
        detail: 'Ya esta en curso. Puedes afinar la ficha o tirar otra opcion para dejar otra preparada.',
        itemId: recommendation.item.id,
        kind: 'started',
        title: `${recommendation.item.title} iniciado`,
      })
      setStatus(`${recommendation.item.title} marcado como en progreso.`)
      onActivity({
        detail: recommendation.item.title,
        label: 'Recomendacion iniciada',
        tab: 'dice',
        target: { kind: 'item', id: recommendation.item.id },
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo actualizar el estado.')
    }
  }

  async function learnRecommendationTaste() {
    if (!recommendation || !recommendationLearningSignals?.total) return

    const learnedLabels = [...recommendationLearningSignals.genres, ...recommendationLearningSignals.tags]
    try {
      await library.saveSettings({
        favoriteGenres: uniqueNormalizedValues([...library.settings.favoriteGenres, ...recommendationLearningSignals.genres]),
        favoriteTags: uniqueNormalizedValues([...library.settings.favoriteTags, ...recommendationLearningSignals.tags]),
      })
      setDiceSettingsUndo(getDiceSettingsUndo('taste'))
      setDiceUndoAction(undefined)
      setStatus(`${recommendation.item.title}: ${learnedLabels.length} gustos aprendidos`)
      onActivity({
        detail: learnedLabels.slice(0, 4).join(', '),
        label: 'Gustos aprendidos',
        tab: 'dice',
        target: { kind: 'item', id: recommendation.item.id },
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron aprender estos gustos.')
    }
  }

  async function skipRecommendation() {
    if (!recommendation) return
    try {
      await library.snoozeRecommendation(recommendation.item.id)
      setDiceSettingsUndo(undefined)
      setDiceUndoAction({ kind: 'snooze', recommendation, title: recommendation.item.title })
      setDiceDecisionSummary({
        detail: 'Queda fuera hasta manana para que el dado no insista con la misma recomendacion.',
        itemId: recommendation.item.id,
        kind: 'snoozed',
        title: `${recommendation.item.title} apartado`,
      })
      setStatus(`${recommendation.item.title} queda fuera hasta manana.`)
      onActivity({
        detail: recommendation.item.title,
        label: 'Recomendacion enfriada',
        tab: 'dice',
        target: { kind: 'item', id: recommendation.item.id },
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo apartar la recomendacion.')
    }
  }

  const reactivateDiceCooldowns = useCallback(async () => {
    if (!cooldownRecoveryItems.length) return
    const count = cooldownRecoveryItems.length
    const recoverySnapshot = cooldownRecoveryItems.map((item) => ({ ...item }))
    try {
      await Promise.all(cooldownRecoveryItems.map((item) => library.reactivateRecommendation(item.id)))
      setDiceSettingsUndo(undefined)
      setDiceUndoAction({ kind: 'cooldowns', items: recoverySnapshot })
      setRecommendation(undefined)
      setDiceDecisionSummary(undefined)
      setStatus(count === 1 ? '1 entrada reactivada para el dado' : `${count} entradas reactivadas para el dado`)
      onActivity({
        detail: count === 1 ? '1 entrada en cooldown' : `${count} entradas en cooldown`,
        label: 'Cooldowns reactivados',
        tab: 'dice',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudieron reactivar las entradas.')
    }
  }, [cooldownRecoveryItems, library, onActivity])

  useEffect(() => {
    if (!cooldownReactivateRequest || handledCooldownReactivateRequestId.current === cooldownReactivateRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledCooldownReactivateRequestId.current === cooldownReactivateRequest.requestId) return

      handledCooldownReactivateRequestId.current = cooldownReactivateRequest.requestId
      void reactivateDiceCooldowns().finally(onCooldownReactivateRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [cooldownReactivateRequest, onCooldownReactivateRequestHandled, reactivateDiceCooldowns])

  async function saveDiceItemEdits(item: ListItem) {
    try {
      await library.saveItem(item)
      setEditingDiceItem(undefined)
      setRecommendation((current) => (current?.item.id === item.id ? { ...current, item } : current))
      setDiceDecisionSummary((current) =>
        current?.itemId === item.id
          ? { ...current, title: current.kind === 'started' ? `${item.title} iniciado` : `${item.title} apartado` }
          : current,
      )
      setDiceUndoAction(undefined)
      setDiceSettingsUndo(undefined)
      setStatus(`${item.title || 'Entrada'} afinada desde el dado.`)
      onActivity({
        detail: item.title || 'Entrada sin titulo',
        label: 'Ficha afinada',
        tab: 'dice',
        target: { kind: 'item', id: item.id },
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo guardar la ficha.')
    }
  }

  async function deleteDiceItem(item: ListItem) {
    try {
      await library.deleteItem(item.id)
      setEditingDiceItem(undefined)
      setRecommendation((current) => (current?.item.id === item.id ? undefined : current))
      setDiceDecisionSummary((current) => (current?.itemId === item.id ? undefined : current))
      setDiceUndoAction(undefined)
      setDiceSettingsUndo(undefined)
      setStatus(`${item.title || 'Entrada'} eliminada de Biblioteca.`)
      onActivity({
        detail: item.title || 'Entrada sin titulo',
        label: 'Entrada eliminada',
        tab: 'dice',
        tone: 'success',
      })
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo borrar la entrada.')
    }
  }

  function applyDicePreset(preferencesPreset: RecommendationPreferences) {
    setPreferences(preferencesPreset)
  }

  async function undoDiceDecision() {
    if (!diceUndoAction) return

    try {
      if (diceUndoAction.kind === 'status') {
        await library.applyRoadmapMutation(createRoadmapUndoMutation(diceUndoAction.previousRoadmap, {
          id: diceUndoAction.itemId,
          status: diceUndoAction.previousStatus,
        }))
        setStatus(`${diceUndoAction.title} recuperado como ${statusLabels[diceUndoAction.previousStatus]}`)
        onActivity({
          detail: `${diceUndoAction.title} -> ${statusLabels[diceUndoAction.previousStatus]}`,
          label: 'Decision recuperada',
          tab: 'dice',
          target: { kind: 'item', id: diceUndoAction.itemId },
          tone: 'success',
        })
      } else if (diceUndoAction.kind === 'snooze') {
        await library.reactivateRecommendation(diceUndoAction.recommendation.item.id)
        setRecommendation(diceUndoAction.recommendation)
        setStatus(`${diceUndoAction.title} reactivado para el dado`)
        onActivity({
          detail: diceUndoAction.title,
          label: 'Recomendacion recuperada',
          tab: 'dice',
          target: { kind: 'item', id: diceUndoAction.recommendation.item.id },
          tone: 'success',
        })
      } else {
        for (const item of diceUndoAction.items) {
          await library.setRecommendationCooldown(item.id, item.recommendationCooldownUntil)
        }
        setRecommendation(undefined)
        setStatus(diceUndoAction.items.length === 1 ? '1 cooldown recuperado' : `${diceUndoAction.items.length} cooldowns recuperados`)
        onActivity({
          detail: diceUndoAction.items.length === 1 ? '1 cooldown restaurado' : `${diceUndoAction.items.length} cooldowns restaurados`,
          label: 'Cooldowns recuperados',
          tab: 'dice',
          tone: 'success',
        })
      }
      setDiceUndoAction(undefined)
      setDiceDecisionSummary(undefined)
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'No se pudo deshacer la decision del dado.')
    }
  }

  function getDiceUndoLabel() {
    if (!diceUndoAction) return 'Deshacer decision'
    if (diceUndoAction.kind === 'status') return 'Deshacer estado'
    if (diceUndoAction.kind === 'snooze') return 'Deshacer enfriado'
    return 'Deshacer reactivacion'
  }

  function getDiceSettingsUndoLabel() {
    if (!diceSettingsUndo) return 'Deshacer ajustes del dado'
    return diceSettingsUndo.kind === 'taste' ? 'Deshacer gustos' : 'Deshacer ajustes del dado'
  }

  useEffect(() => {
    if (!rollRequest || handledRollRequestId.current === rollRequest.requestId) return

    const timeoutId = window.setTimeout(() => {
      if (handledRollRequestId.current === rollRequest.requestId) return

      handledRollRequestId.current = rollRequest.requestId
      void rollRecommendation(undefined, rollRequest.scope ?? 'all').finally(onRollRequestHandled)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [onRollRequestHandled, rollRecommendation, rollRequest])

  const shouldShowDiceResult = isRolling || Boolean(recommendation) || !hasCandidates

  return (
    <section className={shouldShowDiceResult ? 'dice-layout has-dice-result' : 'dice-layout dice-idle'}>
      <section className="workspace-panel dice-hero" aria-label="Dado ponderado">
        <div className="dice-hero-copy">
          <span className="tool-mode-badge dice-mode-badge">
            <Dice5 size={15} />
            Dado
          </span>
          <span className="eyebrow">Guardadas / elegir ahora</span>
          <h2>Que sigo ahora?</h2>
          <p className="hero-copy">Elige una obra que ya guardaste. Para encontrar algo nuevo, abre Explorar.</p>
          <div className="intent-flow dice-intent-flow" aria-label="Que hace el dado" data-testid="dice-job">
            <span>
              <Library size={14} />
              Guardadas
            </span>
            <span>
              <Dice5 size={14} />
              Tirada
            </span>
            <span>
              <Play size={14} />
              Empiezas
            </span>
          </div>
          <p className="tool-boundary dice-boundary">
            <LockKeyhole size={14} />
            No busca fuera ni crea fichas.
          </p>
        </div>
        <div className="dice-action-stage">
          {candidatePreview.length > 0 && (
            <div className="dice-deck-peek" aria-hidden="true">
              {candidatePreview.slice(0, 3).map((candidate) => (
                <CoverArt
                  key={candidate.item.id}
                  title={candidate.item.title}
                  type={candidate.item.type}
                  posterUrl={candidate.item.posterUrl}
                />
              ))}
            </div>
          )}
          <button
            className={isRolling ? 'dice-orb rolling' : 'dice-orb'}
            disabled={isRolling || !hasCandidates}
            type="button"
            onClick={() => void rollRecommendation()}
            data-testid="roll-button"
            aria-label="Tirar dado ponderado"
          >
            <span className="dice-orb-kicker">{scoredCandidates.length ? `${scoredCandidates.length} candidatas` : 'Sin candidatas'}</span>
            <Dice5 size={42} />
            <strong>{isRolling ? 'Eligiendo' : recommendation ? 'Tirar otra' : 'Elegir ahora'}</strong>
          </button>
        </div>
        <div className="dice-readiness" aria-label="Resumen del dado" data-testid="dice-readiness" role="group">
          <div className={`${hasCandidates ? 'dice-readiness-card ready' : 'dice-readiness-card warning'}${topCandidate ? ' with-cover' : ''}`}>
            {topCandidate && (
              <CoverArt title={topCandidate.item.title} type={topCandidate.item.type} posterUrl={topCandidate.item.posterUrl} />
            )}
            <span>{hasCandidates ? 'Listo para tirar' : 'Sin tirada posible'}</span>
            <strong>{topCandidate ? topCandidate.item.title : 'Ajusta filtros'}</strong>
            <small>
              {topCandidate
                ? `${topCandidate.reasons[0] ?? 'Mejor candidata'} / guardada`
                : 'Afloja medio, tiempo, tags o pausados.'}
            </small>
          </div>
          <div className="dice-readiness-metrics">
            <span>
              <strong>{scoredCandidates.length}</strong>
              Candidatas guardadas
            </span>
            <span>
              <strong>{intensityLabels[preferences.intensity]}</strong>
              Modo
            </span>
            <span>
              <strong>{hasUnsavedDicePreferences ? '!' : 'OK'}</strong>
              Ajustes
            </span>
          </div>
          {(preferences.includePaused || library.settings.blockedTags.length > 0) && (
            <div className="dice-active-filter-strip" aria-label="Filtros activos del dado">
              {preferences.includePaused && <span>Incluye pausados</span>}
              {library.settings.blockedTags.length > 0 && <span>{library.settings.blockedTags.length} senales bloqueadas</span>}
            </div>
          )}
        </div>
      </section>

      <section className="workspace-panel dice-queue">
        <div className="panel-heading compact">
          <div>
            <h2>Candidatas guardadas</h2>
            <p>{scoredCandidates.length ? `${scoredCandidates.length} entradas pueden salir` : 'Sin candidatas con estos filtros'}</p>
          </div>
        </div>
        {topCandidate && (
          <button className="dice-featured-candidate" type="button" onClick={() => setEditingDiceItem(topCandidate.item)}>
            <CoverArt title={topCandidate.item.title} type={topCandidate.item.type} posterUrl={topCandidate.item.posterUrl} />
            <span className="dice-featured-copy">
              <small>Mejor encaje ahora</small>
              <strong>{topCandidate.item.title}</strong>
              <em>{topCandidate.reasons[0] ?? 'Lista para salir'}</em>
            </span>
            <span className="dice-featured-score">
              <small>Encaje</small>
              <strong>{getDiceFitLabel(topCandidate.score, maxCandidateScore)}</strong>
            </span>
          </button>
        )}
        {candidatePreview.length ? (
          <details className="dice-pool-detail" data-close-on-outside>
            <summary>
              <span>
                <strong>Por que pueden salir</strong>
                <small>{unavailableCount} fuera por estado, cooldown o filtros</small>
              </span>
              <em>{showFullDicePool ? `${candidatePreview.length} visibles` : `${candidatePreview.length} de ${scoredCandidates.length}`}</em>
            </summary>
            <ol className="dice-candidate-list" aria-label="Candidatas del dado" data-testid="dice-candidate-list">
              {candidatePreview.map((candidate, index) => {
                const Icon = typeIcons[candidate.item.type]

                return (
                <li key={candidate.item.id}>
                  <span className="dice-candidate-rank">#{index + 1}</span>
                  <span className={`dice-candidate-type ${candidate.item.type}`} aria-hidden="true">
                    <Icon size={14} />
                  </span>
                  <span className="dice-candidate-main">
                    <strong>{candidate.item.title}</strong>
                    <small>
                      {statusLabels[candidate.item.status]} / {typeLabels[candidate.item.type]}
                    </small>
                    <span className="dice-candidate-reasons">
                      {candidate.reasons.slice(0, 2).map((reason) => (
                        <em key={reason}>{reason}</em>
                      ))}
                    </span>
                  </span>
                  <span className="dice-candidate-score" aria-label={`Encaje ${getDiceFitLabel(candidate.score, maxCandidateScore)} de ${candidate.item.title}; valor ${candidate.score}`}>
                    <span>Encaje</span>
                    <strong>{getDiceFitLabel(candidate.score, maxCandidateScore)}</strong>
                    <small>Valor {candidate.score}</small>
                    <span className="dice-score-meter" aria-hidden="true">
                      <span style={{ width: getDiceScoreMeterWidth(candidate.score, maxCandidateScore) }} />
                    </span>
                  </span>
                </li>
                )
              })}
            </ol>
            {scoredCandidates.length > 4 && (
              <button className="ghost-button dice-expand-button" type="button" onClick={() => setShowFullDicePool((current) => !current)}>
                {showFullDicePool ? 'Ver menos candidatas' : `Ver ${hiddenCandidateCount} mas`}
              </button>
            )}
            <div className="dice-footnotes">
              <span>{unavailableCount} fuera por estado, cooldown o filtros</span>
              <span>Pool maximo {poolSize}</span>
            </div>
            <DiceEligibilityPanel
              activeFilters={activeDiceFilters}
              breakdown={eligibilityBreakdown}
              recoveryActions={diceRecoveryActions}
            />
          </details>
        ) : (
          <>
            <EmptyState
              icon={Dice5}
              title="Sin candidatas"
              detail="Afloja filtros, incluye pausados o anade pendientes desde Estanteria y Explorar."
            />
            <DiceEligibilityPanel
              activeFilters={activeDiceFilters}
              breakdown={eligibilityBreakdown}
              recoveryActions={diceRecoveryActions}
            />
          </>
        )}
      </section>

      <section className="workspace-panel dice-settings">
        <details className="dice-settings-panel" data-close-on-outside open={hasUnsavedDicePreferences}>
          <summary aria-label="Abrir modos de tirada">
            <span className="dice-settings-summary-copy">
              <strong>Afinar tirada</strong>
              <small>{preferences.surprisePercent}% sorpresa / {intensityLabels[preferences.intensity]}</small>
            </span>
            <span className={hasUnsavedDicePreferences ? 'dice-settings-summary-state pending' : 'dice-settings-summary-state'}>
              {hasUnsavedDicePreferences ? 'Pendiente' : `${scoredCandidates.length} candidatas`}
            </span>
          </summary>
          <div className="dice-settings-content">
            <div className="panel-heading">
              <div>
                <h2>Modos de tirada</h2>
                <p>Presets rapidos y filtros para cuando quieras controlar el azar.</p>
              </div>
              <button className="secondary-button" disabled={!hasUnsavedDicePreferences} type="button" onClick={savePreferences}>
                <Save size={17} />
                {hasUnsavedDicePreferences ? 'Guardar ajustes' : 'Ajustes guardados'}
              </button>
            </div>
            <div className={hasUnsavedDicePreferences ? 'settings-status pending' : 'settings-status'}>
              <span>{hasUnsavedDicePreferences ? 'Cambios pendientes' : 'Sin cambios pendientes'}</span>
              <strong>{scoredCandidates.length} candidatas</strong>
            </div>
            <div className="dice-preset-grid" aria-label="Presets rapidos del dado">
              {dicePreferencePresets.map((preset) => {
                const isActive = sameRecommendationPreferences(preferences, preset.preferences)

                return (
                  <button
                    aria-label={`Aplicar preset ${preset.label}`}
                    aria-pressed={isActive}
                    className={isActive ? 'dice-preset-card active' : 'dice-preset-card'}
                    key={preset.id}
                    type="button"
                    onClick={() => applyDicePreset(preset.preferences)}
                  >
                    <preset.Icon size={16} />
                    <span>
                      <strong>{preset.label}</strong>
                      <small>{preset.detail}</small>
                    </span>
                  </button>
                )
              })}
            </div>
            <details className="dice-tuning-panel" data-close-on-outside open={hasUnsavedDicePreferences}>
              <summary>
                <span>Filtros concretos</span>
                <small>Medio, tiempo, energia y sorpresa</small>
              </summary>
              <PreferenceControls preferences={preferences} setPreferences={setPreferences} />
            </details>
          </div>
        </details>
        {status && <FeedbackMessage tone={feedbackToneFromText(status)}>{status}</FeedbackMessage>}
        {(diceSettingsUndo || diceUndoAction) && (
          <div className="feedback-action-row" aria-label="Accion reciente del dado">
            {diceSettingsUndo && (
              <button className="secondary-button" type="button" onClick={() => void undoDicePreferencesSave()}>
                <RotateCcw size={16} />
                {getDiceSettingsUndoLabel()}
              </button>
            )}
            {diceUndoAction && (
              <button className="secondary-button" type="button" onClick={() => void undoDiceDecision()}>
                <RotateCcw size={16} />
                {getDiceUndoLabel()}
              </button>
            )}
          </div>
        )}
      </section>

      {shouldShowDiceResult && (
        <section className="workspace-panel result-panel">
          <div className="panel-heading compact">
            <div>
              <h2>Tu siguiente obra</h2>
              <p>{recommendation ? `Elegida entre ${recommendation.poolSize}` : isRolling ? 'Eligiendo ahora' : 'Sin decision todavia'}</p>
            </div>
          </div>

          {isRolling ? (
            <div className="recommendation-result rolling-result" data-testid="recommendation-result">
              <Dice5 size={30} />
              <strong>El dado esta eligiendo...</strong>
              <div className="dice-roll-track" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <FeedbackMessage>Barajando {scoredCandidates.length} opciones disponibles.</FeedbackMessage>
            </div>
          ) : recommendation ? (
            <div
              className={recommendation.item.posterUrl ? 'recommendation-result revealed-result has-poster' : 'recommendation-result revealed-result'}
              data-testid="recommendation-result"
              style={getPosterBackplateStyle(recommendation.item.posterUrl)}
            >
            <div className="recommendation-head">
              <CoverArt title={recommendation.item.title} type={recommendation.item.type} posterUrl={recommendation.item.posterUrl} />
              <div className="recommendation-summary">
                <span className="eyebrow">Dado eligio</span>
                <ItemIdentity item={recommendation.item} />
                {activeDiceDecision ? (
                  <section
                    className={`recommendation-decision-complete ${activeDiceDecision.kind}`}
                    aria-label="Decision cerrada del dado"
                    data-testid="dice-decision-summary"
                  >
                    <div className="recommendation-decision-complete-main">
                      {activeDiceDecision.kind === 'started' ? <Play size={17} /> : <Moon size={17} />}
                      <div>
                        <span className="eyebrow">Decision cerrada</span>
                        <strong>{activeDiceDecision.title}</strong>
                        <p>{activeDiceDecision.detail}</p>
                      </div>
                    </div>
                    <div className="recommendation-decision-complete-actions">
                      {activeDiceDecision.kind === 'started' && (
                        <button className="secondary-button" type="button" onClick={openDiceDecisionItem}>
                          <Info size={16} />
                          Afinar ficha
                        </button>
                      )}
                      <button className="primary-button" type="button" onClick={() => void rollAnotherRecommendation()}>
                        <Dice5 size={16} />
                        Tirar otra
                      </button>
                    </div>
                  </section>
                ) : (
                  <section className="recommendation-decision" aria-label="Decision de la tirada">
                    <div>
                      <span className="eyebrow">Decision</span>
                      <strong>Quieres seguir con esta ahora?</strong>
                      <p>Empezar lo marca en curso. No hoy lo aparta hasta manana.</p>
                    </div>
                    <div className="action-row recommendation-actions">
                      <button
                        className="primary-button"
                        type="button"
                        onClick={startRecommendation}
                      >
                        <Play size={16} />
                        Empezar
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        aria-label="Afinar ficha recomendada"
                        onClick={openDiceDecisionItem}
                      >
                        <Info size={16} />
                        Afinar ficha
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={skipRecommendation}
                      >
                        <X size={16} />
                        No hoy
                      </button>
                    </div>
                  </section>
                )}
                <div className="recommendation-scoreboard" aria-label="Resumen de la tirada">
                  <div className="score-card primary">
                    <span>Encaje</span>
                    <strong>{getDiceFitLabel(recommendation.score, maxCandidateScore)}</strong>
                  </div>
                  <div className="score-card">
                    <span>Entre</span>
                    <strong>{recommendation.poolSize}</strong>
                  </div>
                  <div className="score-card">
                    <span>Modo</span>
                    <strong>{intensityLabels[preferences.intensity]}</strong>
                  </div>
                </div>
                <details className="dice-score-details">
                  <summary>Desglose de puntuacion</summary>
                  <div>
                    <span>Valor tecnico <strong>{recommendation.score}</strong></span>
                    <span>Pool considerado <strong>{recommendation.poolSize}</strong></span>
                    {recommendation.reasons.slice(0, 3).map((reason) => <span key={reason}>{reason}</span>)}
                  </div>
                </details>
              </div>
            </div>
            <div className="recommendation-detail-grid" aria-label="Detalles de la tirada">
              <details className="recommendation-detail-panel" data-close-on-outside>
                <summary>
                  <span>
                    <strong>Plan de sesion</strong>
                    <small>{getRecommendationSessionPlan(recommendation, preferences).title}</small>
                  </span>
                </summary>
                <RecommendationSessionPlanView plan={getRecommendationSessionPlan(recommendation, preferences)} />
              </details>
              <details className="recommendation-detail-panel" data-close-on-outside>
                <summary>
                  <span>
                    <strong>Por que sale</strong>
                    <small>{recommendation.reasons[0] ?? 'Mejor candidata ahora'}</small>
                  </span>
                </summary>
                <section className="reason-stack" aria-label="Razones de la recomendacion">
                  <h3>Por que sale</h3>
                  <ul>
                    {recommendation.reasons.map((reason) => (
                      <li key={reason}>
                        <CheckCircle2 size={15} />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </details>
            </div>
            {recommendationLearningSignals && recommendationLearningSignals.total > 0 && (
              <section className="recommendation-learning" aria-label="Aprendizaje de gustos del dado" data-testid="dice-learning">
                <div className="recommendation-learning-main">
                  <div>
                    <span className="eyebrow">Aprendizaje</span>
                    <strong>Senales para recordar</strong>
                  </div>
                  <div className="recommendation-learning-chips">
                    {recommendationLearningSignals.genres.map((genre) => (
                      <span key={`genre-${normalizeKey(genre)}`}>
                        <small>Genero</small>
                        {genre}
                      </span>
                    ))}
                    {recommendationLearningSignals.tags.map((tag) => (
                      <span key={`tag-${normalizeKey(tag)}`}>
                        <small>Tag</small>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <button className="secondary-button" type="button" onClick={() => void learnRecommendationTaste()}>
                  <Sparkles size={16} />
                  Aprender gustos
                </button>
              </section>
            )}
            </div>
          ) : (
            <EmptyState
              icon={AlertTriangle}
              tone="warning"
              title="No hay tirada posible"
              detail="Cambia medio, tiempo, senales bloqueadas o incluye pausados para abrir el abanico."
            />
          )}

          <section className="recent-rolls" aria-label="Tiradas recientes" data-testid="recent-rolls">
            <div className="recent-rolls-heading">
              <h3>Tiradas recientes</h3>
              <span>{recentRecommendations.length ? `${recentRecommendations.length} ultimas` : 'Sin memoria aun'}</span>
            </div>
            {recentRecommendations.length ? (
              <ol className="recent-roll-list">
                {recentRecommendations.map((item) => {
                  const Icon = typeIcons[item.type]

                  return (
                    <li key={item.id}>
                      <button
                        aria-label={`Afinar tirada reciente ${item.title}`}
                        type="button"
                        onClick={() =>
                          setEditingDiceItem(library.items.find((libraryItem) => libraryItem.id === item.id) ?? item)
                        }
                      >
                        <span className={`recent-roll-icon ${item.type}`}>
                          <Icon size={14} />
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{formatRecentRecommendationTime(item.lastRecommendedAt)}</small>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="muted-line">Las tiradas guardadas apareceran aqui despues de usar el dado.</p>
            )}
          </section>
        </section>
      )}

      {editingDiceItem && (
        <ItemEditor
          item={editingDiceItem}
          onClose={() => setEditingDiceItem(undefined)}
          onDelete={deleteDiceItem}
          onSave={saveDiceItemEdits}
        />
      )}
    </section>
  )
}
