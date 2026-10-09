import assert from 'node:assert/strict'
import test from 'node:test'
import { AdminPasswordInputError, validateCurrentAdminPassword, validateNewAdminPassword } from './admin-password'

test('new password enforces length and bcrypt byte limit', () => {
  assert.throws(() => validateNewAdminPassword('short'), AdminPasswordInputError)
  assert.equal(validateNewAdminPassword('abcdefghijkl'), 'abcdefghijkl')
  assert.equal(validateNewAdminPassword('a'.repeat(72)), 'a'.repeat(72))
  assert.throws(() => validateNewAdminPassword('a'.repeat(73)), AdminPasswordInputError)
  assert.throws(() => validateNewAdminPassword('あ'.repeat(25)), AdminPasswordInputError)
})

test('current password rejects empty and excessive input', () => {
  assert.throws(() => validateCurrentAdminPassword(''), AdminPasswordInputError)
  assert.throws(() => validateCurrentAdminPassword('a'.repeat(257)), AdminPasswordInputError)
  assert.equal(validateCurrentAdminPassword('current-secret'), 'current-secret')
})
