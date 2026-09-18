// Python str.strip() whitespace set (29 code points). Deliberately excludes
// U+FEFF, which JavaScript trim() removes but Python strip() does not.
const PY_SPACE = '[\\u0009-\\u000D\\u001C-\\u001F\\u0020\\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]'
const LEFT = new RegExp(`^${PY_SPACE}+`, 'u')
const RIGHT = new RegExp(`${PY_SPACE}+$`, 'u')

export const STUDIONET_TEXT_SOFT_LIMIT_BYTES = 150

export function pyStrip(value) {
  return String(value ?? '').replace(LEFT, '').replace(RIGHT, '')
}

export function utf8Bytes(value) {
  return new TextEncoder().encode(String(value ?? '')).length
}

export function textBudget(value, limit = STUDIONET_TEXT_SOFT_LIMIT_BYTES) {
  const bytes = utf8Bytes(value)
  return {
    bytes,
    limit,
    ok: bytes <= limit,
    message: bytes <= limit
      ? `${bytes} / ${limit} UTF-8 bytes`
      : `${bytes} / ${limit} UTF-8 bytes — shorten before submitting on StudioNet`,
  }
}

export function assertTextBudget(value, label = 'Text') {
  const budget = textBudget(value)
  if (!budget.ok) {
    throw new Error(`${label} exceeds the conservative StudioNet text budget (${budget.message}).`)
  }
  return budget
}
