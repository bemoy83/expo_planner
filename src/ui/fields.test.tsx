import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextField } from './fields'

const UNITS = ['lm', 'm²', 'ordre', 'stk']
const listed = () => screen.queryAllByRole('option').map((option) => option.textContent)

describe('TextField with values to pick from', () => {
  afterEach(cleanup)

  it('lists all of them when the field is entered, whatever it holds', () => {
    render(<TextField value="stk" options={UNITS} onCommit={() => {}} />)
    expect(listed()).toEqual([])
    fireEvent.focus(screen.getByRole('combobox'))
    expect(listed()).toEqual(UNITS)
    expect(screen.getByRole('option', { name: 'stk' }).className).toBe('current')
  })

  it('narrows the list by what is typed, and lists all again when the field is emptied', () => {
    render(<TextField value="stk" options={UNITS} onCommit={() => {}} />)
    const field = screen.getByRole('combobox')
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'M' } })
    expect(listed()).toEqual(['lm', 'm²'])
    fireEvent.change(field, { target: { value: '' } })
    expect(listed()).toEqual(UNITS)
  })

  it('saves a value that is clicked, and not what was typed to find it', () => {
    const onCommit = vi.fn()
    render(<TextField value="stk" options={UNITS} onCommit={onCommit} />)
    const field = screen.getByRole('combobox')
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'or' } })
    fireEvent.mouseDown(screen.getByRole('option', { name: 'ordre' }))
    fireEvent.blur(field)
    expect(onCommit.mock.calls).toEqual([['ordre']])
    expect(listed()).toEqual([])
  })

  it('picks with the arrow keys and Enter', () => {
    const onCommit = vi.fn()
    render(<TextField value="stk" options={UNITS} onCommit={onCommit} />)
    const field = screen.getByRole('combobox')
    fireEvent.focus(field)
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: 'm²' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(field, { key: 'ArrowUp' })
    fireEvent.keyDown(field, { key: 'ArrowUp' })
    expect(screen.getByRole('option', { name: 'stk' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onCommit).not.toHaveBeenCalled() // the value it had
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onCommit.mock.calls).toEqual([['lm']])
  })

  it('still saves text that is not among them, and drops it on Escape', () => {
    const onCommit = vi.fn()
    render(<TextField value="stk" options={UNITS} onCommit={onCommit} />)
    const field = screen.getByRole('combobox') as HTMLInputElement
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: 'paller' } })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(field.value).toBe('stk')
    fireEvent.blur(field)
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: ' paller ' } })
    fireEvent.blur(field)
    expect(onCommit.mock.calls).toEqual([['paller']])
  })

  it('is a plain field without them', () => {
    render(<TextField value="Notat" onCommit={() => {}} />)
    fireEvent.focus(screen.getByRole('textbox'))
    expect(listed()).toEqual([])
  })
})
