import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mergeParsedItems, parseMarkdownFile } from './markdownParser'

describe('markdownParser', () => {
  it('parses loose markdown lists with status, rating, duration and notes', () => {
    const parsed = parseMarkdownFile(
      'Juegos.md',
      [
        '## Ya Jugados',
        '1. **Portal 2 CO-OP** `⭐ 8/10`',
        '',
        '## Pausado (Retomar Cuando Quieras)',
        '5. **Pokemon Esmeralda (Nuzlocke):** `Retomar cuando tengas ganas`',
        '',
        '## Proximos: Rapidos y Directos (< 15 horas)',
        '6. **Katana ZERO:** 4 - 6 horas. `(Accion frenetica, historia intrigante)`',
        '',
        '## Droppeados (No Recomendar)',
        '43. **Mass Effect Legendary Edition** `Droppeado 3/10`',
      ].join('\n'),
    )

    expect(parsed.items).toHaveLength(4)
    expect(parsed.items.find((item) => item.title === 'Portal 2 CO-OP')?.rating).toBe(8)
    expect(parsed.items.find((item) => item.title.includes('Pokemon'))?.status).toBe('paused')
    expect(parsed.items.find((item) => item.title === 'Katana ZERO')?.durationMaxHours).toBe(6)
    expect(parsed.items.find((item) => item.title === 'Katana ZERO')?.tags).toEqual(
      expect.arrayContaining(['accion', 'rapido', 'intenso']),
    )
    expect(parsed.items.find((item) => item.title === 'Katana ZERO')?.tags).not.toContain('juego')
    expect(parsed.items.find((item) => item.title === 'Mass Effect Legendary Edition')?.status).toBe('dropped')
  })

  it('merges duplicate dice table entries with stronger existing state', () => {
    const completed = parseMarkdownFile('Ver.md', '## Ya Visto\n1. The Matrix (Pelicula) - `⭐ 7.5/10`')
    const dice = parseMarkdownFile(
      'Recomendaciones.md',
      '## Tabla de Ver (Tira 1d20)\n| d20 | Titulo | Tipo |\n| --- | --- | --- |\n| 1 | The Matrix | Pelicula |',
    )
    const merged = mergeParsedItems([completed, dice])
    expect(merged.items).toHaveLength(1)
    expect(merged.items[0].status).toBe('completed')
    expect(merged.items[0].rating).toBe(7.5)
  })

  it('ignores dice instructions and merges current-state duplicates into rich items', () => {
    const book = parseMarkdownFile('Libros.md', '## Proximos\n1. 1984 - George Orwell `(Distopia clasica)`')
    const dice = parseMarkdownFile(
      'Recomendaciones.md',
      [
        '## ¿Que Categoria? (Tira 1d6)',
        '| d6 | Categoria |',
        '| --- | --- |',
        '| 1-2 | Juegos |',
        '',
        '## Estado Actual',
        'En progreso -',
        '1984',
        '',
        '## ¿No te convence el resultado? (Tira 1d6)',
        '| d6 | Accion |',
        '| --- | --- |',
        '| 1-2 | Acepta el destino - El dado ha hablado |',
      ].join('\n'),
    )

    const merged = mergeParsedItems([book, dice])

    expect(merged.items).toHaveLength(1)
    expect(merged.items[0]).toMatchObject({
      title: '1984 - George Orwell',
      type: 'book',
      status: 'in_progress',
    })
    expect(merged.items[0].tags).not.toContain('libro')
    expect(merged.items[0].tags.some((tag) => tag.includes('Tira'))).toBe(false)
  })

  it('can parse the sibling legacy Listas repo when present', () => {
    const legacyDir = resolve(process.cwd(), '..', 'Listas')
    if (!existsSync(legacyDir)) return

    const parsed = ['Juegos.md', 'Libros.md', 'Ver.md', 'Recomendaciones.md'].map((fileName) =>
      parseMarkdownFile(fileName, readFileSync(resolve(legacyDir, fileName), 'utf8')),
    )
    const merged = mergeParsedItems(parsed)

    expect(merged.items.length).toBeGreaterThan(40)
    expect(merged.items.length).toBeLessThan(130)
    expect(merged.items.some((item) => item.title.includes('Outer Wilds'))).toBe(true)
    expect(merged.items.some((item) => item.status === 'dropped')).toBe(true)
    expect(merged.items.some((item) => item.title.includes('El dado ha hablado'))).toBe(false)
    expect(merged.items.flatMap((item) => item.tags).some((tag) => tag.includes('Tabla'))).toBe(false)
  })
})
