import { nanoid } from 'nanoid'

export type IncomingOfferEvent = CustomEvent<{ origin: string, offer: RTCSessionDescription }>
export type IncomingAnswerEvent = CustomEvent<{ origin: string, answer: RTCSessionDescription }>
export type IncomingICECandidateEvent = CustomEvent<{ origin: string, candidate: RTCIceCandidate }>

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

function isServerResponse (message: any): message is ServerResponse {
  return typeof message.ok === 'boolean'
}

function isIncomingRequest (message: any): message is IncomingRequest {
  return typeof message.origin === 'string'
}

export type ConnectionState = 'new'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closing'
  | 'closed'

export type ConnectInit = {
  reconnectOnClose?: boolean
  reconnectOnError?: boolean
  reconnectInterval?: number
  reconnectAttempts?: number
  urlTransform?: (previousUrl: string) => string | Promise<string>
  configuration?: RTCConfiguration
}

const defaultInit: Required<ConnectInit> = {
  reconnectOnClose: false,
  reconnectOnError: true,
  reconnectInterval: 2000,
  reconnectAttempts: 2,
  urlTransform: previousUrl => previousUrl,
  configuration: {}
}

export const PROTOCOL = 'Signal-Fire@3'

export default class Connect extends EventTarget {
  public readonly id?: string
  public readonly connectionState: ConnectionState = 'new'
  public readonly configuration: RTCConfiguration
  private socket: WebSocket | null = null
  private hadError = false
  private readonly pendingRequests: Map<string, (response: ServerResponse) => void> = new Map()
  private readonly config: Required<ConnectInit>
  private previousUrl?: string
  private reconnectAttempts = 0

  public constructor (init: ConnectInit = {}) {
    super()
    this.config = { ...defaultInit, ...init }
    this.configuration = this.config.configuration
  }

