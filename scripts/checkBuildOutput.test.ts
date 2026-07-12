import { describe, expect, it } from 'vitest'
import { collectInitialApplicationJsReferences, measureCompressedJavaScript } from './checkBuildOutput'

describe('build output JavaScript budget', () => {
  it('counts entry scripts and application modulepreloads once while excluding explicit vendor chunks', () => {
    const html = `
      <script type="module" src="/assets/index-abc.js"></script>
      <link href="/assets/rolldown-runtime-def.js" rel="modulepreload">
      <link rel="modulepreload" href="/assets/external-search-ghi.js">
      <link rel="modulepreload" href="/assets/react-vendor-jkl.js">
      <link rel="modulepreload" href="https://cdn.example.test/remote.js">
      <link rel="modulepreload" href="/assets/index-abc.js">
    `

    expect(collectInitialApplicationJsReferences(html)).toEqual([
      '/assets/index-abc.js',
      '/assets/rolldown-runtime-def.js',
      '/assets/external-search-ghi.js',
    ])
  })

  it('measures initial JavaScript raw, gzip and Brotli payloads per resource', () => {
    const result = measureCompressedJavaScript([
      Buffer.from('const repeated = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";'),
      Buffer.from('export const value = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";'),
    ])

    expect(result.rawBytes).toBeGreaterThan(0)
    expect(result.gzipBytes).toBeGreaterThan(0)
    expect(result.brotliBytes).toBeGreaterThan(0)
    expect(result.brotliBytes).toBeLessThan(result.rawBytes)
  })
})
