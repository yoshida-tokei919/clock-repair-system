import assert from 'node:assert/strict'
import test from 'node:test'
import { build, type Plugin } from 'esbuild'

const state = globalThis as typeof globalThis & {
  __sessionAdmin: any
  __sessionCompare: boolean
}

async function options() {
  const modules: Record<string, string> = {
    'next-auth/providers/credentials': 'export default (options) => options;',
    '@/lib/prisma': 'export const prisma = { admin: { findUnique: async () => globalThis.__sessionAdmin } };',
    'bcryptjs': 'export default { compare: async () => globalThis.__sessionCompare };',
  }
  const plugin: Plugin = { name: 'admin-session-stubs', setup(api) {
    api.onResolve({ filter: /^(?:next-auth\/providers\/credentials|@\/lib\/prisma|bcryptjs)$/ }, args => ({ path: args.path, namespace: 'stub' }))
    api.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: modules[args.path], loader: 'js' }))
  } }
  const built = await build({ entryPoints: ['src/lib/auth.ts'], bundle: true, platform: 'node',
    format: 'esm', write: false, plugins: [plugin], external: ['next-auth'] })
  const target = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)
  return target.authOptions
}

test('Admin login requires an existing admin role and valid password', async () => {
  process.env.NEXTAUTH_SECRET = 'test-only-nextauth-secret'
  const auth = await options()
  const authorize = auth.providers[0].authorize
  state.__sessionAdmin = null
  assert.equal(await authorize({ email: 'admin@example.com', password: 'current-password' }), null)
  state.__sessionAdmin = { id: 7, name: 'Admin', email: 'admin@example.com', role: 'staff', passwordHash: 'old-hash' }
  assert.equal(await authorize({ email: 'admin@example.com', password: 'current-password' }), null)
  state.__sessionAdmin.role = 'admin'
  state.__sessionCompare = false
  assert.equal(await authorize({ email: 'admin@example.com', password: 'wrong-password' }), null)
  state.__sessionCompare = true
  const user = await authorize({ email: 'admin@example.com', password: 'current-password' })
  assert.equal(user.id, '7')
  assert.equal(typeof user.adminCredentialFingerprint, 'string')
})

test('JWT loses protected identity when Admin disappears or credentials change', async () => {
  process.env.NEXTAUTH_SECRET = 'test-only-nextauth-secret'
  const auth = await options()
  state.__sessionAdmin = { id: 7, name: 'Admin', email: 'admin@example.com', role: 'admin', passwordHash: 'old-hash' }
  state.__sessionCompare = true
  const user = await auth.providers[0].authorize({ email: 'admin@example.com', password: 'current-password' })
  const token = await auth.callbacks.jwt({ token: { sub: '7', email: user.email }, user })
  assert.equal((await auth.callbacks.jwt({ token })).email, 'admin@example.com')
  state.__sessionAdmin.passwordHash = 'new-hash'
  const stale = await auth.callbacks.jwt({ token })
  assert.equal(stale.email, undefined)
  const session = await auth.callbacks.session({ session: { user: { email: 'admin@example.com' } }, token: stale })
  assert.equal(session.user.email, null)
  state.__sessionAdmin = null
  assert.equal((await auth.callbacks.jwt({ token })).email, undefined)
  state.__sessionAdmin = { id: 7, email: 'admin@example.com', role: 'staff', passwordHash: 'old-hash' }
  assert.equal((await auth.callbacks.jwt({ token })).email, undefined)
  state.__sessionAdmin.role = 'admin'
  state.__sessionAdmin.email = 'renamed@example.com'
  assert.equal((await auth.callbacks.jwt({ token })).email, undefined)
})
