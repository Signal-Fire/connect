# Signal Fire Connect

Signal-Fire Connect is a low-level __WebRTC signaling client__ for
[Signal Fire Server](https://github.com/signal-fire/server), a WebRTC
signaling server for node.js.

A WebRTC signaling server communicates between peers to set up peer-to-peer audio/video and/or data channels. This allows your clients to communicate directly with each other.

## Install

```
> npm i @signal-fire/connect
```

## Features

* Works __seamlessly__ with [Signal Fire Server](https://github.com/signal-fire/server)
* Connect uses vanilla __WebSockets__ and a __JSON__ protocol
* Automatically __reconnect__ on close or error
* Buffers outgoing requests until the connection has been established
* Dispatches `description` events on incoming session descriptions
* Dispatches `icecandidate` events on incoming ICE candidates
* Send session descriptions and ICE candidates to a remote peer

## Example

```typescript
import Connect, {
  ConnectSessionDescriptionEvent,
  ConnectIceCandidateEvent
} from '@signal-fire/connect'

const connect = new Connect({
  /** Whether or not to reconnect after a normal close. */
  reconnectOnClose: false,
  /** Whether to reconnect after an error close. */
  reconnectOnError: true,
  /** Interval to wait between reconnect attempts. */
  reconnectInterval: 2500,
  /** Maximum number of reconnect attempts. */
  reconnectAttempts: 5,
  /** Function to transform the URL upon reconnecting. */
  urlTransform: previousUrl => previousUrl
})

// Connect to the signalling server
await connect.connect('wss://webrtc.example.com')

// Create a new connection
const target = '<target id>'
const connection = new RTCPeerConnection()

connection.addEventListener('negotiationneeded', async () => {
  const offer = await connection.createOffer()
  await connection.setLocalDescription(offer)

  // Send the session description to the remote peer
  await connect.sendDescription(target, connection.localDescription)
})

connection.addEventListener('icecandidate', async (ev: RTCIceCandidateEvent) => {
  if (ev.candidate) {
    // Send the ICE candidate to the remote peer
    await connect.sendIceCandidate(target, ev.candidate)
  }
})

// Listen for incoming session descriptions
connect.addEventListener('description', async (ev: ConnectSessionDescriptionEvent) => {
  const { origin, description } = ev

  if (origin !== target) {
    return
  }

  if (description.type === 'offer') {
    await connection.setRemoteDescription(description)
    const answer = await connection.createAnswer()
    await connection.setLocalDescription(answer)

    // Send the session description to the remote peer
    await connect.sendDescription(target, connection.localDescription)
  } else if (description.type === 'answer') {
    await connection.setRemoteDescription(description)
  }
})

// Listen for incoming ICE candidates
connect.addEventListener('icecandidate', async (ev: ConnectIceCandidateEvent) => {
  const { origin, candidate } = ev

  if (origin !== target) {
    return
  }

  await connection.addIceCandidate(ev.candidate)
})
```

## Questions

### I'm getting the following error

You may get the following (or similar) error:

```
Argument of type '(event: ConnectSessionDescriptionEvent) => void' is not assignable to parameter of type 'EventListenerOrEventListenerObject'
```

This is an open issue with TypeScript, see [Microsoft/TypeScript#28357](https://github.com/Microsoft/TypeScript/issues/28357). See the issue thread for possible temporary solutions.

## License

Copyright 2021 Michiel van der Velde.

This software is licensed under [the MIT License](LICENSE).
