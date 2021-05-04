import { nanoid } from 'nanoid'

export type IncomingDescriptionEvent = CustomEvent<{ origin: string, description: RTCSessionDescription }>
export type IncomingICECandidateEvent = CustomEvent<{ origin: string, candidate: RTCIceCandidate }>

export type ConnectionState = 'new'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closing'
  | 'closed'

export type ConnectInit = {
  reconnectOnClose?: boolean,
  reconnectOnError?: boolean,
  reconnectInterval?: number,
  reconnectAttempts?: number,
  urlTransform?: (previousUrl: string) => string | Promise<string>
}

export interface Request {
  id?: string,
  cmd: string,
  target: string,
  data: {
    offer?: RTCSessionDescription,
    answer?: RTCSessionDescription,
    candidate?: RTCIceCandidate
  }
}

export interface IncomingRequest extends Request {
  origin: string
}

export interface ServerResponse {
  id: string,
  ok: boolean,
  data?: {
    message: string
  }
}

export const PROTOCOL = 'Signal-Fire@3'

function isServerResponse (message: any): message is ServerResponse {
  return typeof message.ok === 'boolean'
}

function isIncomingRequest (message: any): message is IncomingRequest {
  return typeof message.origin === 'string'
}

const defaultInit: Required<ConnectInit> = {
  reconnectOnClose: false,
  reconnectOnError: true,
  reconnectInterval: 2500,
  reconnectAttempts: 5,
  urlTransform: previousUrl => previousUrl
}

export default class Connect extends EventTarget {
  public readonly id?: string
  public readonly connectionState: ConnectionState = 'new'
  public readonly configuration: RTCConfiguration = {}

  public readonly reconnectOnClose: boolean
  public readonly reconnectOnError: boolean
  public readonly reconnectInterval: number
  public readonly reconnectAttempts: number
  public readonly urlTransform: (previousUrl: string) => string | Promise<string>

  private socket: WebSocket | null = null
  private readonly pendingRequests: Set<() => void> = new Set()
  private readonly pendingResponses: Map<string, (response: ServerResponse) => void> = new Map()

  private hadError = false
  private reconnectAttemptsMade = 0
  private reconnectTimeout?: number
  private previousUrl?: string

  public constructor (init: ConnectInit = {}) {
    super()

    const {
      reconnectOnClose,
      reconnectOnError,
      reconnectInterval,
      reconnectAttempts,
      urlTransform
    } = { ...defaultInit, ...init }

    this.reconnectOnClose = reconnectOnClose
    this.reconnectOnError = reconnectOnError
    this.reconnectInterval = reconnectInterval
    this.reconnectAttempts = reconnectAttempts
    this.urlTransform = urlTransform
  }

