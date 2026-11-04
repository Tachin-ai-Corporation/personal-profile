/**
 * Whether a fixed-layout table's columns have room at a given width (#63
 * review: at tablet widths the Contacts columns shrank to ~25 px and the
 * insurance keys ran into their values). The shared tables use it to fall
 * back to a narrower layout until every column fits its header and a
 * minimum width.
 */

/** A width class's px as a linear function of its container's width W: `slope · W + offset` (`w-[34%]` → 0.34 W, `w-60` → 240). */
export interface ColumnLength {
  readonly slope: number
  readonly offset: number
}

export interface FitColumn {
  /** The column's width class, measured; `null` shares what the sized columns leave. */
  readonly length: ColumnLength | null
  /** The least px the column needs (its header's longest word plus padding, or a floor). */
  readonly min: number
}

const at = (length: ColumnLength, width: number): number => length.slope * width + length.offset

/** What the sized and `fixed` columns leave for the unsized ones at `width`. */
function leftover(width: number, columns: readonly FitColumn[], fixed: readonly ColumnLength[]): number {
  const taken = [...columns.flatMap((column) => (column.length ? [column.length] : [])), ...fixed]
  return width - taken.reduce((sum, length) => sum + at(length, width), 0)
}

/**
 * Whether every column gets at least its `min` in a `table-layout: fixed`
 * table `width` px wide: sized columns (and `fixed`, e.g. the actions column)
 * take their width first, and the unsized ones need their mins together
 * (`sharedWidths` hands each its min plus an equal part of the rest).
 */
export function columnsFit(width: number, columns: readonly FitColumn[], fixed: readonly ColumnLength[] = []): boolean {
  if (columns.some((column) => column.length !== null && at(column.length, width) < column.min)) return false
  const needed = columns.reduce((sum, column) => sum + (column.length === null ? column.min : 0), 0)
  // Half a px of slack: percentages summing to 100 % can leave −1e-13 (key/value at 930 px).
  return leftover(width, columns, fixed) + 0.5 >= needed
}

/**
 * The px width of each unsized column (in column order, `null` for sized
 * ones): its min plus an equal part of what is left over, so a long header
 * ("Notifications") gets room before short ones get more.
 */
export function sharedWidths(width: number, columns: readonly FitColumn[], fixed: readonly ColumnLength[] = []): (number | null)[] {
  const shared = columns.filter((column) => column.length === null)
  const needed = shared.reduce((sum, column) => sum + column.min, 0)
  const extra = Math.max(0, leftover(width, columns, fixed) - needed) / Math.max(1, shared.length)
  return columns.map((column) => (column.length === null ? column.min + extra : null))
}

const lengths = new Map<string, ColumnLength>()
const minContents = new Map<string, number>()

function probe(element: HTMLElement, style: string): () => void {
  element.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;${style}`
  document.body.append(element)
  return () => element.remove()
}

/** The px width of a `className` element inside a `container` px wide container (a fresh probe each time: a resized one kept its first width). */
function widthIn(container: number, className: string): number {
  const outer = document.createElement("div")
  const inner = document.createElement("div")
  inner.className = className
  outer.append(inner)
  const remove = probe(outer, `width:${container}px`)
  const width = inner.getBoundingClientRect().width
  remove()
  return width
}

/** Measures a width class (`w-[34%]`, `w-60`) at two container widths, once per class. */
export function measureLength(className: string): ColumnLength {
  const cached = lengths.get(className)
  if (cached) return cached
  const narrow = widthIn(1000, className)
  const wide = widthIn(2000, className)
  const slope = (wide - narrow) / 1000
  const length = { slope, offset: narrow - slope * 1000 }
  lengths.set(className, length)
  return length
}

let watchingFonts = false

/** The min-content width of `text` styled by `className` (its longest word, plus the class's padding), once per pair and web font load. */
export function measureMinContent(text: string, className: string): number {
  if (!watchingFonts && document.fonts) {
    watchingFonts = true
    document.fonts.addEventListener("loadingdone", () => minContents.clear())
  }
  const key = `${className}\n${text}`
  const cached = minContents.get(key)
  if (cached !== undefined) return cached
  const span = document.createElement("span")
  span.className = className
  span.textContent = text
  const remove = probe(span, "width:min-content;height:auto;white-space:normal;overflow-wrap:normal")
  const width = Math.ceil(span.getBoundingClientRect().width)
  remove()
  // Not cached while web fonts are still loading: the fallback font's widths would stick.
  if (document.fonts?.status !== "loading") minContents.set(key, width)
  return width
}
