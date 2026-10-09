import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DataTable } from './DataTable'
import { useTable, type Column } from './useTable'

interface Rate {
  name: string
  unit: string
  rate: number
}
const RATES: Rate[] = [
  { name: 'Vegger', unit: 'lm', rate: 12 },
  { name: 'Tepper', unit: 'm²', rate: 100 },
  { name: 'Skilt', unit: 'stk', rate: 9 },
  { name: 'Dører', unit: 'stk', rate: 0.5 },
]
const COLUMNS: Column<Rate>[] = [
  { key: 'name', head: 'Navn', sort: (row) => row.name, cell: (row, index, rows) => `${row.name}${index === rows.length - 1 ? ' (sist)' : ''}` },
  { key: 'unit', head: 'Enhet', text: (row) => row.unit, cell: (row) => row.unit },
  { key: 'rate', head: 'Sats', className: 'num', sort: (row) => row.rate, cell: (row) => row.rate, cellProps: (row) => ({ title: `${row.rate} per time` }) },
  { key: 'actions', className: 'actions', cell: () => 'x' },
]

function Rates({ limit }: { limit?: number }) {
  const table = useTable(RATES, COLUMNS)
  return <DataTable table={table} rowKey={(row) => row.name} rowProps={(row) => ({ className: row.rate < 1 ? 'slow' : undefined })} limit={limit} />
}

const names = () => screen.getAllByRole('row').slice(1).map((row) => row.firstElementChild!.textContent)

describe('DataTable', () => {
  afterEach(cleanup)

  it('draws the rows in their own order, with the class and the cell attributes of each', () => {
    render(<Rates />)
    expect(names()).toEqual(['Vegger', 'Tepper', 'Skilt', 'Dører (sist)'])
    expect(screen.getAllByRole('row')[4].className).toBe('slow')
    expect(screen.getByTitle('12 per time').className).toBe('num')
  })

  it('sorts on a click on the heading: ascending, descending, then the order it had', () => {
    render(<Rates />)
    const rate = screen.getByRole('button', { name: 'Sats' })
    fireEvent.click(rate)
    expect(names()).toEqual(['Dører', 'Skilt', 'Vegger', 'Tepper (sist)'])
    expect(screen.getByRole('columnheader', { name: /Sats/ }).getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(rate)
    expect(names()).toEqual(['Tepper', 'Vegger', 'Skilt', 'Dører (sist)'])
    fireEvent.click(rate)
    expect(names()).toEqual(['Vegger', 'Tepper', 'Skilt', 'Dører (sist)'])
  })

  it('sorts from the filter\'s menu too, in the direction picked there', () => {
    render(<Rates />)
    fireEvent.click(screen.getByRole('button', { name: 'Filtrer kolonnen' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sorter synkende' }))
    expect(names()).toEqual(['Skilt', 'Dører', 'Tepper', 'Vegger (sist)'])
    expect(screen.getByRole('menuitemradio', { name: 'Sorter synkende' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sorter stigende' }))
    expect(names()).toEqual(['Vegger', 'Tepper', 'Skilt', 'Dører (sist)'])
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sorter stigende' }))
    expect(names()).toEqual(['Vegger', 'Tepper', 'Skilt', 'Dører (sist)'])
  })

  it('offers a filter and a sorting for a column with text, a sorting alone for one sorted by something else, and neither for the rest', () => {
    render(<Rates />)
    const heads = screen.getAllByRole('columnheader')
    expect(heads.map((head) => head.querySelectorAll('.col-sort').length)).toEqual([1, 1, 1, 0])
    expect(heads.map((head) => head.querySelectorAll('.col-filter').length)).toEqual([0, 1, 0, 0])
  })

  it('keeps the rows with a ticked value, and says so when none are left', () => {
    render(<Rates />)
    fireEvent.click(screen.getByRole('button', { name: 'Filtrer kolonnen' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /lm/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /m²/ }))
    expect(names()).toEqual(['Skilt', 'Dører (sist)'])
    fireEvent.click(screen.getByRole('button', { name: 'Fjern alle' }))
    expect(names()).toEqual(['Ingen rader passer filteret.'])
  })

  it('draws no more rows than the limit', () => {
    render(<Rates limit={2} />)
    expect(names()).toEqual(['Vegger', 'Tepper (sist)'])
  })
})
