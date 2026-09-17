import { describe, expect, it } from 'vitest'
import { linkifyText } from './linkify'

describe('linkifyText', () => {
  it('returns a single text part when there are no URLs', () => {
    expect(linkifyText('Cuanto es lo mínimo')).toEqual([
      { type: 'text', value: 'Cuanto es lo mínimo' },
    ])
  })

  it('splits https URLs and leaves surrounding text', () => {
    const parts = linkifyText(
      'Mira https://carro.mercadolibre.com.co/MCO-1 por favor',
    )
    expect(parts).toEqual([
      { type: 'text', value: 'Mira ' },
      {
        type: 'url',
        value: 'https://carro.mercadolibre.com.co/MCO-1',
        href: 'https://carro.mercadolibre.com.co/MCO-1',
      },
      { type: 'text', value: ' por favor' },
    ])
  })

  it('prefixes https for bare www hosts', () => {
    expect(linkifyText('visita www.example.com/path')).toEqual([
      { type: 'text', value: 'visita ' },
      {
        type: 'url',
        value: 'www.example.com/path',
        href: 'https://www.example.com/path',
      },
    ])
  })

  it('keeps trailing sentence punctuation outside the URL', () => {
    expect(linkifyText('Ver https://example.com.')).toEqual([
      { type: 'text', value: 'Ver ' },
      {
        type: 'url',
        value: 'https://example.com',
        href: 'https://example.com',
      },
      { type: 'text', value: '.' },
    ])
  })

  it('handles empty input', () => {
    expect(linkifyText('')).toEqual([])
  })
})
