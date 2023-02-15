import { request } from './helper.js'
import { tmpdir } from 'os'
import { test } from 'tap'
import { buildServer } from '@platformatic/db'
import { join } from 'path'
import * as desm from 'desm'
import { execa } from 'execa'
import { promises as fs } from 'fs'
import split from 'split2'

let counter = 0

test('openapi client generation', async ({ teardown, comment, same }) => {
  try {
    await fs.unlink(desm.join(import.meta.url, 'fixtures', 'movies', 'db.sqlite'))
  } catch {
    // noop
  }
  const server = await buildServer(desm.join(import.meta.url, 'fixtures', 'movies', 'zero.db.json'))
  teardown(server.stop)

  await server.listen()

  const dir = join(tmpdir(), `platformatic-client-${process.pid}-${counter++}`)
  await fs.mkdir(dir)
  const cwd = process.cwd()
  process.chdir(dir)
  teardown(() => process.chdir(cwd))
  teardown(() => fs.rm(dir, { recursive: true }))

  comment(`working in ${dir}`)
  await execa('node', [desm.join(import.meta.url, '..', 'cli.mjs'), server.url + '/documentation/json', '--name', 'movies'])

  const toWrite = `
'use strict'

const Fastify = require('fastify')
const movies = require('./movies')
const app = Fastify({ logger: true })

app.register(movies, { url: '${server.url}' })
app.post('/', async (request, reply) => {
  const res = await app.movies.createMovie({ title: 'foo' })
  return res 
})
app.listen({ port: 0 })
`
  await fs.writeFile(join(dir, 'index.js'), toWrite)
  await fs.mkdir(join(dir, 'node_modules'))
  await fs.mkdir(join(dir, 'node_modules', '@platformatic'))
  await fs.symlink(join(cwd, 'node_modules', 'fastify'), join(dir, 'node_modules', 'fastify'))
  await fs.symlink(desm.join(import.meta.url, '..'), join(dir, 'node_modules', '@platformatic', 'client'))

  const server2 = execa('node', ['index.js'])
  teardown(() => server2.kill())

  const stream = server2.stdout.pipe(split(JSON.parse))

  // this is unfortuate :(
  const base = 'Server listening at '
  let url
  for await (const line of stream) {
    const msg = line.msg
    if (msg.indexOf(base) !== 0) {
      continue
    }
    url = msg.slice(base.length)
    break
  }
  const res = await request(url, {
    method: 'POST'
  })
  const body = await res.body.json()
  same(body, {
    id: 1,
    title: 'foo'
  })
})
