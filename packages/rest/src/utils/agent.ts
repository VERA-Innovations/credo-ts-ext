// import type { OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions } from '../controllers/openid4vc/issuance-sessions/OpenId4VcIssuanceSessionsControllerTypes'
import type { AnonCredsRegistry } from '@credo-ts/anoncreds'
import { DidCommAutoAcceptCredential, DidCommAutoAcceptProof, DidCommCredentialV2Protocol, DidCommMediatorModule, DidCommModule, DidCommProofV2Protocol } from '@credo-ts/didcomm'
import { IndyVdrAnonCredsRegistry, IndyVdrIndyDidRegistrar, IndyVdrIndyDidResolver, IndyVdrModule, IndyVdrSovDidResolver, type IndyVdrPoolConfig } from '@credo-ts/indy-vdr'
import { TenantAgent, TenantsModule } from '@credo-ts/tenants'

import {
  AnonCredsDidCommCredentialFormatService,
  AnonCredsDidCommProofFormatService,
  AnonCredsModule,
  LegacyIndyDidCommCredentialFormatService,
  LegacyIndyDidCommProofFormatService,
  DidCommCredentialV1Protocol,
  DidCommProofV1Protocol,
} from '@credo-ts/anoncreds'
import { AskarModule, AskarMultiWalletDatabaseScheme } from '@credo-ts/askar'
import { ClaimFormat, X509Certificate, X509Service, type Agent, type SdJwtVcHolderBinding } from '@credo-ts/core'
import {
  DidsModule,
  KeyDidRegistrar,
  JwkDidRegistrar,
  PeerDidRegistrar,
  WebDidResolver,
  KeyDidResolver,
  JwkDidResolver,
  PeerDidResolver,
} from '@credo-ts/core'
import {
  OpenId4VcIssuerModule,
  OpenId4VcHolderModule,
  OpenId4VcVerifierModule,
  OpenId4VcModule,
  type OpenId4VciCredentialRequestToCredentialMapper,
  OpenId4VciCredentialFormatProfile,
  type OpenId4VciSignSdJwtCredentials,
} from '@credo-ts/openid4vc'

import { anoncredsNodeJS as anoncreds } from '@hyperledger/anoncreds-nodejs'
import { indyVdr } from '@hyperledger/indy-vdr-nodejs'

// import type { OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions } from '../controllers/openid4vc/issuance-sessions/OpenId4VcIssuanceSessionsControllerTypes'
import { askar as askarNodeJS } from '@openwallet-foundation/askar-nodejs'

import { CheqdNetworkConfig } from '../setup/CredoRestConfig'
import { CheqdModuleConfigOptions, CheqdModule, CheqdDidRegistrar, CheqdDidResolver, CheqdAnonCredsRegistry } from '@credo-ts/cheqd'
import { parsedArgs } from '../cli'
import { getDatabaseConfig } from './util'

type ModulesWithoutTenants = Omit<ReturnType<typeof getAgentModules>, 'tenants'>

export type RestRootAgent = Agent<ModulesWithoutTenants>
export type RestRootAgentWithTenants = Agent<ModulesWithoutTenants & { tenants: TenantsModule<ModulesWithoutTenants> }>
export type RestTenantAgent = TenantAgent<ModulesWithoutTenants>
export type RestAgent = RestRootAgent | RestTenantAgent | RestRootAgentWithTenants