  public async connect (url: string): Promise<void> {
    if (this.socket) {
      throw new Error('socket already created')
    }

    // @ts-expect-error
    this.connectionState = 'connecting'

    return new Promise<void>((resolve, reject) => {
      const removeListeners = () => {
        socket.addEventListener('open', handleOpen)
        socket.removeEventListener('message', handleMessage)
        socket.removeEventListener('error', handleError)
        socket.removeEventListener('close', handleClose)
      }

      const handleOpen = () => {
        if (socket.protocol !== PROTOCOL) {
          removeListeners()
          socket.close(1003, 'Invalid protocol')
          reject(new Error(`expected protocol ${PROTOCOL} but got ${socket.protocol ?? 'none'}`))
        }
      }

      const handleMessage = ({ data }: MessageEvent<any>) => {
        removeListeners()

        if (typeof data !== 'string') {
          reject(new Error('expected a string message'))
          return
        }

        let message: any

        try {
          message = JSON.parse(data)
        } catch (e) {
          reject(new Error('unable to parse message'))
          return
        }

        if (message.cmd !== 'welcome') {
          reject(new Error('expected welcome message'))
          return
        }

        if (!message.data.id) {
          reject(new Error('expected welcome message to have our id'))
          return
        }

        if (message.data.configuration) {
          // @ts-expect-error
          this.configuration = {
            ...this.configuration,
            ...message.data.configuration
          }
        }

        this.previousUrl = url
        this.handleConnected(message.data.id, socket)
        resolve()
      }

      const handleError = (ev: any) => {
        removeListeners()
        reject(ev.error ?? ev)
      }

      const handleClose = (ev: CloseEvent) => {
        removeListeners()
        reject(new Error(`socket closed unexpectedly with code ${ev.code} (${ev.reason ?? 'no reason'})`))
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

    // @ts-expect-error
    this.connectionState = 'closing'

    return new Promise<void>(resolve => {
      this.addEventListener('close', () => resolve(), { once: true })
      this.socket?.close(code, reason)
    })
  }

  public async sendOffer (target: string, offer: RTCSessionDescription): Promise<void> {
    const response = await this.request({
      cmd: 'offer',
      target,
      data: { offer }
    })

    if (!response.ok) {
      throw new Error(response.data?.message)
    }
  }

  public async sendAnswer (target: string, answer: RTCSessionDescription): Promise<void> {
    const response = await this.request({
      cmd: 'answer',
      target,
      data: { answer }
    })

    if (!response.ok) {
      throw new Error(response.data?.message)
    }
  }

  public async sendICECandidate (target: string, candidate: RTCIceCandidate): Promise<void> {
    const response = await this.request({
      cmd: 'ice',
      target,
      data: { candidate }
    })

    if (!response.ok) {
      throw new Error(response.data?.message)
    }
  }

  public async request (message: Request): Promise<ServerResponse> {
    const id = message.id = nanoid()
    return new Promise<ServerResponse>(resolve => {
      this.pendingRequests.set(id, resolve)
      this.socket?.send(JSON.stringify(message))
    })
  }

  private handleConnected (id: string, socket: WebSocket): void {
    // @ts-expect-error
    this.connectionState = 'connected'

    // @ts-expect-error
    this.id = id
    this.socket = socket

    socket.addEventListener('message', this.handleMessageEvent)
    socket.addEventListener('error', this.handleErrorEvent)
    socket.addEventListener('close', this.handleCloseEvent)

    this.dispatchEvent(new Event('connected'))
  }

  private handleMessageEvent ({ data }: MessageEvent<any>): void {
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
      const resolve = this.pendingRequests.get(message.id)

      if (resolve) {
        this.pendingRequests.delete(message.id)
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
          this.dispatchEvent(new CustomEvent<{ origin: string, offer: RTCSessionDescription }>('offer', {
            detail: { origin: message.origin, offer: <RTCSessionDescription>message.data.offer }
          }))
          break
        case 'answer':
          this.dispatchEvent(new CustomEvent<{ origin: string, answer: RTCSessionDescription }>('answer', {
            detail: { origin: message.origin, answer: <RTCSessionDescription>message.data.answer }
          }))
          break
        case 'ice':
          this.dispatchEvent(new CustomEvent<{ origin: string, candidate: RTCIceCandidate }>('ice', {
            detail: { origin: message.origin, candidate: <RTCIceCandidate>message.data.candidate }
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

  private handleErrorEvent (): void {
    this.hadError = true
  }

  private handleCloseEvent (ev: CloseEvent): void {
    // @ts-expect-error
    this.connectionState = 'closed'

    const socket = this.socket as WebSocket

    socket.removeEventListener('message', this.handleMessageEvent)
    socket.removeEventListener('error', this.handleErrorEvent)
    socket.removeEventListener('close', this.handleCloseEvent)

    this.socket = null

    this.dispatchEvent(new Event('closed'))

    if (this.config.reconnectAttempts > 0 && (this.config.reconnectOnClose || (this.hadError && this.config.reconnectOnError))) {
      this.hadError = false

      setTimeout(() => {
        this.handleReconnect()
      }, this.config.reconnectInterval)
    }
  }

  private async handleReconnect (): Promise<void> {
    this.reconnectAttempts++

    if (this.reconnectAttempts > this.config.reconnectAttempts) {
      this.dispatchEvent(new CustomEvent<Error>('error', {
        detail: new Error('exceeded maximum reconnect attempts')
      }))
      return
    }

    try {
      const urlTransform = this.config.urlTransform(<string>this.previousUrl)
      const url = urlTransform instanceof Promise ? await urlTransform : urlTransform

      try {
        // @ts-expect-error
        this.connectionState = 'reconnecting'
        this.dispatchEvent(new Event('reconnecting'))

        await this.connect(url)
        this.reconnectAttempts = 0
      } catch (e) {
        setTimeout(() => {
          this.handleReconnect()
        }, this.config.reconnectInterval)
      }
    } catch (e) {
      // @ts-expect-error
      this.connectionState = 'closed'
      this.dispatchEvent(new Event('closed'))

      this.dispatchEvent(new CustomEvent<Error>('error', {
        detail: new Error(`unable to reconnect: ${e.message}`)
      }))
    }
  }
}
