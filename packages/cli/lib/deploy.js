'use strict'

import { isAbsolute, dirname, relative } from 'path'

import pino from 'pino'
import pretty from 'pino-pretty'
import inquirer from 'inquirer'
import parseArgs from 'minimist'
import deployClient from '@platformatic/deploy-client'

export const DEPLOY_SERVICE_HOST = 'https://plt-development-deploy-service.fly.dev'

const WORKSPACE_TYPES = ['static', 'dynamic']
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const logger = pino(pretty({
  translateTime: 'SYS:HH:MM:ss',
  ignore: 'hostname,pid'
}))

export async function deploy (argv) {
  const args = parseArgs(argv, {
    alias: {
      config: 'c',
      type: 't',
      env: 'e',
      secrets: 's'
    },
    string: [
      'type',
      'label',
      'workspace-id',
      'workspace-key',
      'deploy-service-host'
    ],
    default: {
      'deploy-service-host': DEPLOY_SERVICE_HOST
    }
  })

  let workspaceType = args.type
  /* c8 ignore next 9 */
  if (!workspaceType) {
    const answer = await inquirer.prompt({
      type: 'list',
      name: 'workspaceType',
      message: 'Select workspace type:',
      choices: WORKSPACE_TYPES
    })
    workspaceType = answer.workspaceType
  }

  if (!WORKSPACE_TYPES.includes(workspaceType)) {
    logger.error(
      `Invalid workspace type provided: "${workspaceType}". ` +
      `Type must be one of: ${WORKSPACE_TYPES.join(', ')}.`
    )
    process.exit(1)
  }

  let workspaceId = args['workspace-id']
  /* c8 ignore next 8 */
  if (!workspaceId) {
    const answer = await inquirer.prompt({
      type: 'input',
      name: 'workspaceId',
      message: 'Enter workspace id:'
    })
    workspaceId = answer.workspaceId
  }

  if (!UUID_REGEX.test(workspaceId)) {
    logger.error('Invalid workspace id provided. Workspace id must be a valid uuid.')
    process.exit(1)
  }

  let workspaceKey = args['workspace-key']
  /* c8 ignore next 9 */
  if (!workspaceKey) {
    const answer = await inquirer.prompt({
      type: 'password',
      name: 'workspaceKey',
      message: 'Enter workspace key:',
      mask: '*'
    })
    workspaceKey = answer.workspaceKey
  }

  let label = args.label
  /* c8 ignore next 9 */
  if (workspaceType === 'dynamic' && !label) {
    const answer = await inquirer.prompt({
      type: 'input',
      name: 'label',
      message: 'Enter deploy label:',
      default: 'cli:deploy-1'
    })
    label = answer.label
  }

  let pathToConfig = args.config
  let pathToProject = process.cwd()

  if (pathToConfig && isAbsolute(pathToConfig)) {
    pathToProject = dirname(pathToConfig)
    pathToConfig = relative(pathToProject, pathToConfig)
  }

  const pathToEnvFile = args.env || '.env'
  const pathToSecretsFile = args.secrets || '.secrets.env'
  const deployServiceHost = args['deploy-service-host']

  await deployClient.deploy({
    deployServiceHost,
    workspaceId,
    workspaceKey,
    pathToProject,
    pathToConfig,
    pathToEnvFile,
    pathToSecretsFile,
    secrets: {},
    variables: {},
    label,
    logger
  })
}
