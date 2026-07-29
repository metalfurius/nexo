import type { AniListSyncController } from './useAniListSync'
import { useAniListSync } from './useAniListSync'
import { useEffect } from 'react'

interface AniListSyncRuntimeProps {
  userId: string
  isAdmin: boolean
  onChange: (controller: AniListSyncController) => void
}

export default function AniListSyncRuntime({ userId, isAdmin, onChange }: AniListSyncRuntimeProps) {
  const controller = useAniListSync(userId, isAdmin)

  useEffect(() => {
    onChange(controller)
  }, [controller, onChange])

  return null
}
