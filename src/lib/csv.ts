import Papa from 'papaparse'
import { resolveCategory } from './categories'
import type { CategoryId } from './types'

export interface ParsedRow {
  line: number
  holderName: string
  category: CategoryId | null
  rawCategory: string
  email: string
  phone: string
  reference: string
  seat: string
  valid: boolean
  errors: string[]
}

export interface ParseResult {
  rows: ParsedRow[]
  validCount: number
  errorCount: number
}

// Synonymes de colonnes acceptés (insensible à la casse / accents).
const FIELD_ALIASES: Record<string, string[]> = {
  holderName: ['nom', 'name', 'nom complet', 'fullname', 'full name', 'titulaire', 'beneficiaire'],
  category: ['categorie', 'category', 'cat', 'type', 'billet', 'ticket'],
  email: ['email', 'mail', 'e-mail', 'courriel'],
  phone: ['telephone', 'phone', 'tel', 'gsm', 'numero de telephone', 'contact'],
  reference: ['reference', 'ref', 'numero', 'numero de billet', 'no', 'id'],
  seat: ['place', 'seat', 'siege', 'siège', 'table'],
}

function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function buildHeaderMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const h of headers) {
    const norm = normalizeKey(h)
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(norm)) {
        map[field] = h
        break
      }
    }
  }
  return map
}

export function parseCsv(text: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const headers = result.meta.fields || []
  const map = buildHeaderMap(headers)

  const get = (row: Record<string, string>, field: string) =>
    map[field] ? (row[map[field]] || '').trim() : ''

  const rows: ParsedRow[] = result.data.map((row, i) => {
    const holderName = get(row, 'holderName')
    const rawCategory = get(row, 'category')
    const category = resolveCategory(rawCategory)
    const errors: string[] = []
    if (!holderName) errors.push('Nom manquant')
    if (!rawCategory) errors.push('Catégorie manquante')
    else if (!category) errors.push(`Catégorie inconnue: "${rawCategory}"`)

    return {
      line: i + 2, // +1 entête, +1 base 1
      holderName,
      category,
      rawCategory,
      email: get(row, 'email'),
      phone: get(row, 'phone'),
      reference: get(row, 'reference'),
      seat: get(row, 'seat'),
      valid: errors.length === 0,
      errors,
    }
  })

  return {
    rows,
    validCount: rows.filter((r) => r.valid).length,
    errorCount: rows.filter((r) => !r.valid).length,
  }
}

export const CSV_TEMPLATE =
  'nom,categorie,email,telephone,reference,place\n' +
  'Jean Mukendi,VVIP,jean@exemple.com,+243990000000,SL-0001,VVIP-1\n' +
  'Marie Kabasele,VIP,marie@exemple.com,+243991111111,,\n' +
  'Patrick Ilunga,Standard,,+243992222222,,\n'

export function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'modele_import_billets.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
