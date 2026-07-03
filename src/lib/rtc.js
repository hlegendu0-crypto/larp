// WebRTC 1v1 поверх собственного сигналинга (этап 3, ТЗ §9).
// Perfect negotiation: обе стороны могут инициировать, коллизии разруливаются
// ролями polite/impolite, выданными сервером при матче.

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export function createPeer({ localStream, polite, sendSignal, onRemoteStream, onState }) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))

  pc.ontrack = (e) => {
    if (e.streams[0]) onRemoteStream(e.streams[0])
  }
  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal({ candidate: e.candidate })
  }
  pc.onconnectionstatechange = () => onState?.(pc.connectionState)

  let makingOffer = false
  let ignoreOffer = false

  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true
      await pc.setLocalDescription()
      sendSignal({ description: pc.localDescription })
    } catch {
      /* peer закрыт */
    } finally {
      makingOffer = false
    }
  }

  async function handleSignal({ description, candidate }) {
    try {
      if (description) {
        const collision = description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable')
        ignoreOffer = !polite && collision
        if (ignoreOffer) return
        await pc.setRemoteDescription(description)
        if (description.type === 'offer') {
          await pc.setLocalDescription()
          sendSignal({ description: pc.localDescription })
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate)
        } catch (e) {
          if (!ignoreOffer) throw e
        }
      }
    } catch {
      /* сигнал для уже закрытого соединения */
    }
  }

  return { pc, handleSignal, close: () => pc.close() }
}
