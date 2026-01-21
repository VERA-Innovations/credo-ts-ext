/**
 * JSON object that can contain any key-value pairs
 */
export interface AnyJsonObject extends Record<string, unknown> {}

/**
 * @example "821f9b26-ad04-4f56-89b6-e2ef9c72b36e"
 */
export type RecordId = string

/**
 * @example "ea4e5e69-fc04-465a-90d2-9f8ff78aa71d"
 */
export type ThreadId = string

/**
 * @description Create the cursor using the '/agent/recordToClass' endpoint. This internally uses the 'recordToCursor' function exported by '@credo-ts/core'
 *
 * @example "eyJjcmVhdGVkQXQiOiIyMDI2LTAxLTIwVDEzOjQ4OjUxLjc0MVoiLCJpZCI6IjViZmVhZjAyLTgxMzQtNDM1OC04NDg1LTE2M2MwZDdmZTgyYyJ9"
 */
export type Cursor = string



/**
 * Base record model for Credo
 */
export interface CredoBaseRecord {
  id: RecordId
  createdAt: Date
  updatedAt?: Date
  type: string
}