  public async connect (url: string): Promise<void> {
    if (![ 'new', 'closed', 'reconnecting' ].includes(this.connectionState)) {
      throw new Error(`invalid connection state: ${this.connectionState}`)
    } else if (this.socket) {
      throw new Error('socket exists')
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = undefined
    }

    this.setConnectionState('connecting')

    return new Promise<void>((resolve, reject) => {
      const removeListeners = () => {
        socket.removeEventListener('open', handleOpen)
        socket.removeEventListener('message', handleMessage)
        socket.removeEventListener('error', handleError)
        socket.removeEventListener('close', handleClose)
      }

      const handleOpen = () => {
        if (socket.protocol !== PROTOCOL) {
          removeListeners()
          socket.close(1002, 'invalid protocol')
          this.setConnectionState('closed')
          reject(new Error(
            `invalid protocol: expected ${PROTOCOL} but got ${socket.protocol ?? 'none'}`
          ))
        }
      }

      const handleMessage = ({ data }: MessageEvent<any>) => {
        if (typeof data !== 'string') {
          removeListeners()
          socket.close(1003, 'expected a string')
          this.setConnectionState('closed')
          reject(new Error('expected a string'))
          return
        }

        let message: any

        try {
          message = JSON.parse(data)
        } catch (e) {
          removeListeners()
          socket.close(1003, 'unable to parse message')
          this.setConnectionState('closed')
          reject(new Error('unable to parse message'))
          return
        }

        if (message.cmd !== 'welcome') {
          removeListeners()
          socket.close(1003, 'expected welcome message')
          this.setConnectionState('closed')
          reject(new Error('expected welcome message'))
          return
        }

        removeListeners()
        const { id, configuration } = message.data
        this.previousUrl = url
        this.reconnectAttemptsMade = 0
        this.hadError = false
        this.handleOpen(socket, id, configuration)
        resolve()
      }

      const handleError = () => {
        removeListeners()
        this.setConnectionState('closed')
        reject(new Error('socket error'))
      }

      const handleClose = ({ code, reason }: CloseEvent) => {
        removeListeners()
        this.setConnectionState('closed')
        reject(new Error(
          `socket closed unexpectedly with code ${code} (${reason ?? 'no reason'})`
        ))
      }

      const socket = new WebSocket(url, PROTOCOL)

      socket.addEventListener('open', handleOpen)
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('error', handleError)
      socket.addEventListener('close', handleClose)
    })
  }

  public async close (code?: number, reason?: string): Promise<void> {
    if (!this.socket) {
      return
    }

    return new Promise<void>(resolve => {
      this.socket?.addEventListener('close', () => resolve, { once: true })
      this.socket?.close(code, reason)
    })
  }

  /**
   * Send an offer to the remote peer.
   * @param target The target ID
   * @param offer The session description representing the offer
   */
  public async sendOffer (target: string, offer: RTCSessionDescription): Promise<void> {
    return this.sendDescription(target, offer)
  }

  /**
   * Send an answer to the remote peer.
   * @param target The target ID
   * @param answer The session description representing the answer
   */
  public async sendAnswer (target: string, answer: RTCSessionDescription): Promise<void> {
    return this.sendDescription(target, answer)
  }

  /**
   * Send a session description to the remote peer.
   * @param target The target ID
   * @param description The session description
   */
  public async sendDescription (target: string, description: RTCSessionDescription): Promise<void> {
    if (![ 'offer', 'answer' ].includes(description.type)) {
      throw new Error(`unsupported session description type: ${description.type}`)
    }

    const response = await this.request({
      cmd: description.type,
      target,
      data: {
        [description.type]: description
      }
    })

    if (!response.ok && response.data) {
      throw new Error(response.data.message)
    }
  }

  /**
   * Send an ICE candidate to the remote peer.
   * @param target The target ID
   * @param candidate The ICE candidate
   */
  public async sendICECandidate (target: string, candidate: RTCIceCandidate): Promise<void> {
    const response = await this.request({
      cmd: 'ice',
      target,
      data: { candidate }
    })

    if (!response.ok && response.data) {
      throw new Error(response.data.message)
    }
  }

  /**
   * Send a request to the server.
   * @returns The server response
   */
  public async request (request: Request): Promise<ServerResponse> {
    if (this.connectionState !== 'connected') {
      // Wait for when the connection is open again
      // TODO: implement an (optional) timeout
      await new Promise<void>(resolve => {
        this.pendingRequests.add(resolve)
      })
    }

    const id = request.id = request.id ?? nanoid()
    return new Promise<ServerResponse>(resolve => {
      this.pendingResponses.set(id, resolve)
      this.socket?.send(JSON.stringify(request))
    })
  }

  private handleOpen (socket: WebSocket, id: string, configuration: RTCConfiguration): void {
    this.socket = socket
    // @ts-expect-error
    this.id = id
    // @ts-expect-error
    this.configuration = configuration ?? {}

    socket.addEventListener('error', this.handleErrorEvent)
    socket.addEventListener('message', this.handleMessageEvent)
    socket.addEventListener('close', this.handleCloseEvent)

    this.setConnectionState('connected')
  }

