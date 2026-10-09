import assert from 'node:assert/strict'
import test from 'node:test'
import { build, type Plugin } from 'esbuild'

const state = globalThis as typeof globalThis & {
  __authSession: any; __authAdmin: any; __authCompare: boolean; __authUpdateCount: number
  __authUpdateArgs: any; __authHashArgs: any
}

async function route() {
  const modules: Record<string, string> = {
    'next-auth': 'export const getServerSession = async () => globalThis.__authSession;',
    'next/server': 'export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };',
    '@/lib/auth': 'export const authOptions = {};',
    '@/lib/prisma': "export const prisma = { admin: { findUnique: async () => globalThis.__authAdmin, updateMany: async (args) => { globalThis.__authUpdateArgs = args; return { count: globalThis.__authUpdateCount }; } } };",
    'bcryptjs': "export default { compare: async () => globalThis.__authCompare, hash: async (value, rounds) => { globalThis.__authHashArgs = [value, rounds]; return 'new-hash'; } };",
  }
  const plugin: Plugin = { name: 'admin-password-route-stubs', setup(api) {
    api.onResolve({ filter: /^(?:next-auth|next\/server|bcryptjs|@\/lib\/auth|@\/lib\/prisma)$/ }, args => ({ path: args.path, namespace: 'stub' }))
    api.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: modules[args.path], loader: 'js' }))
  } }
  const built = await build({ entryPoints: ['src/app/api/admin/password/route.ts'], bundle: true,
    platform: 'node', format: 'esm', write: false, plugins: [plugin] })
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)
}

function request(currentPassword = 'current-password', newPassword = 'new-password-123') {
  return new Request('http://localhost/api/admin/password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

test('password change requires a real admin session', async () => {
  const target = await route()
  state.__authSession = null
  state.__authAdmin = { id: 1, role: 'admin', passwordHash: 'old-hash' }
  assert.equal((await target.POST(request())).status, 401)
  state.__authSession = { user: { email: 'admin@example.com' } }
  state.__authAdmin = null
  assert.equal((await target.POST(request())).status, 401)
  state.__authAdmin = { id: 1, role: 'staff', passwordHash: 'old-hash' }
  assert.equal((await target.POST(request())).status, 401)
})

test('password change checks current secret and guards the update', async () => {
  const target = await route()
  state.__authSession = { user: { email: 'admin@example.com' } }
  state.__authAdmin = { id: 7, role: 'admin', passwordHash: 'old-hash' }
  state.__authCompare = false
  state.__authUpdateCount = 1
  assert.equal((await target.POST(request())).status, 400)
  assert.equal(state.__authUpdateArgs, undefined)
  state.__authCompare = true
  const response = await target.POST(request())
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { success: true })
  assert.deepEqual(state.__authHashArgs, ['new-password-123', 12])
  assert.deepEqual(state.__authUpdateArgs!.where, { id: 7, role: 'admin', passwordHash: 'old-hash' })
  assert.deepEqual(state.__authUpdateArgs!.data, { passwordHash: 'new-hash' })
})

test('password change rejects invalid input and a concurrent credential change', async () => {
  const target = await route()
  state.__authSession = { user: { email: 'admin@example.com' } }
  state.__authAdmin = { id: 7, role: 'admin', passwordHash: 'old-hash' }
  state.__authCompare = true
  assert.equal((await target.POST(request('same-password', 'same-password'))).status, 400)
  assert.equal((await target.POST(request('current-password', 'short'))).status, 400)
  state.__authUpdateCount = 0
  assert.equal((await target.POST(request())).status, 409)
})
