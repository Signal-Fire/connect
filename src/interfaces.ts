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
