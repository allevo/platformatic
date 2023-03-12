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

test('graphql client generation (javascript)', async ({ teardown, comment, same }) => {
  try {
    await fs.unlink(desm.join(import.meta.url, 'fixtures', 'movies', 'db.sqlite'))
  } catch {
    // noop
  }
  const server = await buildServer(desm.join(import.meta.url, 'fixtures', 'movies', 'zero.db.json'))

  await server.listen()

  const dir = join(tmpdir(), `platformatic-client-${process.pid}-${counter++}`)
  await fs.mkdir(dir)
  const cwd = process.cwd()
  process.chdir(dir)
  teardown(() => process.chdir(cwd))
  teardown(() => fs.rm(dir, { recursive: true }))

  comment(`working in ${dir}`)
  await execa('node', [desm.join(import.meta.url, '..', 'cli.mjs'), server.url + '/graphql', '--name', 'movies'])

  comment(`server at ${server.url}`)

  const toWrite = `
'use strict'

const Fastify = require('fastify')
const movies = require('./movies')
const app = Fastify({ logger: true })

app.register(movies, { url: '${server.url}' })
app.post('/', async (request, reply) => {
  const res = await app.movies.graphql({
    query: 'mutation { saveMovie(input: { title: "foo" }) { id, title } }'
  })
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
  teardown(server.stop)

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

test('graphql client generation (typescript)', async ({ teardown, comment, same }) => {
  try {
    await fs.unlink(desm.join(import.meta.url, 'fixtures', 'movies', 'db.sqlite'))
  } catch {
    // noop
  }
  const server = await buildServer(desm.join(import.meta.url, 'fixtures', 'movies', 'zero.db.json'))

  await server.listen()

  const dir = join(tmpdir(), `platformatic-client-${process.pid}-${counter++}`)
  await fs.mkdir(dir)
  const cwd = process.cwd()
  process.chdir(dir)
  teardown(() => process.chdir(cwd))
  teardown(() => fs.rm(dir, { recursive: true }))

  comment(`working in ${dir}`)
  await execa('node', [desm.join(import.meta.url, '..', 'cli.mjs'), server.url + '/graphql', '--name', 'movies'])

  const toWrite = `
import Fastify from 'fastify';
import movies from './movies';

const app = Fastify({ logger: true });
app.register(movies, {
  url: '${server.url}'
});

app.post('/', async () => {
  const res = await app.movies.graphql({
    query: 'mutation { saveMovie(input: { title: "foo" }) { id, title } }'
  })
  return res 
})

app.listen({ port: 0 });
`

  await fs.writeFile(join(dir, 'index.ts'), toWrite)

  const tsconfig = JSON.stringify({
    extends: 'fastify-tsconfig',
    compilerOptions: {
      outDir: 'build',
      target: 'es2018',
      lib: ['es2018']
    }
  }, null, 2)

  await fs.writeFile(join(dir, 'tsconfig.json'), tsconfig)

  await fs.mkdir(join(dir, 'node_modules'))
  await fs.mkdir(join(dir, 'node_modules', '@platformatic'))
  await fs.symlink(join(cwd, 'node_modules', 'fastify'), join(dir, 'node_modules', 'fastify'))
  await fs.symlink(join(cwd, 'node_modules', 'fastify-tsconfig'), join(dir, 'node_modules', 'fastify-tsconfig'))
  await fs.symlink(desm.join(import.meta.url, '..'), join(dir, 'node_modules', '@platformatic', 'client'))

  const tsc = desm.join(import.meta.url, '..', 'node_modules', '.bin', 'tsc')
  await execa(tsc)

  // TODO how can we avoid this symlink?
  await fs.symlink(join(dir, 'movies'), join(dir, 'build', 'movies'))

  const server2 = execa('node', ['build/index.js'])
  teardown(() => server2.kill())
  teardown(server.stop)

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

test('graphql client generation with relations (typescript)', async ({ teardown, comment, same, match }) => {
  try {
    await fs.unlink(desm.join(import.meta.url, 'fixtures', 'movies', 'db.sqlite'))
  } catch {
    // noop
  }
  const server = await buildServer(desm.join(import.meta.url, 'fixtures', 'movies-quotes', 'platformatic.db.json'))

  await server.listen()

  const dir = join(tmpdir(), `platformatic-client-${process.pid}-${counter++}`)
  await fs.mkdir(dir)
  const cwd = process.cwd()
  process.chdir(dir)
  teardown(() => process.chdir(cwd))
  teardown(() => fs.rm(dir, { recursive: true }))

  comment(`working in ${dir}`)
  await execa('node', [desm.join(import.meta.url, '..', 'cli.mjs'), server.url + '/graphql', '--name', 'movies'])

  const toWrite = `
import Fastify from 'fastify';
import movies from './movies';
import type { Movie, Quote } from './movies';

const app = Fastify({ logger: true });
app.register(movies, {
  url: '${server.url}'
});

app.post('/', async () => {
  console.log('aaa')
  const res1 = await app.movies.graphql<Movie>({
    query: \`mutation {
      saveMovie(input: { title: "foo" }) { id, title } }
    \` 
  })
  console.log('bbb')
  const res2 = await app.movies.graphql<Quote>({
    query: \`
      mutation saveQuote($movieId: ID!) {
        saveQuote(input: { movieId: $movieId, quote: "foo"}) {
          id
          quote
          movie {
            id
            title
          }
        }
      }
    \`,
    variables: {
      movieId: res1.id
    }
  })
  console.log('ccc')
  return res2
})

app.listen({ port: 0});
`

  await fs.writeFile(join(dir, 'index.ts'), toWrite)

  const tsconfig = JSON.stringify({
    extends: 'fastify-tsconfig',
    compilerOptions: {
      outDir: 'build',
      target: 'es2018',
      lib: ['es2018']
    }
  }, null, 2)

  await fs.writeFile(join(dir, 'tsconfig.json'), tsconfig)

  await fs.mkdir(join(dir, 'node_modules'))
  await fs.mkdir(join(dir, 'node_modules', '@platformatic'))
  await fs.symlink(join(cwd, 'node_modules', 'fastify'), join(dir, 'node_modules', 'fastify'))
  await fs.symlink(join(cwd, 'node_modules', 'fastify-tsconfig'), join(dir, 'node_modules', 'fastify-tsconfig'))
  await fs.symlink(desm.join(import.meta.url, '..'), join(dir, 'node_modules', '@platformatic', 'client'))

  const tsc = desm.join(import.meta.url, '..', 'node_modules', '.bin', 'tsc')
  await execa(tsc)

  // TODO how can we avoid this symlink?
  await fs.symlink(join(dir, 'movies'), join(dir, 'build', 'movies'))

  const server2 = execa('node', ['build/index.js'])
  teardown(() => server2.kill())
  teardown(server.stop)

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
  match(body, {
    quote: 'foo',
    movie: {
      title: 'foo'
    }
  })
})

test('graphql client generation (javascript) with slash at the end of the URL', async ({ teardown, comment, same }) => {
  try {
    await fs.unlink(desm.join(import.meta.url, 'fixtures', 'movies', 'db.sqlite'))
  } catch {
    // noop
  }
  const server = await buildServer(desm.join(import.meta.url, 'fixtures', 'movies', 'zero.db.json'))

  await server.listen()

  const dir = join(tmpdir(), `platformatic-client-${process.pid}-${counter++}`)
  await fs.mkdir(dir)
  const cwd = process.cwd()
  process.chdir(dir)
  teardown(() => process.chdir(cwd))
  teardown(() => fs.rm(dir, { recursive: true }))

  comment(`working in ${dir}`)
  await execa('node', [desm.join(import.meta.url, '..', 'cli.mjs'), server.url + '/graphql', '--name', 'movies'])

  comment(`server at ${server.url}`)

  const toWrite = `
'use strict'

const Fastify = require('fastify')
const movies = require('./movies')
const app = Fastify({ logger: true })

app.register(movies, { url: '${server.url}/' })
app.post('/', async (request, reply) => {
  const res = await app.movies.graphql({
    query: 'mutation { saveMovie(input: { title: "foo" }) { id, title } }'
  })
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
  teardown(server.stop)

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