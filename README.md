# Signal Fire Connect

Connect is a slim client for [Signal Fire Server](https://github.com/signal-fire/server).

> Connect is a **work-in-progress** and as such is not yet published to npm.
> If you wish to take a crack at it, clone the respository.

## Example

This example uses [Signal Fire Peer](https://github.com/signal-fire/peer).

```typescript
import Connect, { IncomingOfferEvent, IncomingAnswerEvent, IncomingICECanidateEvent } from './index'
import Peer, { OfferEvent, AnswerEvent, ICECandidateEvent } from '@signal-fire/peer'

const connect = new Connect()

// Connect to the signaling server
await connect.connect('wss://rtc.example.com')

// Create a new peer
const target = '<target id>'
const connection = new RTCPeerConnection()
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

// Listen to incoming offers
connect.addEventListener('offer', ({ detail: { origin, offer } }: IncomingOfferEvent) => {
  if (origin === target) {
    peer.handleIncomingOffer(offer)
  }
})

// Listen to incomging answers
connect.addEventListener('answer', ({ detail: { origin, answer } }: IncomingAnswerEvent) => {
  if (origin === target) {
    peer.handleIncomingAnswer(offer)
  }
})

// Listen to incoming ICE candidates
connect.addEventListener('ice', ({ detail: { origin, candidate } }: IncomingICECandidateEvent) => {
  if (origin === target) {
    peer.handleIncomingICECandidate(candidate)
  }
})
```

## License

Copyright 2021 Michiel van der Velde.

This software is licensed under [the MIT License](LICENSE).
