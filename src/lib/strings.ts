export function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

export function uniqueValues(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
}

export function uniqueNormalizedValues(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = normalizeKey(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function splitList(value: string) {
  return uniqueValues(value.split(',').map((entry) => entry.trim()))
}

export function mergeListText(currentText: string, additions: string[]) {
  return uniqueValues([...splitList(currentText), ...additions]).join(', ')
}

export function toggleListTextValue(currentText: string, value: string) {
  const currentValues = splitList(currentText)
  const valueKey = normalizeKey(value)
  const nextValues = currentValues.some((entry) => normalizeKey(entry) === valueKey)
    ? currentValues.filter((entry) => normalizeKey(entry) !== valueKey)
    : [...currentValues, value]

  return nextValues.join(', ')
}

export function slugify(value: string) {
  return normalizeKey(value).replace(/\s+/g, '-')
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
