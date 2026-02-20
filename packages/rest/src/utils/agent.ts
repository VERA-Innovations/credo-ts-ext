// import type { OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions } from '../controllers/openid4vc/issuance-sessions/OpenId4VcIssuanceSessionsControllerTypes'
import type { CredoDrizzleStorageConfigOptions, CredoRestAgentConfig } from '../setup/CredoRestConfig.js'
import type { AnonCredsRegistry } from '@credo-ts/anoncreds'
import type { AskarPostgresConfig, AskarPostgresCredentials, AskarPostgresStorageConfig } from '@credo-ts/askar'
import type { CheqdModuleConfigOptions } from '@credo-ts/cheqd'
import type { DidCommAutoAcceptCredential, DidCommAutoAcceptProof } from '@credo-ts/didcomm'
import type { TenantAgent } from '@credo-ts/tenants'

import {
  AnonCredsDidCommCredentialFormatService,
  AnonCredsDidCommProofFormatService,
  AnonCredsModule,
  LegacyIndyDidCommCredentialFormatService,
  LegacyIndyDidCommProofFormatService,
  DidCommCredentialV1Protocol,
  DidCommProofV1Protocol,
} from '@credo-ts/anoncreds'
import { AskarModule } from '@credo-ts/askar'
import { CheqdModule, CheqdDidRegistrar, CheqdDidResolver, CheqdAnonCredsRegistry } from '@credo-ts/cheqd'
import { type Agent } from '@credo-ts/core'
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
import { DidCommCredentialV2Protocol, DidCommModule, DidCommProofV2Protocol } from '@credo-ts/didcomm'
import {
  IndyVdrAnonCredsRegistry,
  IndyVdrIndyDidRegistrar,
  IndyVdrIndyDidResolver,
  IndyVdrModule,
  IndyVdrSovDidResolver,
  type IndyVdrPoolConfig,
} from '@credo-ts/indy-vdr'
import { TenantsModule } from '@credo-ts/tenants'
import { anoncreds } from '@hyperledger/anoncreds-nodejs'
// eslint-disable-next-line import/order
import { indyVdr } from '@hyperledger/indy-vdr-nodejs'

// import type { OpenId4VcIssuanceSessionCreateOfferSdJwtCredentialOptions } from '../controllers/openid4vc/issuance-sessions/OpenId4VcIssuanceSessionsControllerTypes'
import { askarNodeJS } from '@openwallet-foundation/askar-nodejs'


import { getAskarDatabaseConfig, getDrizzleDatabaseConfig } from './util'
import { DrizzleStorageModule } from '@credo-ts/drizzle-storage'
import { coreBundle } from '@credo-ts/drizzle-storage/core'
import { actionMenuBundle } from '@credo-ts/drizzle-storage/action-menu'
import { anoncredsBundle } from '@credo-ts/drizzle-storage/anoncreds'
import { didcommBundle } from '@credo-ts/drizzle-storage/didcomm'
import { tenantsBundle } from '@credo-ts/drizzle-storage/tenants'
import { questionAnswerBundle } from '@credo-ts/drizzle-storage/question-answer'
import { mediaSharingBundle } from '@credo-ts/drizzle-storage/media-sharing'
import { userProfileBundle } from '@credo-ts/drizzle-storage/user-profile'
import { privateMediaSharingBundle } from '@credo-ts/drizzle-storage/private-media-sharing'

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
  credoConfig: Pick<CredoRestAgentConfig, 'walletConfig' | 'label' | 'endpoints' | 'extraModules'>
  drizzleStorageConfigOptions?: CredoDrizzleStorageConfigOptions
  drizzleStorageEnable: boolean
  // baseUrl: string
}) {
  const legacyIndyCredentialFormatService = new LegacyIndyDidCommCredentialFormatService()
  const legacyIndyProofFormatService = new LegacyIndyDidCommProofFormatService()

  // Normalize drizzle enable/disabled
  options.drizzleStorageEnable
  ? (options.drizzleStorageEnable = options.drizzleStorageEnable)
    : options.drizzleStorageConfigOptions
    ? (options.drizzleStorageEnable = true)
    : (options.drizzleStorageEnable = false)

  // const baseUrlWithoutSlash = options.baseUrl.endsWith('/') ? options.baseUrl.slice(0, -1) : options.baseUrl

  const baseModules = {
    anoncreds: new AnonCredsModule({
      registries: (options.extraAnonCredsRegistries ?? []) as [AnonCredsRegistry],// ToDO: fix this
      anoncreds,
    }),
    askar: new AskarModule({
      askar: askarNodeJS,
      // multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.ProfilePerWallet,
      store: {
        id: options.credoConfig.walletConfig.id,
        key: options.credoConfig.walletConfig.key,
        // TODO: Do we need to handle scenario where 'sqlite-path' and 'sqlite-in-memory' for 'db-type'
        database: getAskarDatabaseConfig({
          'db-type': options.credoConfig.walletConfig.database?.type,
          'postgres-host': (options.credoConfig.walletConfig.database?.config as AskarPostgresConfig)?.host,
          'postgres-username': (
            (options.credoConfig.walletConfig.database as AskarPostgresStorageConfig)
              ?.credentials as AskarPostgresCredentials
          )?.account,
          'postgres-password': (
            (options.credoConfig.walletConfig.database as AskarPostgresStorageConfig)
              ?.credentials as AskarPostgresCredentials
          )?.password,
        }),
      },
      // Triage: Probably we'll need to not be completely dependent of the explicit flag, instead also check the availability of the drizzle config options
      enableStorage: !options.drizzleStorageEnable
    }),
    didcomm: new DidCommModule({
      endpoints: options.credoConfig.endpoints ?? [],
      processDidCommMessagesConcurrently: true,
      mediationRecipient: true,
      messagePickup: true,
      mediator: false,
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
    drizzleStorage?: DrizzleStorageModule
  } = baseModules

  if (options.multiTenant) {
    modules.tenants = new TenantsModule({
      sessionLimit: Infinity,
    })
  }

  if (options.drizzleStorageEnable) {
    if (options.drizzleStorageConfigOptions) {
      modules.drizzleStorage = new DrizzleStorageModule({
        bundles: [coreBundle, didcommBundle, actionMenuBundle, anoncredsBundle, tenantsBundle, questionAnswerBundle, mediaSharingBundle, userProfileBundle, privateMediaSharingBundle],
        database: getDrizzleDatabaseConfig(options.drizzleStorageConfigOptions).database,
        // TODO: Make this dynamic
        enableEncryption: true,
        encryptionKey: 'test-encryption-key-for-drizzle-storage-connection-tests',
        encryptedColumns: {
          // Map the Record Class name to the columns we want encrypted
          'DidCommConnectionRecord': ['alias', 'imageUrl', 'theirLabel'],
        }
      })
    } else {
      throw new Error("Drizzle storage configuration is required when drizzleStorageEnable is true.")
    }
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
  if (options.cheqdLedgers) {
    modules.cheqd = new CheqdModule(options.cheqdLedgers)
    modules.dids.config.addRegistrar(new CheqdDidRegistrar())
    modules.dids.config.addResolver(new CheqdDidResolver())
    modules.anoncreds.config.registries.push(new CheqdAnonCredsRegistry())
  }

  return modules
}
