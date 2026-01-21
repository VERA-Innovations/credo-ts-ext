import type { AgentInfo, CursorBody } from './AgentControllerTypes'

import { Body, Controller, Example, Get, Post, Request, Route, Security, Tags } from 'tsoa'
import { injectable } from 'tsyringe'

import type { RequestWithAgent, RequestWithRootAgent } from '../../tenantMiddleware'

import { agentInfoExample } from './AgentControllerExamples'
import { recordToCursor } from "@credo-ts/core"

@Tags('Agent')
@Route('/agent')
@injectable()
export class AgentController extends Controller {
  /**
   * Retrieve basic agent information
   */
  @Get('/')
  @Security('tenants', ['default'])
  @Example(agentInfoExample)
  public async getAgentInfo(@Request() request: RequestWithRootAgent): Promise<AgentInfo> {
    // We want to strip some properties from the config
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { agentDependencies, logger, ...config } = request.user.agent.config.toJSON()

    return {
      config,
      isInitialized: request.user.agent.isInitialized,
    }
  }

  /**
     * Convert record to cursor
     */
    @Post('/recordToCursor')
    @Security('tenants', ['tenant', 'default'])
    public async recordToCursor(
      @Request() request: RequestWithAgent,
      @Body() body: CursorBody
    ) {
      const cursor = recordToCursor(body)
  
      return {
        cursor
      }
    }
}
