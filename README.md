# Signal Fire Connect

Connect is a slim client for [Signal Fire Server](https://github.com/signal-fire/server).

## Install

```
> npm i @signal-fire/connect
```

## Example

This example uses [Signal Fire Peer](https://github.com/signal-fire/peer), a small wrapper
around the native `RTCPeerConnection` which makes life easier.

```typescript
import Connect, {
  ConnectInit,
  IncomingDescriptionEvent,
  IncomingICECanidateEvent
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

peer.addEventListener('offer', ({ detail: offer }: OfferEvent) => {
  // send the offer to the remote peer through the signaling server
  connect.sendOffer(target, offer).catch((err: Error) => { /* ... */ })
})

peer.addEventListener('answer', ({ detail: answer }: AnswerEvent) => {
  // send the answer to the remote peer through the signaling server
  connect.sendAnswer(target, answer).catch((err: Error) => { /* ... */ })
})

peer.addEventListener('icecandidate', ({ candidate }: ICECandidateEvent) => {
  if (candidate) {
    // send the ICE candidate to the remote peer through the signaling server
    connect.sendICECandidate(target, candidate).catch((err: Error) => { /* ... */ })
  }
})

// Listen for incoming session descriptions
connect.addEventListener('description', ({ detail: { origin, description } }: IncomingDescriptionEvent) => {
  if (origin === target) {
    if (description.type === 'offer') {
      peer.handleIncomingOffer(description)
    } else if (description.type === 'answer') {
      peer.handleIncomingAnswer(description)
    }
  }
})

// Listen to incoming ICE candidates
connect.addEventListener('icecandidate', ({ detail: { origin, candidate } }: IncomingICECandidateEvent) => {
  if (origin === target) {
    peer.handleIncomingICECandidate(candidate)
  }
})
```

## License

Copyright 2021 Michiel van der Velde.

This software is licensed under [the MIT License](LICENSE).