export function getAgentModules(options: {
  autoAcceptConnections: boolean
  autoAcceptProofs: DidCommAutoAcceptProof
  autoAcceptCredentials: DidCommAutoAcceptCredential
  autoAcceptMediationRequests: boolean
  indyLedgers?: [IndyVdrPoolConfig, ...IndyVdrPoolConfig[]]
  cheqdLedgers?: CheqdModuleConfigOptions
  extraAnonCredsRegistries?: AnonCredsRegistry[]
  multiTenant: boolean
  // baseUrl: string
}) {
  const legacyIndyCredentialFormatService = new LegacyIndyDidCommCredentialFormatService()
  const legacyIndyProofFormatService = new LegacyIndyDidCommProofFormatService()

  // const baseUrlWithoutSlash = options.baseUrl.endsWith('/') ? options.baseUrl.slice(0, -1) : options.baseUrl

  const baseModules = {
    anoncreds: new AnonCredsModule({
      registries: (options.extraAnonCredsRegistries ?? []) as [AnonCredsRegistry],
      anoncreds,
    }),
    askar: new AskarModule({
      askar: askarNodeJS,
      // multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
      store: {
        id: parsedArgs['wallet-id'],
        key: parsedArgs['wallet-key'],
        database: getDatabaseConfig(parsedArgs),
      },
    }),
    didcomm: new DidCommModule({
      processDidCommMessagesConcurrently: true,
      anoncreds: new AnonCredsModule({
        registries: [new IndyVdrAnonCredsRegistry()],
        anoncreds,
      }),
      // mediationRecipient: true,
      // messagePickup: true,
      // mediator: false,

      basicMessages: true,
      connections: {
        autoAcceptConnections: options.autoAcceptConnections,
      },
      proofs: {
        autoAcceptProofs: options.autoAcceptProofs,
        proofProtocols: [
          new DidCommProofV1Protocol({
            indyProofFormat: legacyIndyProofFormatService,
          }),
          new DidCommProofV2Protocol({
            proofFormats: [legacyIndyProofFormatService, new AnonCredsDidCommProofFormatService()],
          }),
        ],
      },
      credentials: {
        autoAcceptCredentials: options.autoAcceptCredentials,
        credentialProtocols: [
          new DidCommCredentialV1Protocol({
            indyCredentialFormat: legacyIndyCredentialFormatService,
          }),
          new DidCommCredentialV2Protocol({
            credentialFormats: [legacyIndyCredentialFormatService, new AnonCredsDidCommCredentialFormatService()],
          }),
        ],
      },
    }),
    // mediator: new DidCommMediatorModule({
    //   autoAcceptMediationRequests: options.autoAcceptMediationRequests,
    // }),
    dids: new DidsModule({
      registrars: [new KeyDidRegistrar(), new JwkDidRegistrar(), new PeerDidRegistrar()],
      resolvers: [new WebDidResolver(), new KeyDidResolver(), new JwkDidResolver(), new PeerDidResolver()],
    }),
    // TODO: Fix the OID4VC changes for version update
    // openid4vc: new OpenId4VcModule({
    //   issuer: {
    //     baseUrl:
    //       process.env.NODE_ENV === 'PROD'
    //         ? `https://${require('APP_URL')}/oid4vci`
    //         : `${require('AGENT_HTTP_URL')}/oid4vci`,

    //     statefulCredentialOfferExpirationInSeconds: Number(process.env.OID4VCI_CRED_OFFER_EXPIRY) || 3600,
    //     accessTokenExpiresInSeconds: Number(process.env.OID4VCI_ACCESS_TOKEN_EXPIRY) || 3600,
    //     authorizationCodeExpiresInSeconds: Number(process.env.OID4VCI_AUTH_CODE_EXPIRY) || 3600,
    //     cNonceExpiresInSeconds: Number(process.env.OID4VCI_CNONCE_EXPIRY) || 3600,
    //     dpopRequired: false,
    //     // credentialRequestToCredentialMapper: ({ issuanceSession, holderBinding, credentialConfiguration }) => {
    //     //         const credentials = issuanceSession.issuanceMetadata
    //     //           ?.credentials as OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions[]
    //     //         if (!credentials) throw new Error('Not implemented')

    //     //   const requestedIds = credentialConfiguration.map((c) => c.id).filter((id): id is string => id !== undefined)
    //     //         const firstCredential = credentials.find((c) => requestedIds.includes(c.credentialSupportedId))
    //     //         if (!firstCredential) throw new Error('Not implemented')

    //     //         if (firstCredential.format === 'vc+sd-jwt') {
    //     //           return {
    //     //             format: 'vc+sd-jwt',
    //     //             issuer: firstCredential.issuer,
    //     //             holder: holderBinding,
    //     //             payload: firstCredential.payload,
    //     //             // Type in credo is wrong
    //     //             // eslint-disable-next-line @typescript-eslint/no-explicit-any
    //     //             disclosureFrame: firstCredential.disclosureFrame as any,
    //     //             hashingAlgorithm: 'sha-256',
    //     //           } as unknown as OpenId4VciSignSdJwtCredentials
    //     //         }

    //     //         throw new Error('Not implemented')
    //     //       },
    //     credentialRequestToCredentialMapper: ({ issuanceSession, holderBinding, credentialConfiguration }) => {
    //       throw new Error('Not implemented')
    //     }
    //   }
    // })
  }

  const modules: typeof baseModules & {
    tenants?: TenantsModule<typeof baseModules>
    indyVdr?: IndyVdrModule
    cheqd?: CheqdModule
  } = baseModules

  if (options.multiTenant) {
    modules.tenants = new TenantsModule({
      sessionLimit: Infinity,
    })
  }

  // Register indy module and related resolvers/registrars
  if (options.indyLedgers) {
    modules.indyVdr = new IndyVdrModule({
      indyVdr,
      networks: options.indyLedgers,
    })
    modules.dids.config.addRegistrar(new IndyVdrIndyDidRegistrar())
    modules.dids.config.addResolver(new IndyVdrIndyDidResolver())
    modules.dids.config.addResolver(new IndyVdrSovDidResolver())
    modules.anoncreds.config.registries.push(new IndyVdrAnonCredsRegistry())
  }

  // Register cheqd module and related resolvers/registrars
  // TODO: Fix this issue
  if (options.cheqdLedgers) {
    modules.cheqd = new CheqdModule(options.cheqdLedgers)
    modules.dids.config.addRegistrar(new CheqdDidRegistrar())
    modules.dids.config.addResolver(new CheqdDidResolver())
    modules.anoncreds.config.registries.push(new CheqdAnonCredsRegistry())
  }

  return modules
}
