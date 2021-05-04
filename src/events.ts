/** Represents an incoming session description event. */
export class ConnectSessionDescriptionEvent extends Event {
  public readonly origin: string
  public readonly description: RTCSessionDescription

  public constructor (origin: string, description: RTCSessionDescription) {
    super('description')
    this.origin = origin
    this.description = description
  }
}

/** Represents an incoming ICE candidate event. */
export class ConnectIceCandidateEvent extends Event {
  public readonly origin: string
  public readonly candidate: RTCIceCandidate

  public constructor (origin: string, candidate: RTCIceCandidate) {
    super('icecandidate')
    this.origin = origin
    this.candidate = candidate
  }
}
