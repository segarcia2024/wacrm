import { describe, expect, it } from 'vitest'
import { parseTemplateButtonReply } from './parse-button-reply'

describe('parseTemplateButtonReply', () => {
  it('uses button text for the bubble and payload as the reply id', () => {
    expect(
      parseTemplateButtonReply({
        text: 'Sí, sigo buscando',
        payload: 'yes_still_looking',
      }),
    ).toEqual({
      contentText: 'Sí, sigo buscando',
      interactiveReplyId: 'yes_still_looking',
    })
  })

  it('falls back to payload when text is missing', () => {
    expect(parseTemplateButtonReply({ payload: 'opt_a', text: '' })).toEqual({
      contentText: 'opt_a',
      interactiveReplyId: 'opt_a',
    })
  })

  it('falls back to text when payload is missing', () => {
    expect(parseTemplateButtonReply({ text: 'No gracias', payload: '  ' })).toEqual({
      contentText: 'No gracias',
      interactiveReplyId: 'No gracias',
    })
  })

  it('returns a placeholder when both fields are empty', () => {
    expect(parseTemplateButtonReply({})).toEqual({
      contentText: '[Button reply]',
      interactiveReplyId: null,
    })
    expect(parseTemplateButtonReply(null)).toEqual({
      contentText: '[Button reply]',
      interactiveReplyId: null,
    })
  })
})
