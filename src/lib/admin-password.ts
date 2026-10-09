export class AdminPasswordInputError extends Error {}

export function validateNewAdminPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 12) {
    throw new AdminPasswordInputError('新しいパスワードは12文字以上にしてください。')
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new AdminPasswordInputError('新しいパスワードはUTF-8で72バイト以下にしてください。')
  }
  return password
}

export function validateCurrentAdminPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length === 0 || password.length > 256) {
    throw new AdminPasswordInputError('現在のパスワードを確認してください。')
  }
  return password
}
