import type {
  ServerResponse,
  IncomingRequest
} from './interfaces'

export function isServerResponse (message: any): message is ServerResponse {
  return typeof message.ok === 'boolean'
}

export function isIncomingRequest (message: any): message is IncomingRequest {
  return typeof message.origin === 'string'
}
