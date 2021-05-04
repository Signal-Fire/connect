# Signal Fire Connect

Connect is a low-level client for [Signal Fire Server](https://github.com/signal-fire/server).

## Install

```
> npm i @signal-fire/connect
```

## Features

* Connect uses vanilla __WebSockets__
* Automatically __reconnect__ on close or error
* Dispatches `description` events on incoming session descriptions
* Dispatches `icecandidate` events on incoming ICE candidates
* Send dession descriptions and ICE candidates to a remote peer

## Example

This example uses [Signal Fire Peer](https://github.com/signal-fire/peer), a small wrapper
around the native `RTCPeerConnection` which makes life easier.

```typescript
import Connect, {
  ConnectInit,
  ConnectSessionDescriptionEvent,
  ConnectIceCandidateEvent
} from '@signal-fire/connect'

import Peer, {
  OfferEvent,
  AnswerEvent,
  ICECandidateEvent
} from '@signal-fire/peer'


// Default configuration
const init: ConnectInit {
  reconnectOnClose: false,
  reconnectOnError: true,
  reconnectInterval: 2500,
  reconnectAttempts: 5,
  /** Can be used to transform the URL prior to reconnecting. */
  urlTransform: previousUrl => previousUrl,
  /** WebRTC configuration, may be overwritten by server configuration. */
  configuration: {}
}

// Create a new Connect instance
const connect = new Connect(init)

// Connect to the signaling server
await connect.connect('wss://rtc.example.com')

// Create a new peer
const target = '<target id>'
// We pass the configuration given to us by the signaling server
const connection = new RTCPeerConnection(connect.configuration)
const peer = new Peer(connection)

peer.addEventListener('offer', ({ detail: description }: OfferEvent) => {
  // send the offer to the remote peer through the signaling server
  connect.sendDescription(target, description).catch(/* ... */)
})

peer.addEventListener('answer', ({ detail: description }: AnswerEvent) => {
  // send the answer to the remote peer through the signaling server
  connect.sendDescription(target, description).catch(/* ... */)
})

peer.addEventListener('icecandidate', ({ candidate }: ICECandidateEvent) => {
  if (candidate) {
    // send the ICE candidate to the remote peer through the signaling server
    connect.sendIceCandidate(target, candidate).catch(/* ... */)
  }
})

// Listen for incoming session descriptions
connect.addEventListener('description', ({ origin, description }: ConnectSessionDescriptionEvent) => {
  if (origin === target) {
    if (description.type === 'offer') {
      peer.handleIncomingOffer(description).catch(/* ... */)
    } else if (description.type === 'answer') {
      peer.handleIncomingAnswer(description).catch(/* ... */)
    }
  }
})

// Listen to incoming ICE candidates
connect.addEventListener('icecandidate', ({ origin, candidate }: ConnectIceCandidateEvent) => {
  if (origin === target) {
    peer.handleIncomingICECandidate(candidate).catch(/* ... */)
  }
})
```

## License

Copyright 2021 Michiel van der Velde.

This software is licensed under [the MIT License](LICENSE).