  private handleErrorEvent (): void {
    this.hadError = true
  }

  private handleMessageEvent({ data }: MessageEvent<any>) {
    if (typeof data !== 'string') {
      this.dispatchEvent(new CustomEvent<Error>('error', {
        detail: new Error('expected a string')
      }))
      return
    }

    let message: ServerResponse | IncomingRequest

    try {
      message = JSON.parse(data)
    } catch (e) {
      this.dispatchEvent(new CustomEvent<Error>('error', {
        detail: new Error('unable to parse message')
      }))
      return
    }

    if (isServerResponse(message)) {
      const resolve = this.pendingResponses.get(message.id)

      if (resolve) {
        this.pendingResponses.delete(message.id)
        resolve(message)
      }

      return
    }

    if (isIncomingRequest(message)) {
      if (!message.cmd) {
        this.dispatchEvent(new CustomEvent<Error>('error', {
          detail: new Error('expected cmd to be specified')
        }))
        return
      }

      switch (message.cmd) {
        case 'offer':
          this.dispatchEvent(new CustomEvent<{ origin: string, description: RTCSessionDescription }>('description', {
            detail: { origin: message.origin, description: message.data.offer as RTCSessionDescription }
          }))
          break
        case 'answer':
          this.dispatchEvent(new CustomEvent<{ origin: string, description: RTCSessionDescription }>('description', {
            detail: { origin: message.origin, description: message.data.answer as RTCSessionDescription }
          }))
          break
        case 'ice':
          this.dispatchEvent(new CustomEvent<{ origin: string, candidate: RTCIceCandidate }>('icecandidate', {
            detail: { origin: message.origin, candidate: message.data.candidate as RTCIceCandidate }
          }))
          break
        default:
          this.dispatchEvent(new CustomEvent(message.cmd, {
            detail: message
          }))
          break
      }
    }
  }

  private handleCloseEvent (): void {
    if (!this.socket) {
      return
    }

    this.socket.removeEventListener('error', this.handleErrorEvent)
    this.socket.removeEventListener('message', this.handleMessageEvent)
    this.socket.removeEventListener('close', this.handleCloseEvent)

    this.socket = null

    if (this.reconnectOnClose || (this.hadError && this.reconnectOnError)) {
      this.reconnectTimeout = setTimeout(() => {
        this.handleReconnect()
      }, this.reconnectInterval)
    }
  }

  private async handleReconnect (): Promise<void> {
    this.setConnectionState('reconnecting')

    try {
      const urlTransform = this.urlTransform(this.previousUrl as string)
      const url = urlTransform instanceof Promise ? await urlTransform : urlTransform

      try {
        await this.connect(url)
      } catch (e) {
        this.setConnectionState('closed')
        this.reconnectAttemptsMade++

        if (this.reconnectAttemptsMade > this.reconnectAttempts) {
          this.dispatchEvent(new CustomEvent<Error>('error', {
            detail: new Error('exceeded maximum reconnect attempts')
          }))
          return
        }

        this.reconnectTimeout = setTimeout(() => {
          this.handleReconnect()
        }, this.reconnectInterval)
      }
    } catch (e) {
      this.setConnectionState('closed')
      e.message = `unable to transform url: ${e.message}`
      this.dispatchEvent(new CustomEvent<Error>('error', {
        detail: e
      }))
    }
  }

  private setConnectionState (connectionState: ConnectionState): void {
    if (this.connectionState === connectionState) {
      return
    }

    // @ts-expect-error
    this.connectionState = connectionState

    this.dispatchEvent(new Event(connectionState))
    this.dispatchEvent(new Event('connectionstatechange'))

    if (connectionState === 'connected' && this.pendingRequests.size) {
      // Process pending requests
      for (const resolve of this.pendingRequests) {
        resolve()
      }
    }
  }
}
