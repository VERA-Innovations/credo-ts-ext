import type { CredoRestAgentConfig } from './CredoRestConfig'
import type { RestRootAgent, RestRootAgentWithTenants } from '../utils/agent'
import type { InitConfig } from '@credo-ts/core'
import type { IndyVdrPoolConfig } from '@credo-ts/indy-vdr'

import {LogLevel, Agent } from '@credo-ts/core'
import { agentDependencies, DidCommHttpInboundTransport } from '@credo-ts/node'
import { DidCommAutoAcceptProof } from '@credo-ts/didcomm'
import { DidCommAutoAcceptCredential } from '@credo-ts/didcomm'

import { getAgentModules } from '../utils/agent'
import { TsLogger } from '../utils/logger'

import { outboundTransportMapping, inboundTransportMapping } from './CredoRestConfig'

export async function createRestAgent(config: CredoRestAgentConfig): Promise<RestRootAgent | RestRootAgentWithTenants> {
  const {
    logLevel,
    inboundTransports = [],
    outboundTransports = [],
    indyLedgers = [],
    cheqdLedgers = {},
    autoAcceptConnections = true,
    autoAcceptCredentials = DidCommAutoAcceptCredential.ContentApproved,
    autoAcceptMediationRequests = true,
    autoAcceptProofs = DidCommAutoAcceptProof.ContentApproved,
    multiTenant = false,
    ...credoConfig
  } = config

  const logger = new TsLogger(logLevel ?? LogLevel.error)

  const agentConfig: InitConfig = {
    ...credoConfig,
    logger,
  }

  const httpEndpoint = credoConfig.endpoints?.find(
    (endpoint) => endpoint.startsWith('http://') || endpoint.startsWith('https://'),
  )
  // FIXME: For OID4VC this will be required
  // if (!httpEndpoint) {
  //   throw new Error('No http endpoint found in config, unable to set up OpenID4VC modules.')
  // }

  const maybeIndyLedgers =
    indyLedgers.length > 0 ? (indyLedgers as [IndyVdrPoolConfig, ...IndyVdrPoolConfig[]]) : undefined
  const maybeCheqdLedgers = cheqdLedgers ? config.cheqdLedgers : undefined
  const modules = getAgentModules({
    autoAcceptConnections,
    autoAcceptProofs,
    autoAcceptCredentials,
    autoAcceptMediationRequests,
    indyLedgers: maybeIndyLedgers,
    cheqdLedgers: maybeCheqdLedgers,
    multiTenant,
    // baseUrl: httpEndpoint,
  })

  const agent = new Agent({
    config: agentConfig,
    dependencies: agentDependencies,
    modules: {
            ...modules,
            ...(config.extraModules ?? {})
    },
  })

  // Register outbound transports
  for (const outboundTransport of outboundTransports) {
    const OutboundTransport = outboundTransportMapping[outboundTransport]
    agent.didcomm.registerOutboundTransport(new OutboundTransport())
  }

  // Register inbound transports
  for (const inboundTransport of inboundTransports) {
    const InboundTransport = inboundTransportMapping[inboundTransport.transport]
    const transport = new InboundTransport({ port: inboundTransport.port })
    agent.didcomm.registerInboundTransport(transport)

    // Configure the oid4vc routers on the http inbound transport
    // if (transport instanceof DidCommHttpInboundTransport) {
    //   transport.app.use('/oid4vci', modules.openid4vc.issuer?.config.app._router)
    //   transport.app.use('/siop', modules.openid4vc.verifier?.config.app._router)
    // }
  }

  await agent.initialize()
  return agent
}
